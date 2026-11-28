# AODP Asia market feed collector

This service subscribes to the public AODP Asia NATS feed and forwards validated observations to the Cloudflare Worker in bounded HTTPS batches.

## Subjects

- `marketorders.deduped`
- `markethistories.deduped`

The parser follows the upstream AODP structs:
- Market orders: `Id`, `ItemTypeId`, `LocationId`, `QualityLevel`, `EnchantmentLevel`, `UnitPriceSilver`, `Amount`, `AuctionType`, `Expires`.
- Market histories: `AlbionId`, `LocationId`, `QualityLevel`, `Timescale`, `MarketHistories[]` containing `ItemAmount`, `SilverAmount`, `Timestamp`.

## Local validation

Requires Node.js 20+.

```sh
npm install
npm test
```

## Run

Copy `.env.example` to `.env`, set a strong `INGEST_TOKEN` and the Worker URL, then run:

```sh
set -a; . ./.env; set +a
npm start
```

For deployment, build the included Dockerfile and configure the same environment variables as secrets/settings in an always-on container host. Keep one collector instance initially.

## Operational limits

- AODP NATS is a live, non-replay feed; messages from before a subscriber connects are not backfilled.
- The collector retries failed HTTPS batches and refuses to silently discard a full in-memory queue. It is an initial pilot, not yet a durable disk-spooled ingestion service.
- NATS deduplication is over a rolling five-minute window. The collector and database apply a second idempotency key per payload/time bucket.
- A market order disappearing from the feed is not proof of a sale; it may expire or be cancelled.
- Market-history points are observations/aggregates, not a complete transaction ledger.
- Unknown location IDs are preserved verbatim. City mapping is a separate, validated step.
- Never put the ingest token in frontend code or commit a real token.
