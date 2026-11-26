# Albion Market Tool — Roadmap

Albion Online **Asia (East)** market comparison tool.

## Product goals

- Japanese item search across the item catalogue.
- Tier, enchantment, and quality filters.
- Compare sell orders and buy orders across the major cities.
- Show order depth / quantity where source data supports it.
- Favorites and saved searches.
- Price watch rules and notifications.
- Price history charts for 24 hours, 7 days, and 30 days.
- Responsive white-background UI for desktop and mobile.
- Clear data provenance, source timestamps, receive timestamps, and stale/missing-data states.

## Data integrity rules

- Never turn missing data into a zero price or a fabricated quote.
- Distinguish the source's update timestamp from the time this app received the record.
- Do not draw continuous chart lines across periods with missing observations.
- Do not label AODP market-history records as confirmed completed trade prices unless the source semantics establish that.
- Treat an order not seen for a while as potentially expired/completed, not as a confirmed sale.
- Keep Asia data separate from other game regions.
- Respect AODP rate limits and use compressed API requests where supported.

## Planned delivery phases

1. **Foundation:** responsive app shell, item catalogue/search model, city and filter definitions.
2. **Live market view:** Asia AODP API integration and current-price comparison with freshness indicators.
3. **Order detail:** order-book depth and quantity display where available.
4. **Favorites:** save items, qualities, and filter combinations.
5. **History:** persist observations and render 24h / 7d / 30d charts with gaps preserved.
6. **Price watch:** configurable thresholds and notification delivery.
7. **Deployment:** free prototype first; introduce always-on infrastructure only when required.

## Important data-source limitation

AODP data is community-contributed. The client uploads market data that players load in-game, so coverage varies by item, city, and time. Missing data means **unknown / not recently observed**, not zero and not necessarily no market activity.

## Initial implementation status

- [x] GitHub repository created
- [ ] App foundation
- [ ] Asia API integration
- [ ] Search and filters
- [ ] Live comparison
- [ ] Favorites and watch rules
- [ ] History storage and charts
- [ ] Notifications
