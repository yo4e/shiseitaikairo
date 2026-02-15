import {
  createInitialPopulation,
  crossoverGenomes,
  mutateGenome,
} from "./genome.js";
import {
  DEFAULT_POEM_STYLE_CONFIG,
  generatePoem,
  normalizePoemStyleConfig,
} from "./poem.js";
import { diagnosePoem } from "./health.js";
import { createSeededRng } from "./rng.js";

export const DEFAULT_EVOLUTION_CONFIG = {
  eliteRatio: 0.2,
  diversityRatio: 0.07,
  minElite: 2,
  minDiversity: 1,
  mutationRate: 0.12,
  mutationStrength: 0.18,
};

const DEFAULT_SEASONS = [
  {
    key: "spring",
    label: "春",
    focusRatio: 0.9,
    metabolismMultiplier: 1.06,
  },
  {
    key: "summer",
    label: "夏",
    focusRatio: 0.75,
    metabolismMultiplier: 1.02,
  },
  {
    key: "autumn",
    label: "秋",
    focusRatio: 0.65,
    metabolismMultiplier: 0.97,
  },
  {
    key: "winter",
    label: "冬",
    focusRatio: 0.55,
    metabolismMultiplier: 0.92,
  },
];

export const DEFAULT_ENVIRONMENT_CONFIG = {
  mode: "seasonal-v1",
  enabled: true,
  seasons: DEFAULT_SEASONS,
  resourceDynamics: {
    enabled: true,
    depletionThreshold: 0.55,
    depletionGain: 0.42,
    recoveryRate: 0.18,
    inactiveRecoveryBonus: 0.12,
    depletionLevel: 0.58,
    metabolismImpact: 0.22,
  },
};

export const DEFAULT_LIFE_CONFIG = {
  variablePopulationEnabled: true,
  minPopulationRatio: 0.55,
  maxPopulationRatio: 1.6,
  initialEnergy: 100,
  maxEnergy: 150,
  minBirthEnergy: 28,
  energyDeathThreshold: 1,
  baseMetabolismCost: 16,
  scoreToEnergyScale: 0.34,
  seasonEnergyScale: 12,
  energyInheritance: 0.72,
  birthEnergyJitter: 6,
};
export { DEFAULT_POEM_STYLE_CONFIG };

export function runSimulation({
  runId,
  populationSize,
  generationCount,
  nutrients,
  toxicWords,
  seed,
  evolutionConfig,
  poemStyleConfig,
  environmentConfig,
  lifeConfig,
}) {
  const seededRng = createSeededRng(seed);
  const rng = seededRng.next;
  const config = normalizeEvolutionConfig(evolutionConfig);
  const styleConfig = normalizePoemStyleConfig(poemStyleConfig);
  const envConfig = normalizeEnvironmentConfig(environmentConfig);
  const normalizedLife = normalizeLifeConfig(lifeConfig);
  const nutrientPool = uniqueList(nutrients);

  let individuals = initializeIndividuals(
    createInitialPopulation(populationSize, rng),
    normalizedLife,
  );
  let resourceState = createInitialResourceState(nutrientPool);
  const generations = [];

  for (let generation = 1; generation <= generationCount; generation += 1) {
    const environment = resolveGenerationEnvironment({
      generation,
      nutrients: nutrientPool,
      config: envConfig,
      resourceState,
    });

    const evaluation = evaluateGeneration({
      runId,
      generation,
      individuals,
      toxicWords,
      poemStyleConfig: styleConfig,
      environment,
      lifeConfig: normalizedLife,
      rng,
    });

    generations.push(evaluation);
    resourceState = evolveResourceState({
      resourceState,
      records: evaluation.records,
      nutrients: nutrientPool,
      environment,
      config: envConfig.resourceDynamics,
    });

    if (generation < generationCount) {
      individuals = breedNextPopulation({
        records: evaluation.records,
        nextGeneration: generation + 1,
        initialPopulationSize: populationSize,
        config,
        lifeConfig: normalizedLife,
        rng,
      });
    }
  }

  const records = generations.flatMap((generation) => generation.records);
  const finalGeneration = generations[generations.length - 1] || null;

  return {
    seed: seededRng.seed,
    generations,
    records,
    finalGeneration,
    specimens: buildSpecimens(generations),
    evolutionConfig: config,
    poemStyleConfig: styleConfig,
    environmentConfig: envConfig,
    lifeConfig: normalizedLife,
  };
}

function evaluateGeneration({
  runId,
  generation,
  individuals,
  toxicWords,
  poemStyleConfig,
  environment,
  lifeConfig,
  rng,
}) {
  const activeNutrients =
    environment.activeNutrients.length > 0
      ? environment.activeNutrients
      : environment.baseNutrients;

  const records = individuals.map((individual) => {
    const { poem, meta } = generatePoem({
      genome: individual.genome,
      nutrients: activeNutrients,
      poemStyleConfig,
      rng,
    });

    const diagnosis = diagnosePoem({
      poem,
      genome: individual.genome,
      nutrients: activeNutrients,
      toxicWords,
      meta,
      environment,
    });

    const energyBefore = clampNumber(
      individual.energy,
      0,
      lifeConfig.maxEnergy,
      lifeConfig.initialEnergy,
    );
    const energyDelta = computeEnergyDelta({
      diagnosis,
      environment,
      lifeConfig,
    });
    const energyAfter = diagnosis.diag.isDead
      ? 0
      : clampNumber(
          energyBefore + energyDelta,
          0,
          lifeConfig.maxEnergy,
          0,
        );
    const diedByEnergy = !diagnosis.diag.isDead && energyAfter <= lifeConfig.energyDeathThreshold;
    const isDead = diagnosis.diag.isDead || diedByEnergy;
    const reasons = [...diagnosis.diag.reasons];
    if (diedByEnergy) {
      reasons.push("エネルギー枯渇");
    }

    return {
      runId,
      generation,
      individualId: individual.id,
      parentIds: individual.parentIds,
      age: individual.age ?? 0,
      genome: individual.genome,
      nutrients: activeNutrients,
      toxicWords,
      environment,
      poem,
      meta,
      energy: {
        before: round(energyBefore),
        delta: round(isDead ? -energyBefore : energyDelta),
        after: round(isDead ? 0 : energyAfter),
      },
      score: isDead ? 0 : diagnosis.score,
      scoreBreakdown: diagnosis.scoreBreakdown,
      diag: {
        ...diagnosis.diag,
        isDead,
        reasons,
      },
    };
  });

  const ranked = [...records].sort((left, right) => right.score - left.score);
  const winners = ranked.slice(0, 3);
  const livingCount = records.filter((record) => !record.diag.isDead).length;

  return {
    generation,
    records: ranked,
    winners,
    livingCount,
    deadCount: records.length - livingCount,
    environment,
  };
}

function breedNextPopulation({
  records,
  nextGeneration,
  initialPopulationSize,
  config,
  lifeConfig,
  rng,
}) {
  const living = records.filter((record) => !record.diag.isDead);
  const source = living.length > 0 ? living : records;
  const parentPool = selectParents(source, config, rng);
  const fallbackPool = parentPool.length > 0 ? parentPool : source;
  const targetPopulation = estimateNextPopulation({
    records,
    living,
    initialPopulationSize,
    lifeConfig,
  });

  return Array.from({ length: targetPopulation }, (_, index) => {
    const parentA = pick(fallbackPool, rng);
    const parentB = pick(fallbackPool, rng);
    const crossed = crossoverGenomes(parentA.genome, parentB.genome, rng);
    const genome = mutateGenome(crossed, {
      mutationRate: config.mutationRate,
      mutationStrength: config.mutationStrength,
      rng,
    });
    const inheritedEnergy = inheritEnergy({
      parentA,
      parentB,
      lifeConfig,
      rng,
    });

    return {
      id: `g${nextGeneration}-i${index + 1}`,
      parentIds: [parentA.individualId, parentB.individualId],
      age: Math.max(parentA.age ?? 0, parentB.age ?? 0) + 1,
      energy: inheritedEnergy,
      genome,
    };
  });
}

function selectParents(records, config, rng) {
  const living = records.filter((record) => !record.diag.isDead);
  const source = living.length > 0 ? living : records;

  if (source.length === 0) {
    return [];
  }

  const eliteMinimum = Math.min(config.minElite, source.length);
  const eliteCount = clamp(
    Math.round(source.length * config.eliteRatio),
    eliteMinimum,
    source.length,
  );
  const availableForDiversity = Math.max(0, source.length - eliteCount);
  const diversityMinimum =
    availableForDiversity > 0 ? config.minDiversity : 0;
  const diversityCount = clamp(
    Math.round(source.length * config.diversityRatio),
    diversityMinimum,
    availableForDiversity,
  );

  const elite = source.slice(0, eliteCount);
  const remainder = source.slice(eliteCount);
  const diversityCandidates = remainder.length > 0 ? remainder : source;
  const diversity = sampleWithoutReplacement(
    diversityCandidates,
    diversityCount,
    rng,
  );

  const pool = dedupeByIndividualId([...elite, ...diversity]);

  if (pool.length >= 2 || source.length <= 1) {
    return pool;
  }

  while (pool.length < 2 && pool.length < source.length) {
    const candidate = pick(source, rng);
    if (!pool.some((record) => record.individualId === candidate.individualId)) {
      pool.push(candidate);
    }
  }

  return pool;
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

function initializeIndividuals(individuals, lifeConfig) {
  return individuals.map((individual) => ({
    ...individual,
    age: 0,
    energy: round(lifeConfig.initialEnergy),
  }));
}

function computeEnergyDelta({ diagnosis, environment, lifeConfig }) {
  if (diagnosis.diag.isDead) {
    return -lifeConfig.maxEnergy;
  }

  const scoreGain = diagnosis.score * lifeConfig.scoreToEnergyScale;
  const seasonDrift =
    (environment?.metabolismMultiplier ?? 1) - 1;
  return round(
    scoreGain -
      lifeConfig.baseMetabolismCost +
      seasonDrift * lifeConfig.seasonEnergyScale,
  );
}

function estimateNextPopulation({
  records,
  living,
  initialPopulationSize,
  lifeConfig,
}) {
  if (!lifeConfig.variablePopulationEnabled) {
    return initialPopulationSize;
  }

  const minimum = clampInteger(
    Math.round(initialPopulationSize * lifeConfig.minPopulationRatio),
    4,
    10000,
    initialPopulationSize,
  );
  const maximum = clampInteger(
    Math.round(initialPopulationSize * lifeConfig.maxPopulationRatio),
    minimum,
    10000,
    initialPopulationSize,
  );
  if (living.length === 0) {
    return minimum;
  }

  const avgEnergy = average(
    living.map((record) => record.energy?.after ?? lifeConfig.initialEnergy),
  );
  const avgScore = average(living.map((record) => record.score));
  const survivalRatio = living.length / Math.max(1, records.length);
  const growthSignal =
    avgEnergy / lifeConfig.maxEnergy * 0.45 +
    avgScore / 100 * 0.35 +
    survivalRatio * 0.2;
  const targetRatio = 0.65 + growthSignal;

  return clampInteger(
    Math.round(initialPopulationSize * targetRatio),
    minimum,
    maximum,
    initialPopulationSize,
  );
}

function inheritEnergy({ parentA, parentB, lifeConfig, rng }) {
  const parentEnergyA = parentA.energy?.after ?? lifeConfig.initialEnergy;
  const parentEnergyB = parentB.energy?.after ?? lifeConfig.initialEnergy;
  const inheritedBase =
    (parentEnergyA + parentEnergyB) * 0.5 * lifeConfig.energyInheritance;
  const jitter = randomFloat(
    -lifeConfig.birthEnergyJitter,
    lifeConfig.birthEnergyJitter,
    rng,
  );
  return round(
    clampNumber(
      inheritedBase + jitter,
      lifeConfig.minBirthEnergy,
      lifeConfig.maxEnergy,
      lifeConfig.initialEnergy,
    ),
  );
}

function sampleWithoutReplacement(list, count, rng) {
  if (count <= 0 || list.length === 0) {
    return [];
  }

  const bucket = [...list];
  const picks = [];
  const total = Math.min(count, bucket.length);

  for (let i = 0; i < total; i += 1) {
    const index = randomInt(0, bucket.length - 1, rng);
    picks.push(bucket[index]);
    bucket.splice(index, 1);
  }

  return picks;
}

function dedupeByIndividualId(records) {
  const seen = new Set();
  const deduped = [];

  for (const record of records) {
    if (seen.has(record.individualId)) {
      continue;
    }
    seen.add(record.individualId);
    deduped.push(record);
  }

  return deduped;
}

function pick(list, rng) {
  const index = randomInt(0, list.length - 1, rng);
  return list[index];
}

function randomInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomFloat(min, max, rng) {
  return rng() * (max - min) + min;
}

function clamp(value, min, max) {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeEvolutionConfig(config = {}) {
  const merged = {
    ...DEFAULT_EVOLUTION_CONFIG,
    ...(config || {}),
  };

  return {
    eliteRatio: clampNumber(merged.eliteRatio, 0, 1, DEFAULT_EVOLUTION_CONFIG.eliteRatio),
    diversityRatio: clampNumber(
      merged.diversityRatio,
      0,
      1,
      DEFAULT_EVOLUTION_CONFIG.diversityRatio,
    ),
    minElite: clampInteger(merged.minElite, 1, 1000, DEFAULT_EVOLUTION_CONFIG.minElite),
    minDiversity: clampInteger(
      merged.minDiversity,
      0,
      1000,
      DEFAULT_EVOLUTION_CONFIG.minDiversity,
    ),
    mutationRate: clampNumber(
      merged.mutationRate,
      0,
      1,
      DEFAULT_EVOLUTION_CONFIG.mutationRate,
    ),
    mutationStrength: clampNumber(
      merged.mutationStrength,
      0,
      1,
      DEFAULT_EVOLUTION_CONFIG.mutationStrength,
    ),
  };
}

function normalizeLifeConfig(config = {}) {
  const fallback = DEFAULT_LIFE_CONFIG;
  const merged = {
    ...fallback,
    ...(config || {}),
  };

  const variablePopulationEnabled = merged.variablePopulationEnabled !== false;
  const minPopulationRatio = clampNumber(
    merged.minPopulationRatio,
    0.3,
    1.2,
    fallback.minPopulationRatio,
  );
  const maxPopulationRatio = clampNumber(
    merged.maxPopulationRatio,
    minPopulationRatio,
    2.5,
    fallback.maxPopulationRatio,
  );
  const initialEnergy = clampNumber(
    merged.initialEnergy,
    20,
    250,
    fallback.initialEnergy,
  );
  const maxEnergy = clampNumber(
    merged.maxEnergy,
    initialEnergy,
    320,
    fallback.maxEnergy,
  );
  const minBirthEnergy = clampNumber(
    merged.minBirthEnergy,
    0,
    maxEnergy,
    Math.min(fallback.minBirthEnergy, maxEnergy),
  );
  const energyDeathThreshold = clampNumber(
    merged.energyDeathThreshold,
    0,
    minBirthEnergy,
    Math.min(fallback.energyDeathThreshold, minBirthEnergy),
  );

  return {
    variablePopulationEnabled,
    minPopulationRatio,
    maxPopulationRatio,
    initialEnergy,
    maxEnergy,
    minBirthEnergy,
    energyDeathThreshold,
    baseMetabolismCost: clampNumber(
      merged.baseMetabolismCost,
      0,
      80,
      fallback.baseMetabolismCost,
    ),
    scoreToEnergyScale: clampNumber(
      merged.scoreToEnergyScale,
      0,
      1.2,
      fallback.scoreToEnergyScale,
    ),
    seasonEnergyScale: clampNumber(
      merged.seasonEnergyScale,
      0,
      30,
      fallback.seasonEnergyScale,
    ),
    energyInheritance: clampNumber(
      merged.energyInheritance,
      0,
      1,
      fallback.energyInheritance,
    ),
    birthEnergyJitter: clampNumber(
      merged.birthEnergyJitter,
      0,
      30,
      fallback.birthEnergyJitter,
    ),
  };
}

function normalizeEnvironmentConfig(config = {}) {
  const merged = {
    ...DEFAULT_ENVIRONMENT_CONFIG,
    ...(config || {}),
  };

  const seasons =
    Array.isArray(merged.seasons) && merged.seasons.length > 0
      ? merged.seasons.map((season, index) =>
          normalizeSeason(
            season,
            DEFAULT_SEASONS[index % DEFAULT_SEASONS.length],
          ),
        )
      : DEFAULT_SEASONS;

  return {
    mode: DEFAULT_ENVIRONMENT_CONFIG.mode,
    enabled: merged.enabled !== false,
    seasons,
    resourceDynamics: normalizeResourceDynamics(merged.resourceDynamics),
  };
}

function normalizeSeason(season = {}, fallbackSeason = DEFAULT_SEASONS[0]) {
  const key = String(season.key || fallbackSeason.key || "season").trim();
  const label = String(season.label || fallbackSeason.label || key).trim();
  return {
    key,
    label,
    focusRatio: clampNumber(
      season.focusRatio,
      0.3,
      1,
      fallbackSeason.focusRatio,
    ),
    metabolismMultiplier: clampNumber(
      season.metabolismMultiplier,
      0.7,
      1.3,
      fallbackSeason.metabolismMultiplier,
    ),
  };
}

function normalizeResourceDynamics(config = {}) {
  const fallback = DEFAULT_ENVIRONMENT_CONFIG.resourceDynamics;
  const merged = {
    ...fallback,
    ...(config || {}),
  };

  return {
    enabled: merged.enabled !== false,
    depletionThreshold: clampNumber(
      merged.depletionThreshold,
      0.2,
      0.95,
      fallback.depletionThreshold,
    ),
    depletionGain: clampNumber(
      merged.depletionGain,
      0,
      1,
      fallback.depletionGain,
    ),
    recoveryRate: clampNumber(
      merged.recoveryRate,
      0,
      0.8,
      fallback.recoveryRate,
    ),
    inactiveRecoveryBonus: clampNumber(
      merged.inactiveRecoveryBonus,
      0,
      0.4,
      fallback.inactiveRecoveryBonus,
    ),
    depletionLevel: clampNumber(
      merged.depletionLevel,
      0.25,
      1,
      fallback.depletionLevel,
    ),
    metabolismImpact: clampNumber(
      merged.metabolismImpact,
      0,
      0.5,
      fallback.metabolismImpact,
    ),
  };
}

function resolveGenerationEnvironment({
  generation,
  nutrients,
  config,
  resourceState,
}) {
  const baseNutrients = [...nutrients];
  const fallback = {
    mode: config.mode,
    seasonKey: "static",
    seasonLabel: "固定",
    seasonIndex: 0,
    focusRatio: 1,
    metabolismMultiplier: 1,
    baseNutrients,
    activeNutrients: baseNutrients,
    dormantNutrients: [],
    depletedNutrients: [],
    resourceLevels: createInitialResourceState(baseNutrients),
    resourcePressure: 0,
  };

  if (!config.enabled || config.seasons.length === 0 || baseNutrients.length === 0) {
    return fallback;
  }

  const seasonIndex = (generation - 1) % config.seasons.length;
  const season = config.seasons[seasonIndex];
  const rotatedNutrients = rotateList(
    baseNutrients,
    (generation - 1) % baseNutrients.length,
  );
  const activeCount = clamp(
    Math.round(baseNutrients.length * season.focusRatio),
    1,
    baseNutrients.length,
  );
  const rankedNutrients = rotatedNutrients.map((word, index) => {
    const stress = config.resourceDynamics.enabled
      ? clampNumber(resourceState[word], 0, 1, 0)
      : 0;
    const seasonalWeight = index < activeCount ? 1 : 0.35;
    const vitality = 1 - stress;
    return {
      word,
      index,
      stress: round(stress),
      score: seasonalWeight * vitality,
    };
  });
  const selected = [...rankedNutrients]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .slice(0, activeCount)
    .sort((left, right) => left.index - right.index);
  const activeNutrients = selected.map((entry) => entry.word);
  const selectedSet = new Set(activeNutrients);
  const dormantNutrients = rotatedNutrients.filter((word) => !selectedSet.has(word));
  const depletedNutrients = rankedNutrients
    .filter((entry) => entry.stress >= config.resourceDynamics.depletionLevel)
    .map((entry) => entry.word);
  const resourcePressure =
    activeNutrients.length === 0
      ? 0
      : round(
          activeNutrients.reduce(
            (sum, word) => sum + clampNumber(resourceState[word], 0, 1, 0),
            0,
          ) / activeNutrients.length,
        );
  const pressureMultiplier = config.resourceDynamics.enabled
    ? 1 - resourcePressure * config.resourceDynamics.metabolismImpact
    : 1;
  const metabolismMultiplier = round(
    clampNumber(season.metabolismMultiplier * pressureMultiplier, 0.7, 1.3, 1),
  );

  return {
    mode: config.mode,
    seasonKey: season.key,
    seasonLabel: season.label,
    seasonIndex,
    focusRatio: season.focusRatio,
    metabolismMultiplier,
    baseNutrients,
    activeNutrients,
    dormantNutrients,
    depletedNutrients,
    resourceLevels: buildResourceLevels(baseNutrients, resourceState),
    resourcePressure,
  };
}

function rotateList(list, step = 0) {
  if (list.length === 0) {
    return [];
  }
  const offset = ((step % list.length) + list.length) % list.length;
  if (offset === 0) {
    return [...list];
  }
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function evolveResourceState({
  resourceState,
  records,
  nutrients,
  environment,
  config,
}) {
  if (!config.enabled) {
    return buildResourceLevels(nutrients, resourceState);
  }

  const usageCounts = countNutrientUsage(records, nutrients);
  const population = Math.max(1, records.length);
  const activeSet = new Set(environment.activeNutrients);
  const next = {};

  for (const nutrient of nutrients) {
    const previousStress = clampNumber(resourceState[nutrient], 0, 1, 0);
    const usageRatio = usageCounts[nutrient] / population;
    const pressure =
      usageRatio <= config.depletionThreshold
        ? 0
        : (usageRatio - config.depletionThreshold) / (1 - config.depletionThreshold);
    const decayRate = clampNumber(
      config.recoveryRate + (activeSet.has(nutrient) ? 0 : config.inactiveRecoveryBonus),
      0,
      0.95,
      0.18,
    );
    const nextStress = previousStress * (1 - decayRate) + pressure * config.depletionGain;
    next[nutrient] = round(clampNumber(nextStress, 0, 1, 0));
  }

  return next;
}

function createInitialResourceState(nutrients) {
  return Object.fromEntries(nutrients.map((word) => [word, 0]));
}

function buildResourceLevels(nutrients, resourceState) {
  return Object.fromEntries(
    nutrients.map((word) => [word, round(clampNumber(resourceState[word], 0, 1, 0))]),
  );
}

function countNutrientUsage(records, nutrients) {
  const usage = Object.fromEntries(nutrients.map((word) => [word, 0]));
  for (const record of records) {
    const words = Array.isArray(record.meta?.usedNutrients)
      ? record.meta.usedNutrients
      : [];
    for (const word of words) {
      if (word in usage) {
        usage[word] += 1;
      }
    }
  }
  return usage;
}

function uniqueList(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
}

function round(value) {
  return Number(value.toFixed(3));
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
