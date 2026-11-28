const ORDER_SUBJECT = "marketorders.deduped";
const HISTORY_SUBJECT = "markethistories.deduped";

export function normalizeMessage(subject, payload, receivedAt = new Date().toISOString()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("NATS payload must be a JSON object");
  }

  if (subject === ORDER_SUBJECT) {
    const itemId = payload.ItemTypeId;
    const locationId = payload.LocationId;
    const quality = Number(payload.QualityLevel);
    const enchantment = Number(payload.EnchantmentLevel ?? 0);
    const price = Number(payload.UnitPriceSilver);
    const amount = Number(payload.Amount);
    const orderId = payload.Id;

    if (typeof itemId !== "string" || !itemId || itemId.length > 100) {
      throw new Error("Market order is missing a valid ItemTypeId");
    }
    if (locationId === undefined || locationId === null || String(locationId).length > 80) {
      throw new Error("Market order is missing LocationId");
    }
    if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
      throw new Error("Market order has invalid QualityLevel");
    }
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(amount) || amount < 0) {
      throw new Error("Market order has invalid price or amount");
    }

    return {
      event_type: "market_order",
      subject,
      received_at: receivedAt,
      payload
    };
  }

  if (subject === HISTORY_SUBJECT) {
    const locationId = payload.LocationId;
    const histories = payload.MarketHistories;
    const albionId = Number(payload.AlbionId);
    const quality = Number(payload.QualityLevel);
    const timescale = Number(payload.Timescale);

    if (locationId === undefined || locationId === null || String(locationId).length > 80) {
      throw new Error("Market history is missing LocationId");
    }
    if (!Number.isInteger(albionId) || albionId < 0) {
      throw new Error("Market history has invalid AlbionId");
    }
    if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
      throw new Error("Market history has invalid QualityLevel");
    }
    if (!Array.isArray(histories)) {
      throw new Error("Market history is missing MarketHistories array");
    }
    for (const point of histories) {
      if (!point || typeof point !== "object" ||
          !Number.isFinite(Number(point.ItemAmount)) ||
          !Number.isFinite(Number(point.SilverAmount)) ||
          !Number.isFinite(Number(point.Timestamp))) {
        throw new Error("Market history contains an invalid point");
      }
    }

    return {
      event_type: "market_history",
      subject,
      received_at: receivedAt,
      payload
    };
  }

  throw new Error(`Unsupported NATS subject: ${subject}`);
}

export const SUBJECTS = [ORDER_SUBJECT, HISTORY_SUBJECT];
