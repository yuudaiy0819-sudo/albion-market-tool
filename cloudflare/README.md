# Cloudflare monitoring backend

This folder contains the first backend foundation for Albion Market Tool.

## Planned architecture

- GitHub Pages remains the public web app.
- Cloudflare Workers runs scheduled monitoring independently of the browser.
- Cloudflare D1 stores watch rules, observed AODP prices, and alert events.
- AODP East is the market-data source.

## Current status

- [x] Worker health endpoint
- [x] 15-minute scheduled entry point
- [x] D1 schema for watch rules, price observations, and alert events
- [ ] Create the Cloudflare Worker and D1 database
- [ ] Configure the D1 database ID in wrangler.toml
- [ ] Deploy and verify /health
- [ ] Implement AODP polling for saved city-pair watch rules
- [ ] Add stale-data validation and spread/drop calculations
- [ ] Connect the selected notification channel
- [ ] Connect the website's watch-list UI to the backend

## First-time setup

1. Install Node.js and Wrangler.
2. Log in to Cloudflare with Wrangler.
3. Create a D1 database named albion-market-monitor.
4. Copy the returned database ID into wrangler.toml.
5. From this directory, apply migrations and deploy the Worker.

Commands:

```bash
npm install --global wrangler
wrangler login
wrangler d1 create albion-market-monitor
wrangler d1 migrations apply albion-market-monitor --remote
wrangler deploy
```

The database_id placeholder must be replaced before deployment.

## Data integrity

- Missing prices remain NULL; they are never converted to zero.
- AODP source timestamps must be checked before an alert is generated.
- AODP observations are community-contributed snapshots, not guaranteed live quotes.
- The backend must not describe sell-order history as confirmed completed trades.
- Notification delivery is intentionally not enabled until a channel is selected and configured.
