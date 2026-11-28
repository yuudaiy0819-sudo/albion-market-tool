# Cloudflare monitoring backend

This folder contains the Cloudflare Worker backend for Albion Market Tool.

## Architecture

- GitHub Pages remains the public web app.
- Cloudflare Workers runs scheduled monitoring independently of the browser.
- Cloudflare D1 stores watch rules and observed AODP prices.
- AODP East is the market-data source.
- Discord receives operational and market alerts.

## Current status

- [x] Worker health endpoint
- [x] 15-minute scheduled entry point
- [x] D1 schema for watch rules, price observations, and alert events
- [x] Protected Discord test endpoint
- [x] Protected watch-rule list/create/delete endpoints
- [x] AODP East current-price polling for enabled watch rules
- [x] Manual protected polling endpoint for testing
- [x] Add watch-rule controls to the website
- [x] Add stale-data validation and spread/drop calculations
- [x] Add deduplicated market alerts
- [x] Add order-book depth collection
- [x] Compare spread-alert prices with the previous 24 hours of distinct AODP source timestamps
- [x] Include historical price-consistency context in Discord spread alerts
- [x] Daily Discord health report at 08:00 JST (23:00 UTC)
- [x] Public `/market-health` endpoint with city-level aggregate freshness only (no item names or IDs)
- [x] Check source-price freshness for the buy/sell sides of each enabled watch rule; flag missing or older-than-3-hour observations

## Protected endpoints

All `/admin/*` endpoints require:

```
Authorization: Bearer <ADMIN_TOKEN>
```

- `GET /admin/watch-rules` — list watch rules
- `POST /admin/watch-rules` — create a watch rule
- `DELETE /admin/watch-rules/{id}` — delete a watch rule
- `POST /admin/poll-now` — run one market-data poll immediately
- `POST /admin/test-discord` — send a Discord test message

Example create-rule JSON:

```json
{
  "item_id": "T4_BAG",
  "item_name": "バッグ",
  "quality": 1,
  "buy_city": "Bridgewatch",
  "sell_city": "Caerleon",
  "min_spread": 1000
}
```

The example is illustrative only; choose a real item and city pair before creating a rule.

## Data integrity

- Missing market prices are stored as NULL, not as zero.
- Current prices are AODP snapshots, not guaranteed live quotes.
- AODP source timestamps must be checked before generating alerts.
- Historical sell-order averages are not confirmed completed trades.
- The Worker polls only items that have enabled watch rules; it does not scan the entire item catalogue.


## Market-wide data collection pilot

The current Worker still polls enabled watch rules for the existing alert system. A separate Asia NATS collector and authenticated ingestion path are now present in the repository, but are not deployed or running yet. See [MARKET_DATA_ROADMAP.md](./MARKET_DATA_ROADMAP.md) for status, architecture, and rollout gates.

AODP's public Asia NATS feed provides deduplicated market-order and market-history observations, not a complete completed-trade ledger. The collector must run on an always-on host with persistent storage. No external hosting service or paid resource has been enabled.

## Historical alert context

Spread alerts compare the current purchase-side sell price and destination-side buy price with the median of distinct AODP source timestamps observed during the previous 24 hours. Repeated Worker polls of an unchanged source timestamp count only once, and the current source timestamp is excluded from its own baseline. At least three distinct historical timestamps are required on both sides before the alert can show a consistency label; otherwise it reports insufficient evidence. This is a price-history consistency check only, not a guarantee of executable quantity, completed trades, or profit.


## Asia market feed collector pilot

- The standalone Node.js collector lives in `../collector` and subscribes to AODP Asia `marketorders.deduped` and `markethistories.deduped`.
- It forwards validated messages to `POST /internal/market-feed/batch`.
- The endpoint requires a separate `MARKET_INGEST_TOKEN` Worker secret and the D1 migration `0002_market_feed_events.sql`.
- `GET /market-feed-health` exposes aggregate feed volume, last receive time, and observed location-ID coverage without exposing raw orders.
- Apply the migration explicitly with Wrangler before enabling ingestion; do not assume a Worker deploy applies D1 migrations.
- The collector host must receive `INGEST_URL` and `INGEST_TOKEN` as environment variables. Never put the token in frontend code or Git.
- This is a pilot ingestion path. It does not yet create a complete trade ledger or a fully materialized active-order book. The collector persists pending batches in a JSONL spool on disk and resumes them after restart when its host provides persistent storage.
- Do not run the collector against production until the migration is applied, the secret is configured, and a small test batch has been verified.
