export function diagnosePoem({
  poem,
  genome,
  nutrients,
  toxicWords,
  meta,
  environment,
}) {
  const reasons = [];
  const stats = meta.stats;

  const metabolismScore = evaluateMetabolism({
    usedNutrients: meta.usedNutrients,
    nutrientsExpected: nutrients.length,
    environment,
    reasons,
  });
  const structureScore = evaluateStructure(stats, genome, reasons);

  const toxicHits = findToxicHits(poem, toxicWords);
  const isDead = toxicHits.length > 0;
  let toxinPenalty = toxicHits.length * 35;
  toxinPenalty = round(toxinPenalty * (1 - genome.immunity * 0.7));
  if (isDead) {
    toxinPenalty = Math.max(toxinPenalty, 80);
    reasons.push("毒語を検出");
    reasons.push("死亡判定");
  }

  const repetitionPenalty = evaluateRepetition(stats, reasons);

  const rawScore =
    metabolismScore + structureScore - toxinPenalty - repetitionPenalty;
  const score = isDead ? 0 : clamp(round(rawScore), 0, 100);

  if (reasons.length === 0) {
    reasons.push("安定");
  }

  return {
    score,
    scoreBreakdown: {
      metabolismScore,
      structureScore,
      toxinPenalty,
      repetitionPenalty,
    },
    diag: {
      reasons,
      isDead,
      toxicHits,
      nutrientsExpected: nutrients.length,
      metrics: {
        lineCount: stats.lineCount,
        averageLineLength: stats.averageLineLength,
        uniqueTokenRatio: stats.uniqueTokenRatio,
        longestRepeatRun: stats.longestRepeatRun,
      },
    },
  };
}

function evaluateMetabolism({
  usedNutrients,
  nutrientsExpected,
  environment,
  reasons,
}) {
  if (usedNutrients.length === 0) {
    reasons.push("栄養不足");
    return 0;
  }

  const expected = Math.max(1, nutrientsExpected);
  const coverage = usedNutrients.length / expected;
  let baseScore = 0;

  if (coverage >= 0.75 || usedNutrients.length >= 3) {
    baseScore = 38;
  } else if (coverage >= 0.4 || usedNutrients.length >= 2) {
    baseScore = 32;
  } else {
    baseScore = 24;
    reasons.push("栄養偏り");
  }

  const multiplier = Number.isFinite(environment?.metabolismMultiplier)
    ? environment.metabolismMultiplier
    : 1;

  if (multiplier >= 1.06) {
    reasons.push("季節追い風");
  } else if (multiplier <= 0.94) {
    reasons.push("季節逆風");
  }

  return clamp(round(baseScore * multiplier), 0, 45);
}

function evaluateStructure(stats, genome, reasons) {
  let score = 0;

  if (stats.lineCount >= 4 && stats.lineCount <= 16) {
    score += 12;
  } else {
    reasons.push("構造崩れ");
  }

  if (Math.abs(stats.lineCount - genome.lines) <= 2) {
    score += 8;
  }

  const minAverage = Math.max(4, genome.lineLen * 0.4);
  const maxAverage = genome.lineLen * 1.8;
  if (
    stats.averageLineLength >= minAverage &&
    stats.averageLineLength <= maxAverage
  ) {
    score += 14;
  } else {
    reasons.push("行長の逸脱");
  }

  if (stats.maxLineLength > genome.lineLen * 2.4) {
    reasons.push("長すぎる行");
  } else {
    score += 8;
  }

  return score;
}

function evaluateRepetition(stats, reasons) {
  let penalty = 0;

  if (stats.uniqueTokenRatio < 0.32) {
    penalty += 25;
    reasons.push("反復発作");
  } else if (stats.uniqueTokenRatio < 0.45) {
    penalty += 12;
    reasons.push("反復過多");
  }

  if (stats.longestRepeatRun >= 4) {
    penalty += 10;
    reasons.push("同語連打");
  }

  return penalty;
}

function findToxicHits(poem, toxicWords) {
  const lowered = poem.toLowerCase();
  return toxicWords
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => lowered.includes(word.toLowerCase()));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Number(value.toFixed(3));
}
