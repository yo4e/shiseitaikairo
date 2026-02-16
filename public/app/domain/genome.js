const LIMITS = {
  lines: { min: 4, max: 16 },
  lineLen: { min: 8, max: 24 },
  unit: { min: 0, max: 1 },
};

const ASSERTIVE_AFTERGLOW_CAP = 1.2;
const GENOME_FIELDS = [
  "lines",
  "lineLen",
  "assertiveness",
  "afterglow",
  "concreteness",
  "repetition",
  "nutrientMix",
  "immunity",
];

export const GENOME_KEYS = GENOME_FIELDS;

export function createInitialPopulation(populationSize, rng = Math.random) {
  return Array.from({ length: populationSize }, (_, idx) => ({
    id: `g1-i${idx + 1}`,
    parentIds: [],
    genome: createRandomGenome(rng),
  }));
}

export function createRandomGenome(rng = Math.random) {
  const genome = {
    lines: randomInt(LIMITS.lines.min, LIMITS.lines.max, rng),
    lineLen: randomInt(LIMITS.lineLen.min, LIMITS.lineLen.max, rng),
    assertiveness: randomUnit(rng),
    afterglow: randomUnit(rng),
    concreteness: randomUnit(rng),
    repetition: randomUnit(rng),
    nutrientMix: randomUnit(rng),
    immunity: randomUnit(rng),
  };

  return normalizeGenome(genome);
}

export function normalizeGenome(genome) {
  const normalized = {
    lines: clampInt(genome.lines, LIMITS.lines.min, LIMITS.lines.max),
    lineLen: clampInt(genome.lineLen, LIMITS.lineLen.min, LIMITS.lineLen.max),
    assertiveness: clampUnit(genome.assertiveness),
    afterglow: clampUnit(genome.afterglow),
    concreteness: clampUnit(genome.concreteness),
    repetition: clampUnit(genome.repetition),
    nutrientMix: clampUnit(genome.nutrientMix),
    immunity: clampUnit(genome.immunity),
  };

  const sum = normalized.assertiveness + normalized.afterglow;
  if (sum > ASSERTIVE_AFTERGLOW_CAP) {
    const ratio = ASSERTIVE_AFTERGLOW_CAP / sum;
    normalized.assertiveness = round(normalized.assertiveness * ratio);
    normalized.afterglow = round(normalized.afterglow * ratio);
  }

  normalized.assertiveness = round(normalized.assertiveness);
  normalized.afterglow = round(normalized.afterglow);
  normalized.concreteness = round(normalized.concreteness);
  normalized.repetition = round(normalized.repetition);
  normalized.nutrientMix = round(normalized.nutrientMix);
  normalized.immunity = round(normalized.immunity);
  return normalized;
}

export function crossoverGenomes(leftGenome, rightGenome, rng = Math.random) {
  const child = {};
  for (const key of GENOME_FIELDS) {
    child[key] = rng() < 0.5 ? leftGenome[key] : rightGenome[key];
  }
  return normalizeGenome(child);
}

export function mutateGenome(
  genome,
  { mutationRate = 0.12, mutationStrength = 0.18, rng = Math.random } = {},
) {
  const next = { ...genome };

  if (rng() < mutationRate) {
    next.lines += randomInt(-2, 2, rng);
  }

  if (rng() < mutationRate) {
    next.lineLen += randomInt(-3, 3, rng);
  }

  if (rng() < mutationRate) {
    next.assertiveness += randomSigned(mutationStrength, rng);
  }

  if (rng() < mutationRate) {
    next.afterglow += randomSigned(mutationStrength, rng);
  }

  if (rng() < mutationRate) {
    next.concreteness += randomSigned(mutationStrength, rng);
  }

  if (rng() < mutationRate) {
    next.repetition += randomSigned(mutationStrength * 0.8, rng);
  }

  if (rng() < mutationRate) {
    next.nutrientMix += randomSigned(mutationStrength, rng);
  }

  if (rng() < mutationRate) {
    next.immunity += randomSigned(mutationStrength * 0.7, rng);
  }

  return normalizeGenome(next);
}

function randomUnit(rng) {
  return round(rng());
}

function randomInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomSigned(span, rng) {
  return (rng() * 2 - 1) * span;
}

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampUnit(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(LIMITS.unit.max, Math.max(LIMITS.unit.min, value));
}

function round(value) {
  return Number(value.toFixed(3));
}
