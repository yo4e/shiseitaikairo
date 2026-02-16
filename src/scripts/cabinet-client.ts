import {
  BIOME_LABELS,
  PUBLIC_SPECIMENS,
  SEASON_LABELS,
  buildPoemPreview,
  formatSpecimenDate,
} from "../data/public-specimens";

type ListItem = {
  specimen_id: string;
  poem_preview: string;
  collector_id: string;
  biome: keyof typeof BIOME_LABELS;
  season: keyof typeof SEASON_LABELS;
  score_total: number;
  likes: number;
  created_at: string;
};

type ListResponse = {
  ok: boolean;
  items?: ListItem[];
};

type FilterState = {
  biome: string;
  season: string;
};

type ViewMode = "both" | "new" | "hot";

const BIOME_KEYS = new Set(Object.keys(BIOME_LABELS));
const SEASON_KEYS = new Set(Object.keys(SEASON_LABELS));
const VIEW_MODES = new Set<ViewMode>(["both", "new", "hot"]);

async function boot() {
  const root = document.getElementById("cabinet-root");
  const status = document.getElementById("cabinet-status");
  const newContainer = document.getElementById("new-specimens");
  const hotContainer = document.getElementById("hot-specimens");
  const newBlock = document.getElementById("cabinet-block-new");
  const hotBlock = document.getElementById("cabinet-block-hot");
  const biomeSelect = document.getElementById("filter-biome");
  const seasonSelect = document.getElementById("filter-season");
  const applyButton = document.getElementById("apply-filters");
  const clearButton = document.getElementById("clear-filters");
  const viewButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-view-mode]"),
  );

  if (!root || !status || !newContainer || !hotContainer || !newBlock || !hotBlock) {
    return;
  }

  const apiBase = (root.getAttribute("data-api-base") || "/api").replace(/\/$/, "");
  const initialFilters = getFiltersFromQuery();
  let currentView = getViewModeFromQuery();
  setFilterElements(biomeSelect, seasonSelect, initialFilters);
  applyViewMode(currentView, viewButtons, newBlock, hotBlock);

  const runLoad = async (filters: FilterState) => {
    const query = buildFilterQuery(filters);
    syncQuery(filters, currentView);

    try {
      const [newResult, hotResult] = await Promise.all([
        fetchList(`${apiBase}/specimens?sort=new&limit=20${query}`),
        fetchList(`${apiBase}/specimens?sort=hot&limit=20${query}`),
      ]);

      newContainer.innerHTML = renderCards(newResult.items || [], false, "新着");
      hotContainer.innerHTML = renderCards(hotResult.items || [], true, "人気");
      setStatus(
        status,
        `${buildFilterLabel(filters)}でAPI表示しています。`,
        "ok",
      );
    } catch (error) {
      console.error(error);
      const [newItems, hotItems] = buildMockCards(filters);
      newContainer.innerHTML = renderCards(newItems, false, "新着");
      hotContainer.innerHTML = renderCards(hotItems, true, "人気");
      setStatus(
        status,
        `${buildFilterLabel(filters)}でモック表示中です（API未接続）。`,
        "warn",
      );
    }
  };

  const onApply = () => {
    const filters = readFiltersFromElements(biomeSelect, seasonSelect);
    void runLoad(filters);
  };

  const onClear = () => {
    const cleared = {
      biome: "",
      season: "",
    };
    setFilterElements(biomeSelect, seasonSelect, cleared);
    void runLoad(cleared);
  };

  if (applyButton instanceof HTMLButtonElement) {
    applyButton.addEventListener("click", onApply);
  }
  if (clearButton instanceof HTMLButtonElement) {
    clearButton.addEventListener("click", onClear);
  }
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      const mode = sanitizeViewMode(button.dataset.viewMode || "");
      if (mode === currentView) {
        return;
      }
      currentView = mode;
      applyViewMode(currentView, viewButtons, newBlock, hotBlock);
      const filters = readFiltersFromElements(biomeSelect, seasonSelect);
      syncQuery(filters, currentView);
    });
  }

  void runLoad(initialFilters);
}

async function fetchList(url: string): Promise<ListResponse> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }

  const payload = (await response.json()) as ListResponse;
  if (!payload.ok) {
    throw new Error("api returned not ok");
  }

  return payload;
}

function readFiltersFromElements(
  biomeSelect: Element | null,
  seasonSelect: Element | null,
): FilterState {
  const biome =
    biomeSelect instanceof HTMLSelectElement ? biomeSelect.value.trim() : "";
  const season =
    seasonSelect instanceof HTMLSelectElement ? seasonSelect.value.trim() : "";
  return sanitizeFilters({
    biome,
    season,
  });
}

function setFilterElements(
  biomeSelect: Element | null,
  seasonSelect: Element | null,
  filters: FilterState,
) {
  if (biomeSelect instanceof HTMLSelectElement) {
    biomeSelect.value = filters.biome;
  }
  if (seasonSelect instanceof HTMLSelectElement) {
    seasonSelect.value = filters.season;
  }
}

function getFiltersFromQuery(): FilterState {
  const query = new URLSearchParams(window.location.search);
  const biome = query.get("biome") || "";
  const season = query.get("season") || "";
  return sanitizeFilters({ biome, season });
}

function getViewModeFromQuery(): ViewMode {
  const query = new URLSearchParams(window.location.search);
  return sanitizeViewMode(query.get("view") || "");
}

function sanitizeFilters(filters: FilterState): FilterState {
  return {
    biome: BIOME_KEYS.has(filters.biome) ? filters.biome : "",
    season: SEASON_KEYS.has(filters.season) ? filters.season : "",
  };
}

function buildFilterQuery(filters: FilterState): string {
  const query = new URLSearchParams();
  if (filters.biome) {
    query.set("biome", filters.biome);
  }
  if (filters.season) {
    query.set("season", filters.season);
  }
  const text = query.toString();
  return text ? `&${text}` : "";
}

function syncQuery(filters: FilterState, viewMode: ViewMode) {
  const url = new URL(window.location.href);
  if (filters.biome) {
    url.searchParams.set("biome", filters.biome);
  } else {
    url.searchParams.delete("biome");
  }
  if (filters.season) {
    url.searchParams.set("season", filters.season);
  } else {
    url.searchParams.delete("season");
  }
  if (viewMode !== "both") {
    url.searchParams.set("view", viewMode);
  } else {
    url.searchParams.delete("view");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function sanitizeViewMode(value: string): ViewMode {
  const normalized = String(value).trim();
  if (VIEW_MODES.has(normalized as ViewMode)) {
    return normalized as ViewMode;
  }
  return "both";
}

function applyViewMode(
  mode: ViewMode,
  buttons: HTMLButtonElement[],
  newBlock: HTMLElement,
  hotBlock: HTMLElement,
) {
  const showNew = mode === "both" || mode === "new";
  const showHot = mode === "both" || mode === "hot";
  newBlock.hidden = !showNew;
  hotBlock.hidden = !showHot;

  for (const button of buttons) {
    const active = (button.dataset.viewMode || "") === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function buildFilterLabel(filters: FilterState): string {
  const biomeLabel = filters.biome
    ? BIOME_LABELS[filters.biome as keyof typeof BIOME_LABELS] || filters.biome
    : "全バイオーム";
  const seasonLabel = filters.season
    ? SEASON_LABELS[filters.season as keyof typeof SEASON_LABELS] || filters.season
    : "全季節";
  return `${biomeLabel} / ${seasonLabel}`;
}

function buildMockCards(filters: FilterState): [ListItem[], ListItem[]] {
  const filtered = PUBLIC_SPECIMENS.filter((item) => {
    if (filters.biome && item.biome !== filters.biome) {
      return false;
    }
    if (filters.season && item.season !== filters.season) {
      return false;
    }
    return true;
  }).map((item) => ({
    specimen_id: item.specimenId,
    poem_preview: buildPoemPreview(item.poem, 3),
    collector_id: item.collectorId,
    biome: item.biome,
    season: item.season,
    score_total: item.scoreTotal,
    likes: item.likes,
    created_at: item.createdAt,
  }));

  const newItems = [...filtered].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
  const hotItems = [...filtered].sort((left, right) => {
    if (right.likes !== left.likes) {
      return right.likes - left.likes;
    }
    return right.created_at.localeCompare(left.created_at);
  });

  return [newItems, hotItems];
}

function renderCards(
  items: ListItem[],
  includeRank: boolean,
  sectionLabel: string,
): string {
  if (items.length === 0) {
    return `
      <article class="specimen-card">
        <p class="specimen-meta">${escapeHtml(sectionLabel)}の条件に一致する標本はありません。</p>
      </article>
    `;
  }

  return items
    .map((item, index) => {
      const title = includeRank
        ? `#${index + 1} ${escapeHtml(item.specimen_id)}`
        : escapeHtml(item.specimen_id);

      const biome = BIOME_LABELS[item.biome] || item.biome;
      const season = SEASON_LABELS[item.season] || item.season;

      return `
        <article class="specimen-card">
          <div class="specimen-head">
            <strong>${title}</strong>
            <span>${escapeHtml(formatSpecimenDate(item.created_at))}</span>
          </div>
          <p class="poem-snippet">${escapeHtml(item.poem_preview)}</p>
          <p class="specimen-meta">採取者: ${escapeHtml(item.collector_id)} / スコア: ${formatNumber(item.score_total)} / いいね: ${item.likes}</p>
          <div class="chip-list">
            <span class="chip">${escapeHtml(biome)}</span>
            <span class="chip">${escapeHtml(season)}</span>
          </div>
          <div class="hero-actions">
            <a class="button secondary" href="/specimen/?id=${encodeURIComponent(item.specimen_id)}">詳細</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(
  element: HTMLElement,
  message: string,
  state: "ok" | "warn" | "error",
) {
  element.textContent = message;
  element.classList.remove("status-ok", "status-warn", "status-error");
  element.classList.add(`status-${state}`);
}

void boot();
