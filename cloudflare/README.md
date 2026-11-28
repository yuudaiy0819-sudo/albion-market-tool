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


## Historical alert context

Spread alerts compare the current purchase-side sell price and destination-side buy price with the median of distinct AODP source timestamps observed during the previous 24 hours. Repeated Worker polls of an unchanged source timestamp count only once, and the current source timestamp is excluded from its own baseline. At least three distinct historical timestamps are required on both sides before the alert can show a consistency label; otherwise it reports insufficient evidence. This is a price-history consistency check only, not a guarantee of executable quantity, completed trades, or profit.
