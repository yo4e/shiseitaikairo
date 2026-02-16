import {
  BIOME_LABELS,
  PUBLIC_SPECIMENS,
  SEASON_LABELS,
  type PublicSpecimen,
  formatSpecimenDate,
} from "../data/public-specimens";

type ApiDetail = {
  specimen_id: string;
  collector_id: string;
  poem_text: string;
  biome: keyof typeof BIOME_LABELS;
  season: keyof typeof SEASON_LABELS;
  score_total: number;
  score_breakdown: Record<string, number>;
  genome: Record<string, number | string>;
  parent_ids: string[];
  likes: number;
  reports: number;
  created_at: string;
};

type DetailResponse = {
  ok: boolean;
  item?: ApiDetail;
};

const GENOME_LABELS: Record<string, string> = {
  lines: "行数",
  lineLen: "目標字数",
  assertiveness: "断定度",
  afterglow: "余韻度",
  concreteness: "具体度",
  repetition: "反復率",
  nutrientMix: "栄養混入率",
  immunity: "免疫",
};

let currentSpecimenId = "";

async function boot() {
  const root = document.getElementById("specimen-root");
  if (!root) {
    return;
  }

  const specimenId = new URLSearchParams(window.location.search).get("id")?.trim() || "";
  currentSpecimenId = specimenId;

  if (!specimenId) {
    applyError("標本IDが指定されていません。公共標本箱から開いてください。");
    return;
  }

  const fallback = findFallback(specimenId);
  if (fallback) {
    renderSpecimen(fallback);
    setStatus("モック標本を表示中です。APIを確認しています。", "warn");
  }

  const apiBase = (root.getAttribute("data-api-base") || "/api").replace(/\/$/, "");

  try {
    const response = await fetch(`${apiBase}/specimens/${encodeURIComponent(specimenId)}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`request failed: ${response.status}`);
    }

    const payload = (await response.json()) as DetailResponse;
    if (!payload.ok || !payload.item) {
      throw new Error("item missing");
    }

    renderSpecimen(payload.item);
    setStatus("APIから標本を読み込みました。", "ok");
  } catch (error) {
    console.error(error);
    if (!fallback) {
      applyError("標本を取得できませんでした。IDが存在しないか、APIが停止しています。");
    } else {
      setStatus("API未接続のためモック標本を表示しています。", "warn");
    }
  }

  const likeButton = document.getElementById("specimen-like");
  if (likeButton instanceof HTMLButtonElement) {
    likeButton.addEventListener("click", () => runAction("like", apiBase));
  }

  const reportButton = document.getElementById("specimen-report");
  if (reportButton instanceof HTMLButtonElement) {
    reportButton.addEventListener("click", () => runAction("report", apiBase));
  }
}

function findFallback(specimenId: string): ApiDetail | null {
  const match = PUBLIC_SPECIMENS.find((item) => item.specimenId === specimenId);
  if (!match) {
    return null;
  }
  return fromPublicSpecimen(match);
}

function fromPublicSpecimen(item: PublicSpecimen): ApiDetail {
  return {
    specimen_id: item.specimenId,
    collector_id: item.collectorId,
    poem_text: item.poem,
    biome: item.biome,
    season: item.season,
    score_total: item.scoreTotal,
    score_breakdown: {},
    genome: {
      lines: item.genomeSummary.lines,
      lineLen: item.genomeSummary.lineLen,
      assertiveness: item.genomeSummary.assertiveness,
      afterglow: item.genomeSummary.afterglow,
      concreteness: item.genomeSummary.concreteness,
      nutrientMix: item.genomeSummary.nutrientMix,
      immunity: item.genomeSummary.immunity,
    },
    parent_ids: item.parentIds,
    likes: item.likes,
    reports: 0,
    created_at: item.createdAt,
  };
}

function renderSpecimen(item: ApiDetail) {
  document.title = `標本 ${item.specimen_id} | 詩生態回路`;

  const title = document.getElementById("specimen-title");
  if (title) {
    title.textContent = `標本詳細: ${item.specimen_id}`;
  }

  const meta = document.getElementById("specimen-meta");
  if (meta) {
    meta.textContent = `採取者: ${item.collector_id} / 作成日時: ${formatSpecimenDate(item.created_at)}`;
  }

  const chips = document.getElementById("specimen-chips");
  if (chips) {
    const biome = BIOME_LABELS[item.biome] || item.biome;
    const season = SEASON_LABELS[item.season] || item.season;
    chips.innerHTML = `
      <span class="chip">${escapeHtml(biome)}</span>
      <span class="chip">${escapeHtml(season)}</span>
      <span class="chip">スコア ${formatNumber(item.score_total)}</span>
      <span class="chip">いいね ${item.likes}</span>
      <span class="chip">通報 ${item.reports}</span>
    `;
  }

  const poem = document.getElementById("specimen-poem");
  if (poem) {
    poem.textContent = item.poem_text;
  }

  const diagnosis = document.getElementById("specimen-diagnosis");
  if (diagnosis) {
    const breakdownEntries = Object.entries(item.score_breakdown || {});
    if (breakdownEntries.length === 0) {
      diagnosis.innerHTML = "<li>診断メモなし</li>";
    } else {
      diagnosis.innerHTML = breakdownEntries
        .map(([key, value]) => `<li>${escapeHtml(key)}: ${formatUnknownNumber(value)}</li>`)
        .join("");
    }
  }

  const rows = document.getElementById("specimen-genome-rows");
  if (rows) {
    const entries = Object.entries(item.genome || {});
    rows.innerHTML = entries
      .map(([key, value]) => {
        const label = GENOME_LABELS[key] || key;
        return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(formatUnknownNumber(value))}</td></tr>`;
      })
      .join("");
  }

  const parents = document.getElementById("specimen-parents");
  if (parents) {
    parents.textContent =
      Array.isArray(item.parent_ids) && item.parent_ids.length > 0
        ? item.parent_ids.join(" / ")
        : "なし";
  }
}

async function runAction(kind: "like" | "report", apiBase: string) {
  if (!currentSpecimenId) {
    return;
  }

  const status = document.getElementById("specimen-status");
  if (status) {
    status.textContent = kind === "like" ? "いいね送信中..." : "通報送信中...";
  }

  try {
    const response = await fetch(
      `${apiBase}/specimens/${encodeURIComponent(currentSpecimenId)}/${kind}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: kind === "report" ? JSON.stringify({ reason: "viewer" }) : "{}",
      },
    );

    if (!response.ok) {
      throw new Error(`request failed: ${response.status}`);
    }

    if (status) {
      status.textContent = kind === "like" ? "いいねを送信しました。" : "通報を送信しました。";
    }

    const detailResponse = await fetch(
      `${apiBase}/specimens/${encodeURIComponent(currentSpecimenId)}`,
    );
    if (detailResponse.ok) {
      const payload = (await detailResponse.json()) as DetailResponse;
      if (payload.ok && payload.item) {
        renderSpecimen(payload.item);
      }
    }
  } catch (error) {
    console.error(error);
    if (status) {
      status.textContent = "操作に失敗しました。API接続を確認してください。";
    }
  }
}

function setStatus(message: string, state: "ok" | "warn" | "error") {
  const status = document.getElementById("specimen-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.remove("status-ok", "status-warn", "status-error");
  status.classList.add(`status-${state}`);
}

function applyError(message: string) {
  setStatus(message, "error");
  const title = document.getElementById("specimen-title");
  if (title) {
    title.textContent = "標本詳細: 取得失敗";
  }
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatUnknownNumber(value: unknown): string {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return String(value ?? "");
  }
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(3);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

void boot();
