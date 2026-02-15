const CONCRETE_BASE = [
  "石",
  "扉",
  "硝子",
  "糸",
  "川",
  "塩",
  "手",
  "蝶番",
  "窓",
  "種",
  "雨",
  "縄",
];

const ABSTRACT_BASE = [
  "記憶",
  "余白",
  "信号",
  "許し",
  "沈黙",
  "不在",
  "反響",
  "漂い",
  "意図",
  "影",
  "間隔",
  "息",
];

const ASSERTIVE_ENDINGS = [
  "だ",
  "と決める",
  "である",
  "は動かない",
  "を選ぶ",
  "を掲げる",
  "と断つ",
  "と名づける",
];

const AFTERGLOW_ENDINGS = [
  "まだ消えない",
  "薄れてゆく",
  "しばらく残る",
  "閉じきらない",
  "ほどけていく",
  "遠くで揺れる",
  "余熱を抱える",
  "名残になる",
];

const PARTICLE_TOKENS = ["の", "に", "へ", "で", "と"];
const CONJUNCTION_TOKENS = ["ただ", "そして"];
const MAX_CONJUNCTIONS_PER_POEM = 1;

export const DEFAULT_POEM_STYLE_CONFIG = {
  particleRate: 0.1,
  conjunctionRate: 0.03,
};

export function normalizePoemStyleConfig(config = {}) {
  const merged = {
    ...DEFAULT_POEM_STYLE_CONFIG,
    ...(config || {}),
  };

  return {
    particleRate: clampNumber(
      merged.particleRate,
      0,
      1,
      DEFAULT_POEM_STYLE_CONFIG.particleRate,
    ),
    conjunctionRate: clampNumber(
      merged.conjunctionRate,
      0,
      1,
      DEFAULT_POEM_STYLE_CONFIG.conjunctionRate,
    ),
  };
}

export function generatePoem({
  genome,
  nutrients,
  poemStyleConfig,
  rng = Math.random,
}) {
  const nutrientList = normalizeWords(nutrients);
  const nutrientMap = new Map(nutrientList.map((word) => [toKey(word), word]));
  const concretePool = uniqueWords([...CONCRETE_BASE, ...nutrientList]);
  const abstractPool = uniqueWords([...ABSTRACT_BASE, ...nutrientList]);
  const styleConfig = normalizePoemStyleConfig(poemStyleConfig);
  const lines = [];
  const usedNutrients = new Set();
  let conjunctionsUsed = 0;

  let previousToken = "";
  for (let lineIndex = 0; lineIndex < genome.lines; lineIndex += 1) {
    const pool = rng() < genome.concreteness ? concretePool : abstractPool;
    const baseTokens = buildLineTokens({
      genome,
      nutrientList,
      pool,
      previousToken,
      rng,
    });
    const { tokens: lineTokens, usedConjunction } = decorateLineTokens({
      tokens: baseTokens,
      styleConfig,
      lineIndex,
      allowConjunction: conjunctionsUsed < MAX_CONJUNCTIONS_PER_POEM,
      rng,
    });

    conjunctionsUsed += usedConjunction ? 1 : 0;
    previousToken = baseTokens[baseTokens.length - 1] || previousToken;
    for (const token of lineTokens) {
      const matched = nutrientMap.get(toKey(token));
      if (matched) {
        usedNutrients.add(matched);
      }
    }

    lines.push(lineTokens.join(" "));
  }

  if (nutrientList.length > 0 && usedNutrients.size === 0) {
    const forcedNutrient = pick(nutrientList, rng);
    const targetLineIndex = randomInt(0, lines.length - 1, rng);
    lines[targetLineIndex] = injectToken(lines[targetLineIndex], forcedNutrient, rng);
    usedNutrients.add(forcedNutrient);
  }

  if (lines.length > 0) {
    const endingPool =
      genome.assertiveness >= genome.afterglow
        ? ASSERTIVE_ENDINGS
        : AFTERGLOW_ENDINGS;
    const ending = pick(endingPool, rng);
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex]} ${ending}`.trim();
  }

  const poem = lines.join("\n");
  const stats = buildPoemStats(poem);

  return {
    poem,
    meta: {
      usedNutrients: Array.from(usedNutrients),
      stats,
    },
  };
}

function buildLineTokens({ genome, nutrientList, pool, previousToken, rng }) {
  const tokens = [];
  const maxTokens = Math.max(3, Math.ceil(genome.lineLen / 3));

  while (charLength(tokens) < genome.lineLen && tokens.length < maxTokens) {
    let token = pick(pool, rng);

    if (nutrientList.length > 0 && rng() < genome.nutrientMix) {
      token = pick(nutrientList, rng);
    }

    if (tokens.length > 0 && rng() < genome.repetition * 0.55) {
      token = tokens[tokens.length - 1];
    } else if (previousToken && rng() < genome.repetition * 0.25) {
      token = previousToken;
    }

    tokens.push(token);
  }

  if (tokens.length === 0) {
    tokens.push(pick(pool, rng));
  }

  return tokens;
}

function decorateLineTokens({
  tokens,
  styleConfig,
  lineIndex,
  allowConjunction,
  rng,
}) {
  const withParticles = insertParticles(tokens, styleConfig.particleRate, rng);
  if (!allowConjunction || lineIndex === 0) {
    return {
      tokens: withParticles,
      usedConjunction: false,
    };
  }

  if (rng() >= styleConfig.conjunctionRate) {
    return {
      tokens: withParticles,
      usedConjunction: false,
    };
  }

  return {
    tokens: [pick(CONJUNCTION_TOKENS, rng), ...withParticles],
    usedConjunction: true,
  };
}

function insertParticles(tokens, particleRate, rng) {
  if (tokens.length <= 1 || particleRate <= 0) {
    return tokens;
  }

  const output = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 1) {
    if (rng() < particleRate) {
      output.push(pick(PARTICLE_TOKENS, rng));
    }
    output.push(tokens[i]);
  }

  return output;
}

function buildPoemStats(poem) {
  const lines = poem.split("\n").filter(Boolean);
  const lineLengths = lines.map((line) => line.length);
  const tokens = poem.split(/\s+/).filter(Boolean);
  const tokenKeys = tokens.map(toKey);
  const uniqueTokenRatio =
    tokenKeys.length === 0
      ? 1
      : round(new Set(tokenKeys).size / tokenKeys.length);

  return {
    lineCount: lines.length,
    charCount: poem.replace(/\n/g, "").length,
    averageLineLength: round(average(lineLengths)),
    maxLineLength: lineLengths.length === 0 ? 0 : Math.max(...lineLengths),
    tokenCount: tokenKeys.length,
    uniqueTokenRatio,
    longestRepeatRun: countLongestRepeat(tokenKeys),
  };
}

function normalizeWords(words) {
  return words
    .map((word) => word.trim())
    .filter(Boolean);
}

function uniqueWords(words) {
  return Array.from(new Set(words.map((word) => word.trim()).filter(Boolean)));
}

function charLength(tokens) {
  return tokens.join(" ").length;
}

function pick(list, rng) {
  if (!list.length) {
    return "";
  }
  const index = randomInt(0, list.length - 1, rng);
  return list[index];
}

function randomInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function injectToken(line, token, rng) {
  const segments = line.split(" ").filter(Boolean);
  const index = segments.length === 0 ? 0 : randomInt(0, segments.length, rng);
  segments.splice(index, 0, token);
  return segments.join(" ").trim();
}

function toKey(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "");
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, current) => sum + current, 0);
  return total / values.length;
}

function countLongestRepeat(tokens) {
  let longest = 1;
  let current = 1;

  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === tokens[i - 1]) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return tokens.length === 0 ? 0 : longest;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Number(value.toFixed(3));
}
