const ORDER_SUBJECT = "marketorders.deduped";
const HISTORY_SUBJECT = "markethistories.deduped";

function numeric(value) {
  return value !== null && value !== undefined &&
    !(typeof value === "string" && value.trim() === "") &&
    Number.isFinite(Number(value));
}

export function normalizeMessage(subject, payload, receivedAt = new Date().toISOString()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("NATS payload must be a JSON object");
  }

  if (subject === ORDER_SUBJECT) {
    const itemId = payload.ItemTypeId;
    const locationId = payload.LocationId;
    if (!numeric(payload.QualityLevel) || !numeric(payload.EnchantmentLevel ?? 0) ||
        !numeric(payload.UnitPriceSilver) || !numeric(payload.Amount) || !numeric(payload.Id)) {
      throw new Error("Market order is missing required numeric fields");
    }
    const quality = Number(payload.QualityLevel);
    const enchantment = Number(payload.EnchantmentLevel ?? 0);
    const price = Number(payload.UnitPriceSilver);
    const amount = Number(payload.Amount);
    const orderId = Number(payload.Id);

    if (typeof itemId !== "string" || !itemId || itemId.length > 100) {
      throw new Error("Market order is missing a valid ItemTypeId");
    }
    if (locationId === undefined || locationId === null || String(locationId).trim() === "" || String(locationId).length > 80) {
      throw new Error("Market order is missing LocationId");
    }
    if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
      throw new Error("Market order has invalid QualityLevel");
    }
    if (!Number.isInteger(enchantment) || enchantment < 0 || enchantment > 4) {
      throw new Error("Market order has invalid EnchantmentLevel");
    }
    if (!Number.isSafeInteger(orderId) || orderId < 0) {
      throw new Error("Market order has invalid Id");
    }
    if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(amount) || amount < 0) {
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
    if (!numeric(payload.AlbionId) || !numeric(payload.QualityLevel) || !numeric(payload.Timescale)) {
      throw new Error("Market history is missing required numeric fields");
    }
    const albionId = Number(payload.AlbionId);
    const quality = Number(payload.QualityLevel);
    const timescale = Number(payload.Timescale);

    if (locationId === undefined || locationId === null || String(locationId).trim() === "" || String(locationId).length > 80) {
      throw new Error("Market history is missing LocationId");
    }
    if (!Number.isSafeInteger(albionId) || albionId < 0) {
      throw new Error("Market history has invalid AlbionId");
    }
    if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
      throw new Error("Market history has invalid QualityLevel");
    }
    if (!Number.isInteger(timescale) || timescale < 0 || timescale > 2) {
      throw new Error("Market history has invalid Timescale");
    }
    if (!Array.isArray(histories) || histories.length > 10000) {
      throw new Error("Market history is missing a valid MarketHistories array");
    }
    for (const point of histories) {
      if (!point || typeof point !== "object" ||
          !numeric(point.ItemAmount) || Number(point.ItemAmount) < 0 ||
          !numeric(point.SilverAmount) || Number(point.SilverAmount) < 0 ||
          !numeric(point.Timestamp) || Number(point.Timestamp) <= 0) {
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
