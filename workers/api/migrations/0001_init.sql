CREATE TABLE IF NOT EXISTS specimens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  specimen_id TEXT NOT NULL UNIQUE,
  collector_id TEXT NOT NULL,
  poem_text TEXT NOT NULL,
  poem_preview TEXT NOT NULL,
  biome TEXT NOT NULL,
  season TEXT NOT NULL,
  score_total REAL NOT NULL,
  score_breakdown_json TEXT NOT NULL,
  genome_json TEXT NOT NULL,
  parent_ids_json TEXT NOT NULL,
  run_hash TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_specimens_created_at ON specimens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_specimens_likes ON specimens(likes DESC);
CREATE INDEX IF NOT EXISTS idx_specimens_biome_created ON specimens(biome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_specimens_season_created ON specimens(season, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_specimens_hidden ON specimens(is_hidden);

CREATE TABLE IF NOT EXISTS likes (
  specimen_id TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(specimen_id, fingerprint_hash)
);

CREATE TABLE IF NOT EXISTS reports (
  specimen_id TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(specimen_id, fingerprint_hash)
);
