export type BiomeKey =
  | "garden"
  | "work"
  | "cosmic"
  | "body"
  | "harbor"
  | "ritual";

export type SeasonKey = "spring" | "summer" | "autumn" | "winter";

export interface PublicSpecimen {
  specimenId: string;
  collectorId: string;
  poem: string;
  biome: BiomeKey;
  season: SeasonKey;
  scoreTotal: number;
  likes: number;
  createdAt: string;
  diagnosisReasons: string[];
  parentIds: string[];
  genomeSummary: {
    lines: number;
    lineLen: number;
    assertiveness: number;
    afterglow: number;
    concreteness: number;
    nutrientMix: number;
    immunity: number;
  };
}

export const BIOME_LABELS: Record<BiomeKey, string> = {
  garden: "庭園",
  work: "仕事",
  cosmic: "宇宙",
  body: "身体",
  harbor: "港湾",
  ritual: "儀式",
};

export const SEASON_LABELS: Record<SeasonKey, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

export const PUBLIC_SPECIMENS: PublicSpecimen[] = [
  {
    specimenId: "S-20260215-0Q3D7K",
    collectorId: "C-7F3A2K9M9Q2D",
    poem: [
      "瓶 反響 許し",
      "濡い 窓 余白",
      "ルッコラ フェンネル 風",
      "余熱を抱える",
    ].join("\n"),
    biome: "garden",
    season: "autumn",
    scoreTotal: 82.28,
    likes: 19,
    createdAt: "2026-02-15T00:46:47.335Z",
    diagnosisReasons: ["季節逆風"],
    parentIds: ["g1-i8", "g1-i14"],
    genomeSummary: {
      lines: 4,
      lineLen: 18,
      assertiveness: 0.47,
      afterglow: 0.65,
      concreteness: 0.72,
      nutrientMix: 0.41,
      immunity: 0.77,
    },
  },
  {
    specimenId: "S-20260215-1A8RV1",
    collectorId: "C-1PK4MMJ8QH6N",
    poem: [
      "承認 見積 と 記憶",
      "ただ 差戻し 期限",
      "議事録 に 余白",
      "名残になる",
    ].join("\n"),
    biome: "work",
    season: "winter",
    scoreTotal: 79.64,
    likes: 11,
    createdAt: "2026-02-15T01:05:12.101Z",
    diagnosisReasons: ["季節逆風", "安定"],
    parentIds: ["g2-i3", "g2-i11"],
    genomeSummary: {
      lines: 4,
      lineLen: 17,
      assertiveness: 0.58,
      afterglow: 0.33,
      concreteness: 0.61,
      nutrientMix: 0.44,
      immunity: 0.7,
    },
  },
  {
    specimenId: "S-20260215-4M2GZP",
    collectorId: "C-DM2K5Z2Q0W8P",
    poem: [
      "星図 重力 と 余白",
      "軌道 は閉じきらない",
      "境界 に 風 が残る",
      "薄れてゆく",
    ].join("\n"),
    biome: "cosmic",
    season: "spring",
    scoreTotal: 84.91,
    likes: 27,
    createdAt: "2026-02-15T01:22:59.412Z",
    diagnosisReasons: ["季節追い風"],
    parentIds: ["g3-i1", "g3-i6"],
    genomeSummary: {
      lines: 4,
      lineLen: 16,
      assertiveness: 0.36,
      afterglow: 0.78,
      concreteness: 0.54,
      nutrientMix: 0.39,
      immunity: 0.81,
    },
  },
  {
    specimenId: "S-20260215-8T5LQ2",
    collectorId: "C-Z8Q2N4RV1A5M",
    poem: [
      "祈り 灰 に 鐘",
      "そして 印 の 布",
      "沈香 は 手へ戻る",
      "まだ消えない",
    ].join("\n"),
    biome: "ritual",
    season: "summer",
    scoreTotal: 80.17,
    likes: 14,
    createdAt: "2026-02-15T01:33:46.282Z",
    diagnosisReasons: ["安定"],
    parentIds: ["g2-i2", "g2-i9"],
    genomeSummary: {
      lines: 4,
      lineLen: 15,
      assertiveness: 0.52,
      afterglow: 0.49,
      concreteness: 0.67,
      nutrientMix: 0.42,
      immunity: 0.74,
    },
  },
  {
    specimenId: "S-20260215-9WF3KD",
    collectorId: "C-3KD9WF1M8P0R",
    poem: [
      "潮 霧笛 に 帆",
      "船影 の 間隔",
      "港 へ 余白 を運ぶ",
      "遠くで揺れる",
    ].join("\n"),
    biome: "harbor",
    season: "autumn",
    scoreTotal: 78.33,
    likes: 9,
    createdAt: "2026-02-15T01:41:08.904Z",
    diagnosisReasons: ["季節逆風", "栄養偏り"],
    parentIds: ["g1-i5", "g1-i20"],
    genomeSummary: {
      lines: 4,
      lineLen: 18,
      assertiveness: 0.41,
      afterglow: 0.62,
      concreteness: 0.69,
      nutrientMix: 0.37,
      immunity: 0.68,
    },
  },
];

export function formatSpecimenDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildPoemPreview(poem: string, maxLines = 3): string {
  return poem
    .split("\n")
    .slice(0, maxLines)
    .join("\n");
}
