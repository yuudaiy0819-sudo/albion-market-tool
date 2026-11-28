CREATE TABLE IF NOT EXISTS market_feed_events (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('market_order', 'market_history')),
  source_subject TEXT NOT NULL,
  received_at TEXT NOT NULL,
  collector_received_at TEXT,
  source_time TEXT,
  item_id TEXT,
  albion_id INTEGER,
  location_id TEXT,
  quality INTEGER,
  enchantment INTEGER,
  order_id TEXT,
  auction_type TEXT,
  unit_price_silver INTEGER,
  amount INTEGER,
  timescale INTEGER,
  history_points INTEGER,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_feed_item_received
  ON market_feed_events(item_id, received_at);

CREATE INDEX IF NOT EXISTS idx_market_feed_location_received
  ON market_feed_events(location_id, received_at);

CREATE INDEX IF NOT EXISTS idx_market_feed_type_received
  ON market_feed_events(event_type, received_at);
