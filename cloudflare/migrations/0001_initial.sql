CREATE TABLE IF NOT EXISTS watch_rules (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_name TEXT,
  quality INTEGER NOT NULL CHECK (quality BETWEEN 1 AND 5),
  buy_city TEXT NOT NULL,
  sell_city TEXT NOT NULL,
  min_spread INTEGER,
  min_spread_percent REAL,
  notify_on_buy_price_drop INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_watch_rules_enabled
  ON watch_rules(enabled);

CREATE TABLE IF NOT EXISTS price_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  city TEXT NOT NULL,
  quality INTEGER NOT NULL CHECK (quality BETWEEN 1 AND 5),
  sell_price_min INTEGER,
  buy_price_max INTEGER,
  sell_price_min_date TEXT,
  buy_price_max_date TEXT,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'AODP Asia'
);

CREATE INDEX IF NOT EXISTS idx_price_observations_lookup
  ON price_observations(item_id, city, quality, observed_at);

CREATE TABLE IF NOT EXISTS alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_rule_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  buy_price INTEGER,
  sell_price INTEGER,
  spread INTEGER,
  source_observed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  FOREIGN KEY (watch_rule_id) REFERENCES watch_rules(id)
);

CREATE INDEX IF NOT EXISTS idx_alert_events_rule_created
  ON alert_events(watch_rule_id, created_at);
