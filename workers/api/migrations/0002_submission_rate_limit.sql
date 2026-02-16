CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_fingerprint_created
  ON submissions(fingerprint_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_created
  ON submissions(created_at);
