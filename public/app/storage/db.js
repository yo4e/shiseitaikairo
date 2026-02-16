const DB_NAME = "shiseitaikairo-db";
const DB_VERSION = 1;
const SCHEMA_VERSION = "v1";

const STORE_RUNS = "runs";
const STORE_GENERATIONS = "generations";
const STORE_SETTINGS = "settings";

let dbPromise = null;

export async function initDatabase() {
  const db = await openDatabase();
  await ensureSchemaVersion(db);
  return {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    schemaVersion: SCHEMA_VERSION,
  };
}

export async function saveRun(run) {
  const db = await openDatabase();
  const tx = db.transaction([STORE_RUNS, STORE_GENERATIONS], "readwrite");
  const runStore = tx.objectStore(STORE_RUNS);
  const generationStore = tx.objectStore(STORE_GENERATIONS);

  const runMeta = buildRunMeta(run);
  runStore.put(runMeta);

  for (const generation of run.generations) {
    for (const record of generation.records) {
      generationStore.put(serializeGenerationRecord(record));
    }
  }

  await transactionDone(tx);
}

export async function listRunMetas() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_RUNS, "readonly");
  const store = tx.objectStore(STORE_RUNS);
  const all = await requestAsPromise(store.getAll());
  await transactionDone(tx);

  return all.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function loadRunById(runId) {
  const db = await openDatabase();
  const tx = db.transaction([STORE_RUNS, STORE_GENERATIONS], "readonly");
  const runStore = tx.objectStore(STORE_RUNS);
  const generationStore = tx.objectStore(STORE_GENERATIONS);

  const runMeta = await requestAsPromise(runStore.get(runId));
  if (!runMeta) {
    await transactionDone(tx);
    return null;
  }

  const runIndex = generationStore.index("runId");
  const rawRecords = await requestAsPromise(runIndex.getAll(runId));
  await transactionDone(tx);

  const records = rawRecords.map(deserializeGenerationRecord);
  const generations = buildGenerations(records);
  const finalGeneration = generations[generations.length - 1] || null;

  return {
    runId: runMeta.runId,
    createdAt: runMeta.createdAt,
    population: runMeta.population,
    generationCount: runMeta.generationCount,
    seed: runMeta.seed,
    nutrients: runMeta.nutrients,
    toxicWords: runMeta.toxicWords,
    evolutionConfig: runMeta.evolutionConfig || null,
    poemStyleConfig: runMeta.poemStyleConfig || null,
    environmentConfig: runMeta.environmentConfig || null,
    lifeConfig: runMeta.lifeConfig || null,
    schemaVersion: runMeta.schemaVersion,
    generations,
    records,
    finalGeneration,
    specimens: buildSpecimens(generations),
  };
}

export async function deleteRun(runId) {
  const db = await openDatabase();
  const tx = db.transaction([STORE_RUNS, STORE_GENERATIONS], "readwrite");
  const runStore = tx.objectStore(STORE_RUNS);
  const generationStore = tx.objectStore(STORE_GENERATIONS);
  const runIndex = generationStore.index("runId");

  const recordIds = await requestAsPromise(runIndex.getAllKeys(runId));
  for (const recordId of recordIds) {
    generationStore.delete(recordId);
  }

  runStore.delete(runId);
  await transactionDone(tx);
}

export async function clearRuns() {
  const db = await openDatabase();
  const tx = db.transaction([STORE_RUNS, STORE_GENERATIONS], "readwrite");
  tx.objectStore(STORE_RUNS).clear();
  tx.objectStore(STORE_GENERATIONS).clear();
  await transactionDone(tx);
}

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("This environment does not support IndexedDB."),
    );
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        const runStore = db.createObjectStore(STORE_RUNS, { keyPath: "runId" });
        runStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_GENERATIONS)) {
        const generationStore = db.createObjectStore(STORE_GENERATIONS, {
          keyPath: "recordId",
        });
        generationStore.createIndex("runId", "runId", { unique: false });
        generationStore.createIndex("runGeneration", ["runId", "generation"], {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

async function ensureSchemaVersion(db) {
  const tx = db.transaction(STORE_SETTINGS, "readwrite");
  const store = tx.objectStore(STORE_SETTINGS);
  store.put({
    key: "schemaVersion",
    value: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  });
  await transactionDone(tx);
}

function buildRunMeta(run) {
  return {
    runId: run.runId,
    createdAt: run.createdAt,
    population: run.population,
    generationCount: run.generationCount,
    seed: run.seed,
    nutrients: run.nutrients,
    toxicWords: run.toxicWords,
    evolutionConfig: run.evolutionConfig || null,
    poemStyleConfig: run.poemStyleConfig || null,
    environmentConfig: run.environmentConfig || null,
    lifeConfig: run.lifeConfig || null,
    schemaVersion: SCHEMA_VERSION,
    generationSummaries: run.generations.map((generation) => ({
      generation: generation.generation,
      seasonKey: generation.environment?.seasonKey || null,
      seasonLabel: generation.environment?.seasonLabel || null,
      depletedNutrients: generation.environment?.depletedNutrients || [],
      livingCount: generation.livingCount,
      deadCount: generation.deadCount,
      winnerIds: generation.winners.map((winner) => winner.individualId),
      topScore: generation.winners[0]?.score ?? 0,
    })),
  };
}

function serializeGenerationRecord(record) {
  return {
    ...record,
    recordId: `${record.runId}:${record.generation}:${record.individualId}`,
  };
}

function deserializeGenerationRecord(rawRecord) {
  const { recordId, ...record } = rawRecord;
  return record;
}

function buildGenerations(records) {
  const grouped = new Map();
  for (const record of records) {
    if (!grouped.has(record.generation)) {
      grouped.set(record.generation, []);
    }
    grouped.get(record.generation).push(record);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([generation, bucket]) => {
      const ranked = [...bucket].sort((left, right) => right.score - left.score);
      const winners = ranked.slice(0, 3);
      const livingCount = ranked.filter((record) => !record.diag.isDead).length;
      return {
        generation,
        environment: ranked[0]?.environment || null,
        records: ranked,
        winners,
        livingCount,
        deadCount: ranked.length - livingCount,
      };
    });
}

function buildSpecimens(generations) {
  const specimens = [];
  for (const generation of generations) {
    generation.winners.forEach((winner, index) => {
      specimens.push({
        id: `specimen-g${generation.generation}-w${index + 1}`,
        generation: generation.generation,
        rank: index + 1,
        title: `第${generation.generation}世代 / 勝者${index + 1}`,
        individualId: winner.individualId,
        score: winner.score,
        poem: winner.poem,
      });
    });
  }
  return specimens;
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("IndexedDB tx aborted"));
    tx.onerror = () => reject(tx.error);
  });
}
