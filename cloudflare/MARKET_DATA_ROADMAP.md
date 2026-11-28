# Market data reliability and coverage roadmap

## Implementation status (2026-11-28)

Repository scaffolding is now committed:
- Standalone Node.js NATS collector for the two deduplicated Asia market subjects.
- Upstream-shaped validation for order and market-history payloads.
- JSONL disk spool, bounded HTTPS batches, retries, and restart recovery.
- Authenticated Worker ingestion route with request-size and batch limits.
- D1 migration for raw observed feed events, including source and receive timestamps.
- Public aggregate `/market-feed-health` endpoint.
- GitHub Actions checks for collector tests, Worker syntax, and D1 migration SQL.

**Not running yet:** the Worker code has not been deployed, the D1 migration has not been applied, `MARKET_INGEST_TOKEN` has not been configured, and no always-on collector host has been provisioned. No market feed data is being collected by this new pipeline yet.

## Goal

Build an Asia-market observatory that explains price movement, supply, demand signals, and data coverage without presenting incomplete observations as complete market truth.

## What the current system actually measures

- The website's current price table queries the AODP East REST API when an item is selected.
- The Cloudflare Worker polls only enabled watch rules every 15 minutes and stores those snapshots in D1.
- AODP market history exposes observed history buckets and `item_count`; this is a useful activity proxy, not a guaranteed ledger of every completed player-to-player trade.
- AODP order-book data is a snapshot of observed orders, not proof that every displayed order remains executable.
- The public AODP NATS service publishes deduplicated market-order and market-history messages for Asia. Deduplication is performed over a five-minute window. A new subscriber does not receive messages from before it connected. For market orders, consumers should track the last time an order was seen and expire it after an appropriate unseen period.

Official references:
- https://east.albion-online-data.com/developer
- https://east.albion-online-data.com/api-docs
- https://pow.albion-online-data.com/client-faq

## Important limitation

The public feed is not a complete exchange trade tape. It can greatly improve the visibility of observed order changes and history updates, but it cannot guarantee that every transaction, private trade, or unobserved market action is captured. The UI and reports must call these metrics "observed orders", "observed activity", or "estimated activity", not "all trades".

## Target architecture

1. **Continuous Asia feed collector**
   - A small always-on Node.js service subscribes to the public Asia NATS subjects:
     - `marketorders.deduped`
     - `markethistories.deduped`
   - It normalizes message variants and location IDs, validates timestamps and numeric values, and keeps a reconnect/health heartbeat.
   - It forwards bounded batches to a protected HTTPS ingest endpoint.
   - It must be idempotent so reconnects and duplicate deliveries do not inflate counts.

2. **Cloudflare ingest API + D1**
   - Keep the existing Worker for the public site API, scheduled watch-rule polling, and Discord alerts.
   - Add a separately authenticated ingestion route and dedicated tables for order observations and history observations.
   - Preserve source event time, received time, source, item ID, city, quality, enchantment, side, quantity, price, and order identity when supplied.
   - Use upserts/deduplication keys; do not overwrite newer observations with older events.
   - Retain raw payloads only where useful and within a bounded retention policy.

3. **Market analytics**
   - Current supply: active observed sell/buy order depth and age.
   - Observed activity: history `item_count` by city and time bucket, clearly labeled as an estimate.
   - Demand/supply signals: order-book depth changes, price movement, and observed activity together.
   - Coverage: cities/items/time windows with fresh observations, missing periods, collector uptime, and last successful ingestion.
   - Confidence: never call a metric reliable when its sample count or freshness is insufficient.

4. **Website**
   - Add an Asia market overview, city heatmap, item demand/activity ranking, and item-level supply/demand timeline.
   - Show source, last observed time, sample count, and coverage next to every derived metric.
   - Keep the existing price comparison and alert features working.

## Deployment constraints and safe rollout

- Cloudflare Workers are request/scheduled-event runtimes; they are not the right place to host a permanently connected NATS subscriber. The collector needs a separate always-on background service (for example, a small container/background worker host).
- No new host, paid service, or external account should be enabled without the owner's explicit approval.
- Do not apply new production D1 migrations until the migration and rollback plan are reviewed.
- Do not expose `ADMIN_TOKEN`, Discord webhook URLs, or any ingest credential in browser code or Git.
- Roll out in stages: collector health first, then a small verified sample, then bounded retention and aggregate analytics.

## Acceptance checks

- Collector reconnects automatically and reports last message time.
- Replayed events do not inflate order counts or activity totals.
- Unknown locations and malformed messages are quarantined/ignored with counters, not silently mapped to a city.
- Old source timestamps remain old; receive time is never substituted for source time.
- A missing observation is shown as unknown, never as zero.
- Dashboards distinguish order-book supply, history-based activity estimates, and confirmed completed transactions (which this feed does not provide comprehensively).
