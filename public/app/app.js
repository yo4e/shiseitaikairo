import {
  DEFAULT_EVOLUTION_CONFIG,
  DEFAULT_LIFE_CONFIG,
  DEFAULT_POEM_STYLE_CONFIG,
  runSimulation,
} from "./domain/evolution.js";
import {
  initDatabase,
  clearRuns as clearPersistedRuns,
  deleteRun as deletePersistedRun,
  listRunMetas,
  loadRunById,
  saveRun as persistRun,
} from "./storage/db.js";

window.__SHISEI_APP_LOADED__ = true;

const presets = {
  garden: [
    "ルッコラ",
    "フェンネル",
    "瓶",
    "水",
    "風",
    "土",
    "苔",
    "種",
    "葉脈",
    "露",
  ],
  work: [
    "注意",
    "許諾",
    "赤字",
    "待機",
    "期限",
    "議事録",
    "見積",
    "差戻し",
    "承認",
    "進捗",
  ],
  cosmic: [
    "時間",
    "真空",
    "光",
    "境界",
    "余白",
    "重力",
    "軌道",
    "星図",
    "地平線",
    "夜明け",
  ],
  body: [
    "脈",
    "骨",
    "皮膚",
    "熱",
    "息",
    "血",
    "喉",
    "耳",
    "肩甲",
    "神経",
  ],
  harbor: [
    "港",
    "灯",
    "舟",
    "潮",
    "錨",
    "防波堤",
    "霧笛",
    "桟橋",
    "帆",
    "船影",
  ],
  ritual: [
    "祈り",
    "盃",
    "灰",
    "鐘",
    "布",
    "焚火",
    "祝詞",
    "輪",
    "印",
    "沈香",
  ],
};

const TOXIC_WORD_POOL = [
  "腐食",
  "断線",
  "失効",
  "隔離",
  "停滞",
  "歪み",
  "飢餓",
  "麻痺",
  "崩落",
  "欠損",
  "過熱",
  "漏洩",
];

const DEFAULT_TOXIC_WORD_COUNT = 2;

const API_BASE_CANDIDATES = ["/api", "http://127.0.0.1:8787/api", "http://localhost:8787/api"];
const BIOME_KEYS = new Set(["garden", "work", "cosmic", "body", "harbor", "ritual"]);
const SEASON_KEYS = new Set(["spring", "summer", "autumn", "winter"]);

const GENOME_LABELS = {
  lines: "行数",
  lineLen: "目標字数",
  assertiveness: "断定度",
  afterglow: "余韻度",
  concreteness: "具体度",
  repetition: "反復率",
  nutrientMix: "栄養混入率",
  immunity: "免疫",
};

const SCORE_LABELS = {
  metabolismScore: "代謝スコア",
  structureScore: "構造スコア",
  toxinPenalty: "毒ペナルティ",
  repetitionPenalty: "反復ペナルティ",
};

const METRIC_LABELS = {
  lineCount: "行数",
  averageLineLength: "平均行長",
  uniqueTokenRatio: "語のユニーク率",
  longestRepeatRun: "最大連続反復",
};

const state = {
  runs: [],
  activeRunId: null,
  activeGeneration: null,
  activeWinnerId: null,
  storageReady: false,
  publishedSpecimens: {},
};

const refs = {
  form: document.querySelector("#controls-form"),
  population: document.querySelector("#population"),
  generationCount: document.querySelector("#generation-count"),
  seed: document.querySelector("#seed"),
  nutrientPreset: document.querySelector("#nutrient-preset"),
  nutrients: document.querySelector("#nutrients"),
  toxicWords: document.querySelector("#toxic-words"),
  eliteRatio: document.querySelector("#elite-ratio"),
  diversityRatio: document.querySelector("#diversity-ratio"),
  mutationRate: document.querySelector("#mutation-rate"),
  mutationStrength: document.querySelector("#mutation-strength"),
  particleRate: document.querySelector("#particle-rate"),
  conjunctionRate: document.querySelector("#conjunction-rate"),
  error: document.querySelector("#controls-error"),
  interactionStatus: document.querySelector("#interaction-status"),
  generationTabs: document.querySelector("#generation-tabs"),
  winnersList: document.querySelector("#winners-list"),
  winnerDetail: document.querySelector("#winner-detail"),
  specimenList: document.querySelector("#specimen-list"),
  speciationPlot: document.querySelector("#speciation-plot"),
  speciationDetail: document.querySelector("#speciation-detail"),
  historyList: document.querySelector("#history-list"),
  activeRunMeta: document.querySelector("#active-run-meta"),
  reloadHistoryButton: document.querySelector("#reload-history-button"),
  clearHistoryButton: document.querySelector("#clear-history-button"),
  resetButton: document.querySelector("#reset-button"),
};

boot().catch((error) => {
  console.error(error);
  setError("初期化中にエラーが発生しました。ページを再読み込みしてください。");
});

async function boot() {
  renderEmptyState();
  applyEvolutionConfigToForm(DEFAULT_EVOLUTION_CONFIG);
  applyPoemStyleConfigToForm(DEFAULT_POEM_STYLE_CONFIG);
  refs.toxicWords.value = buildRandomToxicWords(DEFAULT_TOXIC_WORD_COUNT);
  setInteractionStatus("待機中");

  window.__shiseiOnWinnerInline = (individualId) => {
    onWinnerSelectById(individualId);
  };
  window.__shiseiOnHistoryInline = (runId, action = "open") => {
    onHistoryAction(runId, action);
  };

  refs.form.addEventListener("submit", onRun);
  refs.nutrientPreset.addEventListener("change", onPresetChange);
  refs.nutrients.addEventListener("input", onNutrientInput);
  refs.resetButton.addEventListener("click", onReset);
  refs.generationTabs.addEventListener("click", onGenerationSelect);
  refs.speciationPlot.addEventListener("click", onSpeciationSelect);
  refs.winnerDetail.addEventListener("click", onWinnerDetailAction);
  refs.specimenList.addEventListener("click", onSpecimenAction);
  refs.reloadHistoryButton.addEventListener("click", onReloadHistory);
  refs.clearHistoryButton.addEventListener("click", onClearHistory);

  await hydrateFromStorage();
}

async function hydrateFromStorage() {
  try {
    await initDatabase();
    state.storageReady = true;
  } catch (error) {
    console.error(error);
    state.storageReady = false;
    setError("保存機能を初期化できませんでした。このセッションは一時表示のみです。");
    state.runs = [];
    state.activeRunId = null;
    state.activeGeneration = null;
    state.activeWinnerId = null;
    renderEmptyState();
    renderHistory();
    return;
  }

  const previousActiveRunId = state.activeRunId;
  const metas = await listRunMetas();
  state.runs = [];

  if (metas.length === 0) {
    state.activeRunId = null;
    state.activeGeneration = null;
    state.activeWinnerId = null;
    renderEmptyState();
    renderHistory();
    return;
  }

  const loadedRuns = await Promise.all(
    metas.map((meta) => loadRunById(meta.runId)),
  );
  state.runs = loadedRuns.filter(Boolean);

  if (state.runs.length === 0) {
    state.activeRunId = null;
    state.activeGeneration = null;
    state.activeWinnerId = null;
    renderEmptyState();
    renderHistory();
    return;
  }

  const selectedRun =
    state.runs.find((run) => run.runId === previousActiveRunId) || state.runs[0];
  setActiveRun(selectedRun);
  hydrateForm(selectedRun);
  renderRun(selectedRun);
  renderHistory();
}

function onPresetChange(event) {
  const presetKey = event.target.value;
  if (!presetKey || !presets[presetKey]) {
    return;
  }
  refs.nutrients.value = presets[presetKey].join(", ");
}

function onNutrientInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
    return;
  }

  const before = input.value;
  const after = normalizeCommaInput(before);
  if (before === after) {
    return;
  }

  const cursor = input.selectionStart ?? after.length;
  input.value = after;
  input.setSelectionRange(cursor, cursor);
}

async function onRun(event) {
  event.preventDefault();
  clearError();
  setInteractionStatus("実行開始");

  const nutrients = parseWordList(refs.nutrients.value);
  const toxicWords = parseWordList(refs.toxicWords.value);
  if (nutrients.length === 0) {
    setError("栄養語を1語以上入力してください。");
    refs.nutrients.focus();
    return;
  }

  const population = sanitizeInt(refs.population.value, 30, 1, 300);
  const generationCount = sanitizeInt(refs.generationCount.value, 3, 1, 20);
  const seedInput = refs.seed.value.trim();
  const evolutionConfig = getEvolutionConfigFromForm();
  const poemStyleConfig = getPoemStyleConfigFromForm();
  const runId = buildRunId();

  const simulation = runSimulation({
    runId,
    populationSize: population,
    generationCount,
    nutrients,
    toxicWords,
    seed: seedInput === "" ? undefined : seedInput,
    evolutionConfig,
    poemStyleConfig,
  });

  const run = {
    runId,
    createdAt: new Date().toISOString(),
    population,
    generationCount,
    seed: simulation.seed,
    nutrients,
    toxicWords,
    generations: simulation.generations,
    records: simulation.records,
    finalGeneration: simulation.finalGeneration,
    specimens: simulation.specimens,
    evolutionConfig: simulation.evolutionConfig,
    poemStyleConfig: simulation.poemStyleConfig,
    environmentConfig: simulation.environmentConfig,
    lifeConfig: simulation.lifeConfig,
    schemaVersion: "v1",
  };

  if (state.storageReady) {
    try {
      await persistRun(run);
    } catch (error) {
      console.error(error);
      setError("実行は完了しましたが保存に失敗しました。");
    }
  }

  upsertRun(run);
  setActiveRun(run);
  refs.seed.value = String(run.seed);
  setInteractionStatus(`実行完了: ${run.runId}`);
  renderRun(run);
  renderHistory();
}

function onGenerationSelect(event) {
  const button = getClosestTarget(event, "button[data-generation]");
  if (!button) {
    return;
  }

  const run = getActiveRun();
  if (!run) {
    return;
  }

  const generation = Number.parseInt(button.dataset.generation, 10);
  const generationData = getGenerationData(run, generation);
  if (!generationData) {
    return;
  }

  state.activeGeneration = generationData.generation;
  state.activeWinnerId = generationData.winners[0]?.individualId ?? null;
  renderRun(run);
}

function onWinnerSelect(event) {
  const button =
    event.currentTarget instanceof HTMLButtonElement
      ? event.currentTarget
      : getClosestTarget(event, "button[data-individual-id]");
  if (!button) {
    return;
  }

  const individualId = button.dataset.individualId;
  onWinnerSelectById(individualId);
}

function onWinnerSelectById(individualId) {
  if (!individualId) {
    setInteractionStatus("詳細クリック: 個体IDなし");
    return;
  }

  setInteractionStatus(`詳細クリック: ${individualId}`);

  const run = getActiveRun();
  if (!run) {
    setInteractionStatus(`詳細クリック失敗: active run がありません (${individualId})`);
    return;
  }

  const generationData = getGenerationData(run, state.activeGeneration);
  if (!generationData) {
    setInteractionStatus(
      `詳細クリック失敗: 世代データなし (${individualId}, g=${state.activeGeneration})`,
    );
    return;
  }

  const winner = generationData.records.find(
    (record) => record.individualId === individualId,
  );
  if (!winner) {
    setInteractionStatus(`詳細クリック失敗: 個体が見つかりません (${individualId})`);
    return;
  }

  state.activeWinnerId = winner.individualId;
  setInteractionStatus(`詳細表示: ${winner.individualId}`);
  renderRun(run);
}

function onSpeciationSelect(event) {
  const circle = getClosestTarget(event, "circle[data-individual-id]");
  if (!circle) {
    return;
  }

  const run = getActiveRun();
  if (!run) {
    return;
  }

  const generationData = getGenerationData(run, state.activeGeneration);
  if (!generationData) {
    return;
  }

  const individualId = circle.dataset.individualId;
  const record = generationData.records.find(
    (candidate) => candidate.individualId === individualId,
  );
  if (!record) {
    return;
  }

  state.activeWinnerId = record.individualId;
  renderRun(run);
}

function onWinnerDetailAction(event) {
  const button = getClosestTarget(event, "button[data-action='publish-winner']");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const generation = Number.parseInt(button.dataset.generation, 10);
  const individualId = button.dataset.individualId || "";
  void submitSpecimenFromActiveRun({
    generation,
    individualId,
    triggerButton: button,
    sourceLabel: "個体詳細",
  });
}

function onSpecimenAction(event) {
  const button = getClosestTarget(event, "button[data-action='publish-specimen']");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const generation = Number.parseInt(button.dataset.generation, 10);
  const individualId = button.dataset.individualId || "";
  void submitSpecimenFromActiveRun({
    generation,
    individualId,
    triggerButton: button,
    sourceLabel: "標本箱",
  });
}

async function submitSpecimenFromActiveRun({
  generation,
  individualId,
  triggerButton,
  sourceLabel,
}) {
  if (!Number.isFinite(generation) || generation < 1 || !individualId) {
    setInteractionStatus(`投稿失敗: 個体指定が不正 (${sourceLabel})`);
    return;
  }

  const run = getActiveRun();
  if (!run) {
    setInteractionStatus(`投稿失敗: active run がありません (${sourceLabel})`);
    return;
  }

  const generationData = getGenerationData(run, generation);
  if (!generationData) {
    setInteractionStatus(`投稿失敗: 世代が見つかりません (${individualId}, g=${generation})`);
    return;
  }

  const record = generationData.records.find(
    (candidate) => candidate.individualId === individualId,
  );
  if (!record) {
    setInteractionStatus(`投稿失敗: 個体が見つかりません (${individualId})`);
    return;
  }

  const originalLabel = triggerButton.textContent || "公共標本箱へ投稿";
  triggerButton.disabled = true;
  triggerButton.textContent = "投稿中...";
  clearError();
  setInteractionStatus(`公共標本箱へ投稿中: ${individualId}`);

  try {
    const payload = buildPublicSpecimenPayload({
      run,
      generation,
      record,
    });
    const result = await postSpecimen(payload);

    setPostedSpecimen({
      runId: run.runId,
      generation,
      individualId,
      specimenId: result.specimenId,
      detailUrl: result.detailUrl,
    });

    triggerButton.textContent = "投稿済み";
    triggerButton.title = result.specimenId;
    setInteractionStatus(`投稿完了: ${result.specimenId}`);
    renderRun(run);
  } catch (error) {
    console.error(error);
    triggerButton.textContent = originalLabel;
    const message =
      error instanceof Error
        ? error.message
        : "標本の投稿に失敗しました。APIサーバーを確認してください。";
    setError(message);
    setInteractionStatus(`投稿失敗: ${individualId}`);
  } finally {
    triggerButton.disabled = false;
  }
}

function onHistorySelect(event) {
  const button =
    event.currentTarget instanceof HTMLButtonElement
      ? event.currentTarget
      : getClosestTarget(event, "button[data-run-id]");
  if (!button) {
    return;
  }

  const runId = button.dataset.runId;
  const action = button.dataset.action || "open";
  onHistoryAction(runId, action);
}

function onHistoryAction(runId, action = "open") {
  if (!runId) {
    setInteractionStatus("履歴クリック: runId なし");
    return;
  }

  setInteractionStatus(`履歴クリック: ${action} (${runId})`);
  if (action === "delete") {
    void onDeleteRun(runId);
    return;
  }

  const run = state.runs.find((item) => item.runId === runId);
  if (!run) {
    setInteractionStatus(`履歴オープン失敗: run が見つかりません (${runId})`);
    return;
  }

  setInteractionStatus(`履歴オープン: ${runId}`);
  setActiveRun(run);
  hydrateForm(run);
  renderRun(run);
  renderHistory();
}

async function onDeleteRun(runId) {
  const run = state.runs.find((item) => item.runId === runId);
  if (!run) {
    return;
  }

  const accepted = window.confirm(
    `実行履歴 ${runId} を削除します。よろしいですか？`,
  );
  if (!accepted) {
    setInteractionStatus(`履歴削除キャンセル: ${runId}`);
    return;
  }

  clearError();

  if (state.storageReady) {
    try {
      await deletePersistedRun(runId);
    } catch (error) {
      console.error(error);
      setError("履歴の削除に失敗しました。");
      setInteractionStatus(`履歴削除失敗: ${runId}`);
      return;
    }
  }

  prunePublishedByRunId(runId);
  state.runs = state.runs.filter((item) => item.runId !== runId);

  if (state.activeRunId === runId) {
    const nextRun = state.runs[0] || null;
    if (nextRun) {
      setActiveRun(nextRun);
      hydrateForm(nextRun);
      renderRun(nextRun);
    } else {
      state.activeRunId = null;
      state.activeGeneration = null;
      state.activeWinnerId = null;
      renderEmptyState();
    }
  }

  setInteractionStatus(`履歴削除: ${runId}`);
  renderHistory();
}

async function onReloadHistory() {
  clearError();
  setInteractionStatus("履歴再読込");
  try {
    await hydrateFromStorage();
  } catch (error) {
    console.error(error);
    setError("履歴の再読込に失敗しました。");
    setInteractionStatus("履歴再読込失敗");
  }
}

async function onClearHistory() {
  if (state.runs.length === 0) {
    return;
  }

  const accepted = window.confirm(
    "履歴をすべて削除します。よろしいですか？（設定ストアは保持されます）",
  );
  if (!accepted) {
    setInteractionStatus("履歴全削除キャンセル");
    return;
  }

  clearError();

  if (state.storageReady) {
    try {
      await clearPersistedRuns();
    } catch (error) {
      console.error(error);
      setError("履歴全削除に失敗しました。");
      setInteractionStatus("履歴全削除失敗");
      return;
    }
  }

  state.runs = [];
  state.activeRunId = null;
  state.activeGeneration = null;
  state.activeWinnerId = null;
  state.publishedSpecimens = {};

  setInteractionStatus("履歴全削除完了");
  renderEmptyState();
  renderHistory();
}

function onReset() {
  refs.form.reset();
  refs.population.value = "30";
  refs.generationCount.value = "3";
  refs.seed.value = "";
  refs.toxicWords.value = buildRandomToxicWords(DEFAULT_TOXIC_WORD_COUNT);
  applyEvolutionConfigToForm(DEFAULT_EVOLUTION_CONFIG);
  applyPoemStyleConfigToForm(DEFAULT_POEM_STYLE_CONFIG);

  state.activeRunId = null;
  state.activeGeneration = null;
  state.activeWinnerId = null;

  clearError();
  renderEmptyState();
  renderHistory();
}

function hydrateForm(run) {
  refs.population.value = String(run.population);
  refs.generationCount.value = String(run.generationCount);
  refs.seed.value = String(run.seed);
  refs.nutrients.value = run.nutrients.join(", ");
  refs.toxicWords.value = run.toxicWords.join(", ");
  applyEvolutionConfigToForm(run.evolutionConfig || DEFAULT_EVOLUTION_CONFIG);
  applyPoemStyleConfigToForm(run.poemStyleConfig || DEFAULT_POEM_STYLE_CONFIG);
}

function setActiveRun(run) {
  state.activeRunId = run.runId;
  state.activeGeneration = run.finalGeneration?.generation ?? 1;
  state.activeWinnerId = run.finalGeneration?.winners[0]?.individualId ?? null;
}

function upsertRun(run) {
  const existingIndex = state.runs.findIndex((item) => item.runId === run.runId);
  if (existingIndex === -1) {
    state.runs.unshift(run);
    return;
  }

  state.runs[existingIndex] = run;
  state.runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function renderRun(run) {
  const generationData =
    getGenerationData(run, state.activeGeneration) || run.finalGeneration || null;

  if (!generationData) {
    renderEmptyState();
    return;
  }

  state.activeGeneration = generationData.generation;
  renderGenerationTabs(run.generations, generationData.generation);
  renderWinners(generationData);
  renderSpeciation(generationData.records);
  renderSpecimens(run.specimens, run.runId);
}

function renderGenerationTabs(generations, activeGeneration) {
  refs.generationTabs.innerHTML = generations
    .map((generation) => {
      const activeClass =
        generation.generation === activeGeneration ? " selected" : "";
      const seasonLabel = generation.environment?.seasonLabel
        ? ` / ${generation.environment.seasonLabel}`
        : "";
      return `
      <button class="generation-pill${activeClass}" type="button" data-generation="${generation.generation}">
        第${generation.generation}世代${seasonLabel}（生存${generation.livingCount} / 死亡${generation.deadCount}）
      </button>
    `;
    })
    .join("");
}

function renderWinners(generationData) {
  const selectedRecord =
    generationData.records.find(
      (record) => record.individualId === state.activeWinnerId,
    ) ||
    generationData.winners[0] ||
    null;

  state.activeWinnerId = selectedRecord?.individualId ?? null;

  refs.winnersList.innerHTML = generationData.winners
    .map((winner, idx) => {
      const selectedClass =
        winner.individualId === state.activeWinnerId ? " selected" : "";
      const deadLabel = winner.diag.isDead ? "・死亡" : "";

      return `
      <article class="item-card${selectedClass}">
        <h3>第${generationData.generation}世代 / 勝者${idx + 1}（スコア: ${winner.score.toFixed(2)}${deadLabel}）</h3>
        <p>${escapeHtml(winner.poem)}</p>
        <p class="item-meta">個体ID: ${winner.individualId}</p>
        <button
          class="tiny-button"
          type="button"
          data-individual-id="${winner.individualId}"
          onclick="window.__shiseiOnWinnerInline && window.__shiseiOnWinnerInline('${winner.individualId}')"
        >
          詳細を見る
        </button>
      </article>
    `;
    })
    .join("");

  const run = getActiveRun();
  renderWinnerDetail(selectedRecord, generationData.generation, run);
}

function renderSpecimens(specimens, runId) {
  refs.specimenList.innerHTML = specimens
    .map((specimen) => {
      const posted = getPostedSpecimen(runId, specimen.individualId, specimen.generation);
      const postedHtml = posted
        ? `
        <p class="item-meta published-note">
          投稿済み: ${escapeHtml(posted.specimenId)}
          <a class="inline-link" href="${escapeHtml(posted.detailUrl)}" target="_blank" rel="noopener noreferrer">標本詳細を開く</a>
        </p>
      `
        : "";
      const buttonLabel = posted ? "投稿済み" : "公共標本箱へ投稿";
      const buttonClass = posted ? "tiny-button success" : "tiny-button";

      return `
      <article class="item-card">
        <h3>${escapeHtml(specimen.title)}</h3>
        <p>${escapeHtml(specimen.poem)}</p>
        <p class="item-meta">個体ID: ${specimen.individualId}, スコア: ${specimen.score.toFixed(2)}</p>
        ${postedHtml}
        <div class="head-actions">
          <button
            class="${buttonClass}"
            type="button"
            data-action="publish-specimen"
            data-generation="${specimen.generation}"
            data-individual-id="${escapeHtml(specimen.individualId)}"
            ${posted ? "disabled" : ""}
          >
            ${buttonLabel}
          </button>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderSpeciation(records) {
  if (!records || records.length === 0) {
    refs.speciationPlot.innerHTML = "";
    refs.speciationDetail.textContent = "点をクリックすると個体情報を表示します。";
    return;
  }

  const width = 640;
  const height = 320;
  const margin = {
    top: 18,
    right: 20,
    bottom: 42,
    left: 56,
  };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const scores = records.map((record) => record.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreSpan = Math.max(0.0001, maxScore - minScore);
  const winnerIds = new Set(records.slice(0, 3).map((record) => record.individualId));

  const xTicks = [-1, -0.5, 0, 0.5, 1];
  const yTicks = [0, 0.5, 1];

  const gridX = xTicks
    .map((tick) => {
      const x = margin.left + ((tick + 1) / 2) * plotWidth;
      return `<line class="plot-grid" x1="${x.toFixed(1)}" y1="${margin.top}" x2="${x.toFixed(1)}" y2="${height - margin.bottom}" />`;
    })
    .join("");
  const gridY = yTicks
    .map((tick) => {
      const y = margin.top + (1 - tick) * plotHeight;
      return `<line class="plot-grid" x1="${margin.left}" y1="${y.toFixed(1)}" x2="${width - margin.right}" y2="${y.toFixed(1)}" />`;
    })
    .join("");

  const xLabels = xTicks
    .map((tick) => {
      const x = margin.left + ((tick + 1) / 2) * plotWidth;
      return `<text class="plot-tick" x="${x.toFixed(1)}" y="${height - margin.bottom + 18}" text-anchor="middle">${tick}</text>`;
    })
    .join("");
  const yLabels = yTicks
    .map((tick) => {
      const y = margin.top + (1 - tick) * plotHeight;
      return `<text class="plot-tick" x="${margin.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${tick}</text>`;
    })
    .join("");

  const points = records
    .map((record) => {
      const xValue = clamp(record.genome.assertiveness - record.genome.afterglow, -1, 1);
      const yValue = clamp(record.genome.concreteness, 0, 1);
      const x = margin.left + ((xValue + 1) / 2) * plotWidth;
      const y = margin.top + (1 - yValue) * plotHeight;
      const scoreRatio = (record.score - minScore) / scoreSpan;
      const radius = 3.6 + scoreRatio * 2.4;

      const classNames = ["plot-point"];
      if (record.diag.isDead) {
        classNames.push("dead");
      }
      if (winnerIds.has(record.individualId)) {
        classNames.push("winner");
      }
      if (record.individualId === state.activeWinnerId) {
        classNames.push("selected");
      }

      return `
        <circle
          class="${classNames.join(" ")}"
          cx="${x.toFixed(1)}"
          cy="${y.toFixed(1)}"
          r="${radius.toFixed(2)}"
          data-individual-id="${escapeHtml(record.individualId)}"
        >
          <title>${escapeHtml(record.individualId)} / スコア ${record.score.toFixed(2)}</title>
        </circle>
      `;
    })
    .join("");

  refs.speciationPlot.innerHTML = `
    <rect class="plot-bg" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" />
    ${gridX}
    ${gridY}
    <line class="plot-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" />
    <line class="plot-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" />
    ${xLabels}
    ${yLabels}
    <text class="plot-axis-label" x="${margin.left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">断定 - 余韻</text>
    <text class="plot-axis-label" x="14" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${margin.top + plotHeight / 2})">具体度</text>
    ${points}
  `;

  const selected =
    records.find((record) => record.individualId === state.activeWinnerId) ||
    records[0];
  refs.speciationDetail.textContent = [
    `個体ID: ${selected.individualId}`,
    `断定-余韻: ${formatValue(selected.genome.assertiveness - selected.genome.afterglow)}`,
    `具体度: ${formatValue(selected.genome.concreteness)}`,
    `スコア: ${selected.score.toFixed(2)}`,
    `状態: ${selected.diag.isDead ? "死亡" : "生存"}`,
  ].join(" / ");
}

function renderParentDiffSection(record, generation, run) {
  if (generation <= 1 || !Array.isArray(record.parentIds) || record.parentIds.length === 0) {
    return `
      <section class="detail-subsection">
        <h4>親子差分</h4>
        <p class="item-meta">初期個体のため親はいません。</p>
      </section>
    `;
  }

  if (!run || !Array.isArray(run.records)) {
    return `
      <section class="detail-subsection">
        <h4>親子差分</h4>
        <p class="item-meta">親個体データの読込に失敗しました。</p>
      </section>
    `;
  }

  const parentIds = Array.from(new Set(record.parentIds.filter(Boolean)));
  if (parentIds.length === 0) {
    return `
      <section class="detail-subsection">
        <h4>親子差分</h4>
        <p class="item-meta">親IDが記録されていません。</p>
      </section>
    `;
  }

  const recordLookup = buildRecordLookup(run.records);
  const blocks = parentIds
    .map((parentId, index) => {
      const parentRecord = recordLookup.get(parentId);
      if (!parentRecord) {
        return `
          <article class="diff-block">
            <h5>親${index + 1}: ${escapeHtml(parentId)}</h5>
            <p class="item-meta">親個体の記録が見つかりません。</p>
          </article>
        `;
      }

      const rows = buildGenomeDiffRows(parentRecord.genome, record.genome);
      const table =
        rows.length === 0
          ? `<p class="item-meta">差分なし（実質クローン）</p>`
          : `<table class="kv-table">${rows.join("")}</table>`;

      return `
        <article class="diff-block">
          <h5>親${index + 1}: ${escapeHtml(parentId)}</h5>
          ${table}
        </article>
      `;
    })
    .join("");

  return `
    <section class="detail-subsection">
      <h4>親子差分</h4>
      <p class="item-meta">親ID: ${escapeHtml(parentIds.join(" / "))}</p>
      <div class="diff-list">${blocks}</div>
    </section>
  `;
}

function buildRecordLookup(records) {
  const lookup = new Map();
  for (const record of records) {
    if (!lookup.has(record.individualId)) {
      lookup.set(record.individualId, record);
    }
  }
  return lookup;
}

function buildGenomeDiffRows(parentGenome, childGenome) {
  return Object.entries(childGenome)
    .filter(([key, childValue]) => !isSameValue(parentGenome[key], childValue))
    .map(([key, childValue]) => {
      const label = GENOME_LABELS[key] || key;
      const parentValue = parentGenome[key];
      const deltaText =
        Number.isFinite(parentValue) && Number.isFinite(childValue)
          ? ` (Δ ${formatSigned(childValue - parentValue)})`
          : "";

      return `
        <tr>
          <th>${escapeHtml(label)}</th>
          <td>${escapeHtml(formatValue(parentValue))} → ${escapeHtml(formatValue(childValue))}${escapeHtml(deltaText)}</td>
        </tr>
      `;
    });
}

function renderWinnerDetail(record, generation, run) {
  if (!record) {
    refs.winnerDetail.innerHTML =
      `<p class="empty-state">勝者を選ぶと遺伝子と診断詳細を表示します。</p>`;
    return;
  }

  const parentSection = renderParentDiffSection(record, generation, run);
  const environmentText = formatEnvironmentSnapshot(record.environment);
  const environmentLine = environmentText
    ? `<p class="item-meta">環境: ${escapeHtml(environmentText)}</p>`
    : "";
  const posted = getPostedSpecimen(run?.runId, record.individualId, generation);
  const postedLine = posted
    ? `
      <p class="item-meta published-note">
        投稿済み: ${escapeHtml(posted.specimenId)}
        <a class="inline-link" href="${escapeHtml(posted.detailUrl)}" target="_blank" rel="noopener noreferrer">標本詳細を開く</a>
      </p>
    `
    : "";
  const publishLabel = posted ? "投稿済み" : "この個体を公共標本箱へ投稿";
  const publishClass = posted ? "tiny-button success" : "tiny-button";

  refs.winnerDetail.innerHTML = `
    <h3>個体詳細: ${escapeHtml(record.individualId)}</h3>
    <p class="item-meta">世代: ${generation}, スコア: ${record.score.toFixed(2)}, 死亡: ${record.diag.isDead ? "はい" : "いいえ"}</p>
    <p class="item-meta">年齢: ${record.age ?? 0}, エネルギー: ${formatEnergy(record.energy?.before)} → ${formatSigned(record.energy?.delta ?? 0)} → ${formatEnergy(record.energy?.after)}</p>
    ${environmentLine}
    <p class="item-meta">診断理由: ${escapeHtml(record.diag.reasons.join(" / "))}</p>
    ${postedLine}
    <div class="head-actions">
      <button
        class="${publishClass}"
        type="button"
        data-action="publish-winner"
        data-generation="${generation}"
        data-individual-id="${escapeHtml(record.individualId)}"
        ${posted ? "disabled" : ""}
      >
        ${publishLabel}
      </button>
    </div>
    <div class="detail-grid">
      <div>
        <h4>遺伝子</h4>
        ${renderKeyValueTable(record.genome, GENOME_LABELS)}
      </div>
      <div>
        <h4>スコア内訳</h4>
        ${renderKeyValueTable(record.scoreBreakdown, SCORE_LABELS)}
      </div>
      <div>
        <h4>診断メトリクス</h4>
        ${renderKeyValueTable(record.diag.metrics, METRIC_LABELS)}
      </div>
    </div>
    ${parentSection}
  `;
}

function renderHistory() {
  refs.reloadHistoryButton.disabled = !state.storageReady;
  refs.clearHistoryButton.disabled = state.runs.length === 0;
  refs.activeRunMeta.textContent = state.activeRunId
    ? `現在表示中: ${state.activeRunId}`
    : "現在表示中: なし";

  if (state.runs.length === 0) {
    refs.historyList.innerHTML = `<p class="empty-state">まだ実行履歴がありません。</p>`;
    return;
  }

  refs.historyList.innerHTML = state.runs
    .map((run) => {
      const topScore = run.finalGeneration?.winners[0]?.score ?? 0;
      const activeClass = run.runId === state.activeRunId ? " selected" : "";

      return `
      <article class="item-card${activeClass}">
        <h3>${escapeHtml(run.runId)}</h3>
        <p class="item-meta">日時: ${escapeHtml(formatDate(run.createdAt))}</p>
        <p class="item-meta">個体数: ${run.population}, 世代数: ${run.generationCount}</p>
        <p class="item-meta">シード: ${run.seed}</p>
        <p class="item-meta">${escapeHtml(formatEvolutionConfig(run.evolutionConfig || DEFAULT_EVOLUTION_CONFIG))}</p>
        <p class="item-meta">${escapeHtml(formatPoemStyleConfig(run.poemStyleConfig || DEFAULT_POEM_STYLE_CONFIG))}</p>
        <p class="item-meta">${escapeHtml(formatEnvironmentConfig(run.environmentConfig))}</p>
        <p class="item-meta">${escapeHtml(formatLifeConfig(run.lifeConfig || DEFAULT_LIFE_CONFIG))}</p>
        <p class="item-meta">最終トップスコア: ${topScore.toFixed(2)}</p>
        <div class="head-actions">
          <button
            class="tiny-button"
            type="button"
            data-run-id="${run.runId}"
            data-action="open"
            onclick="window.__shiseiOnHistoryInline && window.__shiseiOnHistoryInline('${run.runId}','open')"
          >
            この実行を開く
          </button>
          <button
            class="tiny-button danger"
            type="button"
            data-run-id="${run.runId}"
            data-action="delete"
            onclick="window.__shiseiOnHistoryInline && window.__shiseiOnHistoryInline('${run.runId}','delete')"
          >
            削除
          </button>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderEmptyState() {
  refs.generationTabs.innerHTML =
    `<p class="empty-state">実行すると世代タブが表示されます。</p>`;
  refs.winnersList.innerHTML =
    `<p class="empty-state">実行前です。ここに勝者が表示されます。</p>`;
  refs.winnerDetail.innerHTML =
    `<p class="empty-state">勝者を選ぶと遺伝子と診断詳細を表示します。</p>`;
  refs.speciationPlot.innerHTML = "";
  refs.speciationDetail.textContent = "点をクリックすると個体情報を表示します。";
  refs.specimenList.innerHTML =
    `<p class="empty-state">実行後に標本カードが表示されます。</p>`;
}

function renderKeyValueTable(objectValue, labelMap = {}) {
  const rows = Object.entries(objectValue)
    .map(([key, value]) => {
      const label = labelMap[key] || key;
      return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(formatValue(value))}</td></tr>`;
    })
    .join("");

  return `<table class="kv-table">${rows}</table>`;
}

function getGenerationData(run, generationNumber) {
  return (
    run.generations.find((generation) => generation.generation === generationNumber) ||
    null
  );
}

function getActiveRun() {
  return state.runs.find((run) => run.runId === state.activeRunId) || null;
}

function getPostedSpecimen(runId, individualId, generation) {
  if (!runId || !individualId || !Number.isFinite(generation)) {
    return null;
  }
  const key = buildPostedKey(runId, individualId, generation);
  return state.publishedSpecimens[key] || null;
}

function setPostedSpecimen({
  runId,
  individualId,
  generation,
  specimenId,
  detailUrl,
}) {
  if (!runId || !individualId || !Number.isFinite(generation) || !specimenId) {
    return;
  }
  const key = buildPostedKey(runId, individualId, generation);
  state.publishedSpecimens[key] = {
    specimenId,
    detailUrl: detailUrl || `/specimen/?id=${encodeURIComponent(specimenId)}`,
  };
}

function buildPostedKey(runId, individualId, generation) {
  return `${runId}::g${generation}::${individualId}`;
}

function prunePublishedByRunId(runId) {
  if (!runId) {
    return;
  }
  const prefix = `${runId}::`;
  for (const key of Object.keys(state.publishedSpecimens)) {
    if (key.startsWith(prefix)) {
      delete state.publishedSpecimens[key];
    }
  }
}

function buildPublicSpecimenPayload({ run, generation, record }) {
  return {
    collector_id: getCollectorId(),
    poem_text: record.poem,
    biome: resolveBiomeFromRun(run),
    season: resolveSeasonFromRecord(record, generation, run),
    score_total: Number(record.score) || 0,
    score_breakdown: record.scoreBreakdown || {},
    genome: record.genome || {},
    parent_ids: Array.isArray(record.parentIds) ? record.parentIds : [],
    run_hash: run.runId,
  };
}

async function postSpecimen(payload) {
  const errors = [];
  const candidates = buildApiBaseCandidates();

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/specimens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        let reason = `HTTP ${response.status}`;
        if (body && typeof body.error === "string") {
          if (body.error === "rate_limited") {
            const retryAfter = Number.parseInt(String(body.retry_after_sec || ""), 10);
            reason = Number.isFinite(retryAfter) && retryAfter > 0
              ? `投稿が多すぎます。${retryAfter}秒後に再試行してください`
              : "投稿が多すぎます。しばらく待って再試行してください";
          } else {
            reason = body.error;
          }
        }
        errors.push(`${base}: ${reason}`);
        continue;
      }

      if (!body?.ok || !body?.specimen_id) {
        errors.push(`${base}: invalid response payload`);
        continue;
      }

      return {
        specimenId: body.specimen_id,
        detailUrl: resolveSpecimenDetailUrl(body.url, body.specimen_id),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`${base}: ${reason}`);
    }
  }

  const summary =
    errors.length > 0
      ? errors.join(" | ")
      : "API endpoint is unavailable";
  if (looksLikeApiOffline(errors)) {
    throw new Error(
      "標本投稿に失敗しました。APIサーバーが未起動の可能性があります。`npm run api:dev` を別ターミナルで起動してください。",
    );
  }
  throw new Error(
    `標本投稿に失敗しました。APIサーバーを確認してください。(${summary})`,
  );
}

function resolveSpecimenDetailUrl(rawUrl, specimenId) {
  const fallback = `/specimen/?id=${encodeURIComponent(specimenId)}`;
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return fallback;
  }
  try {
    const resolved = new URL(rawUrl, window.location.origin);
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return fallback;
  }
}

function looksLikeApiOffline(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return false;
  }
  return errors.every((entry) =>
    /(Failed to fetch|HTTP 500|ECONNREFUSED|fetch failed|NetworkError)/i.test(
      String(entry),
    ),
  );
}

function buildApiBaseCandidates() {
  const fromOrigin =
    window.location.origin.startsWith("http")
      ? `${window.location.origin.replace(/\/$/, "")}/api`
      : "";
  const bucket = [fromOrigin, ...API_BASE_CANDIDATES];
  return Array.from(new Set(bucket.filter(Boolean).map((base) => base.replace(/\/$/, ""))));
}

function resolveBiomeFromRun(run) {
  const selectedPreset = refs.nutrientPreset.value.trim();
  if (BIOME_KEYS.has(selectedPreset)) {
    return selectedPreset;
  }

  const nutrients = Array.isArray(run?.nutrients) ? run.nutrients : [];
  const scores = Object.entries(presets).map(([biome, words]) => ({
    biome,
    overlap: words.reduce(
      (count, word) => count + (nutrients.includes(word) ? 1 : 0),
      0,
    ),
  }));
  const best = scores.sort((left, right) => right.overlap - left.overlap)[0];
  if (best && best.overlap > 0 && BIOME_KEYS.has(best.biome)) {
    return best.biome;
  }
  return "garden";
}

function resolveSeasonFromRecord(record, generation, run) {
  const seasonKey = record?.environment?.seasonKey;
  if (SEASON_KEYS.has(seasonKey)) {
    return seasonKey;
  }

  const configuredSeasons = Array.isArray(run?.environmentConfig?.seasons)
    ? run.environmentConfig.seasons
    : [];
  if (configuredSeasons.length > 0) {
    const configured = configuredSeasons[(generation - 1) % configuredSeasons.length]?.key;
    if (SEASON_KEYS.has(configured)) {
      return configured;
    }
  }

  const fallback = ["spring", "summer", "autumn", "winter"][(generation - 1) % 4];
  return SEASON_KEYS.has(fallback) ? fallback : "spring";
}

function getCollectorId() {
  const storageKey = "shisei:collector-id";
  try {
    const stored = window.localStorage.getItem(storageKey) || "";
    if (/^C-[0-9A-Z]{8,20}$/.test(stored)) {
      return stored;
    }
  } catch {
    // ignore localStorage errors
  }

  const generated = `C-${generateToken(12)}`;
  try {
    window.localStorage.setItem(storageKey, generated);
  } catch {
    // ignore localStorage errors
  }
  return generated;
}

function generateToken(length) {
  const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = new Uint8Array(length);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function setError(message) {
  refs.error.textContent = message;
}

function clearError() {
  refs.error.textContent = "";
}

function setInteractionStatus(message) {
  if (!refs.interactionStatus) {
    return;
  }
  const now = new Date();
  const stamp = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  refs.interactionStatus.textContent = `操作ログ [${stamp}]: ${message}`;
}

function getClosestTarget(event, selector) {
  const target = event.target;
  if (target instanceof Element) {
    return target.closest(selector);
  }
  const parent =
    target && typeof target === "object" && "parentElement" in target
      ? target.parentElement
      : null;
  if (parent instanceof Element) {
    return parent.closest(selector);
  }
  return null;
}

function parseWordList(rawValue) {
  return rawValue
    .replace(/\r?\n/g, ",")
    .replaceAll("、", ",")
    .replaceAll("，", ",")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

function normalizeCommaInput(value) {
  return String(value).replaceAll("、", ",").replaceAll("，", ",");
}

function buildRandomToxicWords(count = DEFAULT_TOXIC_WORD_COUNT) {
  const safeCount = Math.max(0, Math.min(count, TOXIC_WORD_POOL.length));
  const bucket = [...TOXIC_WORD_POOL];
  const picks = [];

  for (let i = 0; i < safeCount; i += 1) {
    const index = randomInt(0, bucket.length - 1);
    picks.push(bucket[index]);
    bucket.splice(index, 1);
  }

  return picks.join(", ");
}

function sanitizeInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeFloat(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function isSameValue(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return Math.abs(left - right) < 0.000001;
  }
  return left === right;
}

function formatSigned(value) {
  const rounded = Number(value.toFixed(3));
  const normalized = Math.abs(rounded) < 0.000001 ? 0 : rounded;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized}`;
}

function getEvolutionConfigFromForm() {
  return {
    eliteRatio: sanitizeFloat(
      refs.eliteRatio.value,
      DEFAULT_EVOLUTION_CONFIG.eliteRatio,
      0,
      1,
    ),
    diversityRatio: sanitizeFloat(
      refs.diversityRatio.value,
      DEFAULT_EVOLUTION_CONFIG.diversityRatio,
      0,
      1,
    ),
    mutationRate: sanitizeFloat(
      refs.mutationRate.value,
      DEFAULT_EVOLUTION_CONFIG.mutationRate,
      0,
      1,
    ),
    mutationStrength: sanitizeFloat(
      refs.mutationStrength.value,
      DEFAULT_EVOLUTION_CONFIG.mutationStrength,
      0,
      1,
    ),
    minElite: DEFAULT_EVOLUTION_CONFIG.minElite,
    minDiversity: DEFAULT_EVOLUTION_CONFIG.minDiversity,
  };
}

function getPoemStyleConfigFromForm() {
  return {
    particleRate: sanitizeFloat(
      refs.particleRate.value,
      DEFAULT_POEM_STYLE_CONFIG.particleRate,
      0,
      1,
    ),
    conjunctionRate: sanitizeFloat(
      refs.conjunctionRate.value,
      DEFAULT_POEM_STYLE_CONFIG.conjunctionRate,
      0,
      1,
    ),
  };
}

function applyEvolutionConfigToForm(config) {
  refs.eliteRatio.value = String(config.eliteRatio);
  refs.diversityRatio.value = String(config.diversityRatio);
  refs.mutationRate.value = String(config.mutationRate);
  refs.mutationStrength.value = String(config.mutationStrength);
}

function applyPoemStyleConfigToForm(config) {
  refs.particleRate.value = String(config.particleRate);
  refs.conjunctionRate.value = String(config.conjunctionRate);
}

function buildRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = String(state.runs.length + 1).padStart(3, "0");
  return `run-${stamp}-${suffix}`;
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.join("、");
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }
  return String(value);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEvolutionConfig(config) {
  return `進化設定: エリート ${config.eliteRatio.toFixed(2)} / 多様性 ${config.diversityRatio.toFixed(2)} / 突然変異 ${config.mutationRate.toFixed(2)} × ${config.mutationStrength.toFixed(2)}`;
}

function formatPoemStyleConfig(config) {
  return `詩設定: 助詞挿入 ${config.particleRate.toFixed(2)} / 接続詞挿入 ${config.conjunctionRate.toFixed(2)}`;
}

function formatEnvironmentConfig(config) {
  if (!config) {
    return "環境設定: 固定（旧ラン）";
  }
  if (config?.enabled === false) {
    return "環境設定: 固定";
  }
  const seasons = Array.isArray(config?.seasons) ? config.seasons : [];
  const resourceLabel =
    config?.resourceDynamics?.enabled === false ? "資源循環OFF" : "資源循環ON";
  if (seasons.length === 0) {
    return `環境設定: 季節循環 / ${resourceLabel}`;
  }
  const labels = seasons
    .map((season) => season?.label || season?.key)
    .filter(Boolean)
    .join("→");
  return `環境設定: 季節循環 (${labels}) / ${resourceLabel}`;
}

function formatLifeConfig(config) {
  const safe = {
    ...DEFAULT_LIFE_CONFIG,
    ...(config || {}),
  };
  const variablePopulation =
    safe.variablePopulationEnabled === false ? "固定個体数" : "可変個体数";
  return `生命設定: ${variablePopulation} / 初期エネルギー ${formatEnergy(safe.initialEnergy)} / 基礎代謝 ${formatEnergy(safe.baseMetabolismCost)} / 継承率 ${safe.energyInheritance.toFixed(2)}`;
}

function formatEnvironmentSnapshot(environment) {
  if (!environment) {
    return "";
  }
  const season = environment.seasonLabel || environment.seasonKey || "固定";
  const active = Array.isArray(environment.activeNutrients)
    ? environment.activeNutrients
    : [];
  const activeText = active.length > 0 ? active.join("、") : "なし";
  const boost = Number.isFinite(environment.metabolismMultiplier)
    ? `×${environment.metabolismMultiplier.toFixed(2)}`
    : "×1.00";
  const depleted = Array.isArray(environment.depletedNutrients)
    ? environment.depletedNutrients
    : [];
  const depletedText = depleted.length > 0 ? depleted.join("、") : "なし";
  return `${season} / 有効栄養: ${activeText} / 枯渇圧: ${depletedText} / 代謝係数 ${boost}`;
}

function formatEnergy(value) {
  if (!Number.isFinite(value)) {
    return "0.000";
  }
  return Number(value).toFixed(3);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
