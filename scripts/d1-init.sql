-- KatelyaTV Cloudflare D1 schema.
-- This schema matches src/lib/d1.db.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS play_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  cover TEXT,
  year TEXT,
  index_episode INTEGER DEFAULT 1,
  total_episodes INTEGER DEFAULT 1,
  play_time REAL DEFAULT 0,
  total_time REAL DEFAULT 0,
  save_time INTEGER NOT NULL,
  search_title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
  UNIQUE (username, key)
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  cover TEXT,
  year TEXT,
  total_episodes INTEGER DEFAULT 1,
  save_time INTEGER NOT NULL,
  search_title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
  UNIQUE (username, key)
);

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  keyword TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
  UNIQUE (username, keyword)
);

CREATE TABLE IF NOT EXISTS skip_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  key TEXT NOT NULL,
  source TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  segments TEXT NOT NULL,
  updated_time INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
  UNIQUE (username, key)
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL,
  updated_time INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (username, password)
VALUES ('admin', '__owner_env_auth__');

INSERT OR IGNORE INTO user_settings (username, settings, updated_time)
VALUES (
  'admin',
  '{"filter_adult_content":true,"theme":"auto","language":"zh-CN","auto_play":true,"video_quality":"auto"}',
  unixepoch()
);

CREATE INDEX IF NOT EXISTS idx_play_records_username
  ON play_records(username);
CREATE INDEX IF NOT EXISTS idx_play_records_username_key
  ON play_records(username, key);
CREATE INDEX IF NOT EXISTS idx_play_records_save_time
  ON play_records(save_time DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_username
  ON favorites(username);
CREATE INDEX IF NOT EXISTS idx_favorites_username_key
  ON favorites(username, key);
CREATE INDEX IF NOT EXISTS idx_favorites_save_time
  ON favorites(save_time DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_username
  ON search_history(username);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at
  ON search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skip_configs_username
  ON skip_configs(username);
CREATE INDEX IF NOT EXISTS idx_skip_configs_username_key
  ON skip_configs(username, key);
CREATE INDEX IF NOT EXISTS idx_user_settings_username
  ON user_settings(username);
CREATE INDEX IF NOT EXISTS idx_user_settings_updated_time
  ON user_settings(updated_time DESC);

CREATE VIEW IF NOT EXISTS user_stats AS
SELECT
  u.id,
  u.username,
  COUNT(DISTINCT pr.id) AS play_count,
  COUNT(DISTINCT f.id) AS favorite_count,
  COUNT(DISTINCT sh.id) AS search_count,
  u.created_at
FROM users u
LEFT JOIN play_records pr ON u.username = pr.username
LEFT JOIN favorites f ON u.username = f.username
LEFT JOIN search_history sh ON u.username = sh.username
GROUP BY u.id, u.username, u.created_at;
