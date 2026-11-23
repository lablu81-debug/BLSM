-- BLMS database schema (SQLite 3). Applied automatically on server start (idempotent).
-- Run manually:  sqlite3 data/blms.db < database/schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- User accounts. pw_hash is a scrypt hash ("scrypt$<salt>$<hash>"); NULL = cannot sign in yet.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  login_id    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  emp_id      TEXT,
  dept        TEXT,
  desig       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('Administrator','Verifier','Operator / Contributor','Viewer')),
  units       TEXT NOT NULL DEFAULT '"All"',      -- JSON: "All" or ["ALP","BRV"]
  unit_roles  TEXT,                               -- JSON object unit -> role
  menus       TEXT,                               -- JSON array of menu ids (optional override)
  pw_hash     TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- Licenses / certificates / permits. Indexed columns + full record as JSON.
CREATE TABLE IF NOT EXISTS licenses (
  id            TEXT PRIMARY KEY,
  company       TEXT NOT NULL,
  type          TEXT,
  name          TEXT,
  till_date     TEXT,
  status        TEXT,
  locked        INTEGER NOT NULL DEFAULT 0,
  review_state  TEXT,
  data          TEXT NOT NULL,                    -- JSON of the full LicenseEntry
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_licenses_company ON licenses(company);
CREATE INDEX IF NOT EXISTS idx_licenses_till    ON licenses(till_date);
CREATE INDEX IF NOT EXISTS idx_licenses_status  ON licenses(status);

-- Admin-managed settings (companies, license types/names, payment links, thresholds,
-- menu permissions, notification config). value = JSON.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Append-only ledgers. k = natural key used to de-duplicate on sync.
CREATE TABLE IF NOT EXISTS audit_log (
  seq  INTEGER PRIMARY KEY AUTOINCREMENT,
  k    TEXT NOT NULL UNIQUE,
  ts   INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  seq  INTEGER PRIMARY KEY AUTOINCREMENT,
  k    TEXT NOT NULL UNIQUE,
  ts   INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_log (
  seq  INTEGER PRIMARY KEY AUTOINCREMENT,
  k    TEXT NOT NULL UNIQUE,
  ts   INTEGER NOT NULL,
  data TEXT NOT NULL
);

INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO meta(key, value) VALUES ('rev', '1');
