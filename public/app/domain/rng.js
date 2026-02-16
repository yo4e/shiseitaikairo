export function createSeededRng(seedInput) {
  const seed = normalizeSeed(seedInput);
  const next = mulberry32(seed);
  return {
    seed,
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(list) {
      if (!list.length) {
        return undefined;
      }
      return list[this.int(0, list.length - 1)];
    },
  };
}

export function normalizeSeed(seedInput) {
  if (Number.isInteger(seedInput)) {
    return toUint32(seedInput);
  }

  const parsed = Number.parseInt(String(seedInput ?? ""), 10);
  if (Number.isFinite(parsed)) {
    return toUint32(parsed);
  }

  return toUint32(Date.now());
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toUint32(value) {
  return value >>> 0;
}
