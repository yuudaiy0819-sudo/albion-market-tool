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
- [ ] Add watch-rule controls to the website
- [ ] Add stale-data validation and spread/drop calculations
- [ ] Add deduplicated market alerts
- [ ] Add order-book depth collection

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
