interface Env {
  DB: DatabaseBinding;
  REPORT_THRESHOLD?: string;
  SUBMIT_LIMIT_MAX?: string;
  SUBMIT_LIMIT_WINDOW_SEC?: string;
  SUBMISSION_LOG_RETENTION_DAYS?: string;
  SPECIMEN_MAX_COUNT?: string;
  SPECIMEN_TRIM_BATCH?: string;
  SPECIMEN_MIN_AGE_HOURS?: string;
}

type Json = Record<string, unknown>;
type JsonArray = unknown[];

interface DatabaseBinding {
  prepare(query: string): DatabasePreparedStatement;
}

interface DatabasePreparedStatement {
  bind(...values: unknown[]): DatabasePreparedStatement;
  run(): Promise<{ meta?: { changes?: number } }>;
  all<T = Json>(): Promise<{ results?: T[] }>;
  first<T = Json>(): Promise<T | null>;
}

type SpecimenRecord = {
  specimen_id: string;
  collector_id: string;
  poem_text: string;
  poem_preview: string;
  biome: string;
  season: string;
  score_total: number;
  score_breakdown_json: string;
  genome_json: string;
  parent_ids_json: string;
  run_hash: string | null;
  likes: number;
  reports: number;
  is_hidden: number;
  created_at: string;
};

type SubmitRateLimitResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      retryAfterSec: number;
    };

const BIOME_ALLOW = new Set([
  "garden",
  "work",
  "cosmic",
  "body",
  "harbor",
  "ritual",
]);
const SEASON_ALLOW = new Set(["spring", "summer", "autumn", "winter"]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return json(
        {
          ok: false,
          error: "not_found",
        },
        404,
      );
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, service: "shiseitaikairo-api" });
      }

      if (request.method === "GET" && url.pathname === "/api/specimens") {
        return await handleListSpecimens(url, env);
      }

      if (request.method === "POST" && url.pathname === "/api/specimens") {
        return await handleCreateSpecimen(request, env);
      }

      const detailMatch = url.pathname.match(/^\/api\/specimens\/([^/]+)$/);
      if (request.method === "GET" && detailMatch) {
        return await handleGetSpecimen(detailMatch[1], env);
      }

      const likeMatch = url.pathname.match(/^\/api\/specimens\/([^/]+)\/like$/);
      if (request.method === "POST" && likeMatch) {
        return await handleLikeSpecimen(likeMatch[1], request, env);
      }

      const reportMatch = url.pathname.match(/^\/api\/specimens\/([^/]+)\/report$/);
      if (request.method === "POST" && reportMatch) {
        return await handleReportSpecimen(reportMatch[1], request, env);
      }

      return json(
        {
          ok: false,
          error: "not_found",
        },
        404,
      );
    } catch (error) {
      console.error(error);
      return json(
        {
          ok: false,
          error: "internal_error",
        },
        500,
      );
    }
  },
};

async function handleListSpecimens(url: URL, env: Env): Promise<Response> {
  const sort = url.searchParams.get("sort") === "hot" ? "hot" : "new";
  const biome = (url.searchParams.get("biome") || "").trim();
  const season = (url.searchParams.get("season") || "").trim();

  const limit = parsePositiveInt(url.searchParams.get("limit"), 20, 50);
  const offset = parsePositiveInt(url.searchParams.get("cursor"), 0, 100000);

  const where: string[] = ["is_hidden = 0"];
  const binds: unknown[] = [];

  if (biome) {
    if (!BIOME_ALLOW.has(biome)) {
      return json({ ok: false, error: "invalid_biome" }, 400);
    }
    where.push("biome = ?");
    binds.push(biome);
  }

  if (season) {
    if (!SEASON_ALLOW.has(season)) {
      return json({ ok: false, error: "invalid_season" }, 400);
    }
    where.push("season = ?");
    binds.push(season);
  }

  const orderBy =
    sort === "hot"
      ? "likes DESC, created_at DESC, specimen_id DESC"
      : "created_at DESC, specimen_id DESC";

  const sql = `
    SELECT
      specimen_id,
      poem_preview,
      collector_id,
      biome,
      season,
      score_total,
      likes,
      created_at
    FROM specimens
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  binds.push(limit, offset);
  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all<{
      specimen_id: string;
      poem_preview: string;
      collector_id: string;
      biome: string;
      season: string;
      score_total: number;
      likes: number;
      created_at: string;
    }>();

  const items = result.results || [];
  const nextCursor = items.length === limit ? String(offset + items.length) : null;

  return json({
    ok: true,
    items,
    next_cursor: nextCursor,
  });
}

async function handleGetSpecimen(specimenId: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `
      SELECT
        specimen_id,
        collector_id,
        poem_text,
        poem_preview,
        biome,
        season,
        score_total,
        score_breakdown_json,
        genome_json,
        parent_ids_json,
        run_hash,
        likes,
        reports,
        is_hidden,
        created_at
      FROM specimens
      WHERE specimen_id = ?
      LIMIT 1
    `,
  )
    .bind(specimenId)
    .first<SpecimenRecord>();

  if (!row || row.is_hidden === 1) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  return json({
    ok: true,
    item: serializeSpecimen(row),
  });
}

async function handleCreateSpecimen(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody(request);
  if (!isJsonObject(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const payload = body;

  const poemText = asTrimmedString(payload.poem_text);
  if (!poemText || poemText.length < 1 || poemText.length > 1500) {
    return json({ ok: false, error: "invalid_poem_text" }, 400);
  }

  const biome = asTrimmedString(payload.biome);
  if (!biome || !BIOME_ALLOW.has(biome)) {
    return json({ ok: false, error: "invalid_biome" }, 400);
  }

  const season = asTrimmedString(payload.season);
  if (!season || !SEASON_ALLOW.has(season)) {
    return json({ ok: false, error: "invalid_season" }, 400);
  }

  const collectorId = asTrimmedString(payload.collector_id) || "C-ANON";
  const scoreTotal = asNumber(payload.score_total, 0);
  const scoreBreakdown = asPlainObject(payload.score_breakdown);
  const genome = asPlainObject(payload.genome);
  const parentIds = asStringArray(payload.parent_ids, 20);
  const runHash = asTrimmedString(payload.run_hash) || null;

  const poemPreview = buildPoemPreview(poemText, 3, 220);
  const createdAt = new Date().toISOString();
  const submitFingerprint = await createFingerprint(request, "submit");
  const limitResult = await enforceSubmitRateLimit({
    env,
    fingerprint: submitFingerprint,
    nowIso: createdAt,
  });
  if (limitResult.ok === false) {
    const retryAfterSec = limitResult.retryAfterSec;
    return json(
      {
        ok: false,
        error: "rate_limited",
        retry_after_sec: retryAfterSec,
      },
      429,
      {
        "Retry-After": String(retryAfterSec),
      },
    );
  }

  let specimenId = "";
  for (let i = 0; i < 6; i += 1) {
    const candidate = generateSpecimenId(createdAt);
    const result = await env.DB.prepare(
      `
        INSERT INTO specimens (
          specimen_id,
          collector_id,
          poem_text,
          poem_preview,
          biome,
          season,
          score_total,
          score_breakdown_json,
          genome_json,
          parent_ids_json,
          run_hash,
          likes,
          reports,
          is_hidden,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
      `,
    )
      .bind(
        candidate,
        collectorId,
        poemText,
        poemPreview,
        biome,
        season,
        scoreTotal,
        JSON.stringify(scoreBreakdown),
        JSON.stringify(genome),
        JSON.stringify(parentIds),
        runHash,
        createdAt,
      )
      .run();

    if ((result.meta?.changes || 0) > 0) {
      specimenId = candidate;
      break;
    }
  }

  if (!specimenId) {
    return json({ ok: false, error: "id_generation_failed" }, 500);
  }

  await recordSubmitEvent({
    env,
    fingerprint: submitFingerprint,
    createdAt,
  });
  await pruneSubmitEvents({
    env,
    nowIso: createdAt,
  });
  await trimSpecimensIfNeeded({
    env,
    nowIso: createdAt,
  });

  return json(
    {
      ok: true,
      specimen_id: specimenId,
      url: `/specimen/?id=${encodeURIComponent(specimenId)}`,
    },
    201,
  );
}

async function handleLikeSpecimen(
  specimenId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const exists = await env.DB.prepare(
    "SELECT specimen_id FROM specimens WHERE specimen_id = ? LIMIT 1",
  )
    .bind(specimenId)
    .first<{ specimen_id: string }>();

  if (!exists) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const fingerprint = await createFingerprint(request, "like");
  const createdAt = new Date().toISOString();

  const result = await env.DB.prepare(
    `
      INSERT INTO likes (specimen_id, fingerprint_hash, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(specimen_id, fingerprint_hash) DO NOTHING
    `,
  )
    .bind(specimenId, fingerprint, createdAt)
    .run();

  const inserted = (result.meta?.changes || 0) > 0;
  if (inserted) {
    await env.DB.prepare(
      "UPDATE specimens SET likes = likes + 1 WHERE specimen_id = ?",
    )
      .bind(specimenId)
      .run();
  }

  const row = await env.DB.prepare(
    "SELECT likes FROM specimens WHERE specimen_id = ? LIMIT 1",
  )
    .bind(specimenId)
    .first<{ likes: number }>();

  return json({
    ok: true,
    specimen_id: specimenId,
    liked: inserted,
    likes: row?.likes || 0,
  });
}

async function handleReportSpecimen(
  specimenId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const exists = await env.DB.prepare(
    "SELECT specimen_id FROM specimens WHERE specimen_id = ? LIMIT 1",
  )
    .bind(specimenId)
    .first<{ specimen_id: string }>();

  if (!exists) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const body = await parseJsonBody(request);
  const reason = asTrimmedString(isJsonObject(body) ? body.reason : "") || null;

  const fingerprint = await createFingerprint(request, "report");
  const createdAt = new Date().toISOString();

  const result = await env.DB.prepare(
    `
      INSERT INTO reports (specimen_id, fingerprint_hash, reason, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(specimen_id, fingerprint_hash) DO NOTHING
    `,
  )
    .bind(specimenId, fingerprint, reason, createdAt)
    .run();

  const inserted = (result.meta?.changes || 0) > 0;
  if (inserted) {
    await env.DB.prepare(
      "UPDATE specimens SET reports = reports + 1 WHERE specimen_id = ?",
    )
      .bind(specimenId)
      .run();
  }

  const row = await env.DB.prepare(
    "SELECT reports FROM specimens WHERE specimen_id = ? LIMIT 1",
  )
    .bind(specimenId)
    .first<{ reports: number }>();

  const reports = row?.reports || 0;
  const threshold = parsePositiveInt(env.REPORT_THRESHOLD || "3", 3, 100);
  const hidden = reports >= threshold;

  if (hidden) {
    await env.DB.prepare(
      "UPDATE specimens SET is_hidden = 1 WHERE specimen_id = ?",
    )
      .bind(specimenId)
      .run();
  }

  return json({
    ok: true,
    specimen_id: specimenId,
    reported: inserted,
    reports,
    is_hidden: hidden,
  });
}

async function enforceSubmitRateLimit({
  env,
  fingerprint,
  nowIso,
}: {
  env: Env;
  fingerprint: string;
  nowIso: string;
}): Promise<SubmitRateLimitResult> {
  const maxPosts = parsePositiveInt(env.SUBMIT_LIMIT_MAX || "6", 6, 1000);
  const windowSec = parsePositiveInt(env.SUBMIT_LIMIT_WINDOW_SEC || "300", 300, 86400);
  if (maxPosts < 1 || windowSec < 1) {
    return { ok: true };
  }

  const nowMs = Date.parse(nowIso);
  const windowStartIso = new Date(nowMs - windowSec * 1000).toISOString();
  const row = await env.DB.prepare(
    `
      SELECT
        COUNT(*) as post_count,
        MIN(created_at) as oldest_created_at
      FROM submissions
      WHERE fingerprint_hash = ? AND created_at >= ?
    `,
  )
    .bind(fingerprint, windowStartIso)
    .first<{ post_count: number; oldest_created_at: string | null }>();

  const postCount = Number(row?.post_count || 0);
  if (postCount < maxPosts) {
    return { ok: true };
  }

  const oldestMs = Date.parse(row?.oldest_created_at || "");
  const fallback = windowSec;
  const retryAfterSec = Number.isFinite(oldestMs)
    ? clampInteger(
        Math.ceil((oldestMs + windowSec * 1000 - nowMs) / 1000),
        1,
        fallback,
        fallback,
      )
    : fallback;

  return {
    ok: false,
    retryAfterSec,
  };
}

async function recordSubmitEvent({
  env,
  fingerprint,
  createdAt,
}: {
  env: Env;
  fingerprint: string;
  createdAt: string;
}): Promise<void> {
  await env.DB.prepare(
    `
      INSERT INTO submissions (fingerprint_hash, created_at)
      VALUES (?, ?)
    `,
  )
    .bind(fingerprint, createdAt)
    .run();
}

async function pruneSubmitEvents({
  env,
  nowIso,
}: {
  env: Env;
  nowIso: string;
}): Promise<void> {
  const retentionDays = parsePositiveInt(
    env.SUBMISSION_LOG_RETENTION_DAYS || "30",
    30,
    3650,
  );
  const cutoffIso = new Date(
    Date.parse(nowIso) - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  await env.DB.prepare("DELETE FROM submissions WHERE created_at < ?")
    .bind(cutoffIso)
    .run();
}

async function trimSpecimensIfNeeded({
  env,
  nowIso,
}: {
  env: Env;
  nowIso: string;
}): Promise<number> {
  const maxCount = parsePositiveInt(env.SPECIMEN_MAX_COUNT || "5000", 5000, 200000);
  if (maxCount < 1) {
    return 0;
  }

  const totalRow = await env.DB.prepare("SELECT COUNT(*) as total_count FROM specimens")
    .first<{ total_count: number }>();
  const totalCount = Number(totalRow?.total_count || 0);
  if (totalCount <= maxCount) {
    return 0;
  }

  const trimBatch = parsePositiveInt(env.SPECIMEN_TRIM_BATCH || "80", 80, 50000);
  const minAgeHours = parsePositiveInt(
    env.SPECIMEN_MIN_AGE_HOURS || "24",
    24,
    24 * 365,
  );
  const cutoffIso = new Date(
    Date.parse(nowIso) - minAgeHours * 60 * 60 * 1000,
  ).toISOString();

  const overflow = totalCount - maxCount;
  const targetDeleteCount = clampInteger(
    overflow + trimBatch,
    1,
    totalCount,
    overflow,
  );

  const candidateIds = await collectTrimCandidates({
    env,
    limit: targetDeleteCount,
    cutoffIso,
  });
  if (candidateIds.length === 0) {
    return 0;
  }

  await deleteSpecimensAndSignals({
    env,
    specimenIds: candidateIds,
  });

  return candidateIds.length;
}

async function collectTrimCandidates({
  env,
  limit,
  cutoffIso,
}: {
  env: Env;
  limit: number;
  cutoffIso: string;
}): Promise<string[]> {
  const firstPass = await queryTrimCandidates({
    env,
    limit,
    cutoffIso,
    excludeIds: [],
    enforceAgeCutoff: true,
  });

  if (firstPass.length >= limit) {
    return firstPass;
  }

  const secondPass = await queryTrimCandidates({
    env,
    limit: limit - firstPass.length,
    cutoffIso,
    excludeIds: firstPass,
    enforceAgeCutoff: false,
  });

  return [...firstPass, ...secondPass];
}

async function queryTrimCandidates({
  env,
  limit,
  cutoffIso,
  excludeIds,
  enforceAgeCutoff,
}: {
  env: Env;
  limit: number;
  cutoffIso: string;
  excludeIds: string[];
  enforceAgeCutoff: boolean;
}): Promise<string[]> {
  if (limit <= 0) {
    return [];
  }

  const where: string[] = [];
  const binds: unknown[] = [];

  if (enforceAgeCutoff) {
    where.push("created_at < ?");
    binds.push(cutoffIso);
  }

  if (excludeIds.length > 0) {
    where.push(`specimen_id NOT IN (${buildPlaceholders(excludeIds.length)})`);
    binds.push(...excludeIds);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT specimen_id
    FROM specimens
    ${whereSql}
    ORDER BY is_hidden DESC, likes ASC, created_at ASC, specimen_id ASC
    LIMIT ?
  `;
  binds.push(limit);

  const rows = await env.DB.prepare(sql)
    .bind(...binds)
    .all<{ specimen_id: string }>();

  return (rows.results || [])
    .map((row) => row.specimen_id)
    .filter(Boolean);
}

async function deleteSpecimensAndSignals({
  env,
  specimenIds,
}: {
  env: Env;
  specimenIds: string[];
}): Promise<void> {
  if (specimenIds.length === 0) {
    return;
  }

  const placeholders = buildPlaceholders(specimenIds.length);
  await env.DB.prepare(
    `DELETE FROM specimens WHERE specimen_id IN (${placeholders})`,
  )
    .bind(...specimenIds)
    .run();
  await env.DB.prepare(
    `DELETE FROM likes WHERE specimen_id IN (${placeholders})`,
  )
    .bind(...specimenIds)
    .run();
  await env.DB.prepare(
    `DELETE FROM reports WHERE specimen_id IN (${placeholders})`,
  )
    .bind(...specimenIds)
    .run();
}

function buildPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function serializeSpecimen(row: SpecimenRecord) {
  return {
    specimen_id: row.specimen_id,
    collector_id: row.collector_id,
    poem_text: row.poem_text,
    poem_preview: row.poem_preview,
    biome: row.biome,
    season: row.season,
    score_total: row.score_total,
    score_breakdown: safeJsonParse(row.score_breakdown_json, {}),
    genome: safeJsonParse(row.genome_json, {}),
    parent_ids: safeJsonParse(row.parent_ids_json, []),
    run_hash: row.run_hash,
    likes: row.likes,
    reports: row.reports,
    created_at: row.created_at,
  };
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parsePositiveInt(
  value: string | null | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function clampInteger(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, parsed));
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function asPlainObject(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Json;
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const list = value as JsonArray;
  return list
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function isJsonObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildPoemPreview(poem: string, maxLines: number, maxChars: number): string {
  const lines = poem
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  const joined = lines.join("\n");
  if (joined.length <= maxChars) {
    return joined;
  }
  return `${joined.slice(0, Math.max(0, maxChars - 1))}…`;
}

function generateSpecimenId(isoDate: string): string {
  const ymd = isoDate.slice(0, 10).replaceAll("-", "");
  const token = randomBase32(6);
  return `S-${ymd}-${token}`;
}

function randomBase32(length: number): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

async function createFingerprint(request: Request, scope: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const ua = request.headers.get("User-Agent") || "";
  const date = new Date().toISOString().slice(0, 10);
  const payload = `${scope}|${ip}|${ua}|${date}`;
  return sha256Hex(payload);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(
  payload: Json,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
