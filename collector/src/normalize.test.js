import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMessage } from "./normalize.js";

const validOrder = {
  Id: 123,
  ItemTypeId: "T4_BAG",
  ItemGroupTypeId: "bag",
  LocationId: 3008,
  QualityLevel: 1,
  EnchantmentLevel: 2,
  UnitPriceSilver: 12000,
  Amount: 4,
  AuctionType: "offer",
  Expires: "2026-11-28T12:00:00"
};

const validHistory = {
  AlbionId: 123,
  LocationId: "3008",
  QualityLevel: 1,
  Timescale: 0,
  MarketHistories: [{ ItemAmount: 5, SilverAmount: 6000, Timestamp: 638181504000000000 }]
};

test("normalizes an AODP market order with numeric LocationId", () => {
  const result = normalizeMessage("marketorders.deduped", validOrder, "2026-11-28T12:00:00.000Z");
  assert.equal(result.event_type, "market_order");
  assert.equal(result.payload.LocationId, 3008);
  assert.equal(result.payload.ItemTypeId, "T4_BAG");
});

test("normalizes a market history message", () => {
  const result = normalizeMessage("markethistories.deduped", validHistory);
  assert.equal(result.event_type, "market_history");
  assert.equal(result.payload.MarketHistories.length, 1);
});

test("rejects unsupported subjects and malformed messages", () => {
  assert.throws(() => normalizeMessage("goldprices.deduped", {}));
  assert.throws(() => normalizeMessage("marketorders.deduped", { ItemTypeId: "T4_BAG" }));
});

test("rejects null or empty order numeric fields instead of coercing them to zero", () => {
  for (const field of ["Id", "QualityLevel", "UnitPriceSilver", "Amount"]) {
    const malformed = { ...validOrder, [field]: null };
    assert.throws(() => normalizeMessage("marketorders.deduped", malformed), field);
  }
  assert.throws(() => normalizeMessage("marketorders.deduped", { ...validOrder, Amount: "" }));
});

test("rejects null or empty history point values", () => {
  assert.throws(() => normalizeMessage("markethistories.deduped", {
    ...validHistory,
    MarketHistories: [{ ItemAmount: null, SilverAmount: 6000, Timestamp: 638181504000000000 }]
  }));
  assert.throws(() => normalizeMessage("markethistories.deduped", {
    ...validHistory,
    MarketHistories: [{ ItemAmount: 5, SilverAmount: "", Timestamp: 638181504000000000 }]
  }));
  assert.throws(() => normalizeMessage("markethistories.deduped", {
    ...validHistory,
    MarketHistories: [{ ItemAmount: 5, SilverAmount: 6000, Timestamp: 0 }]
  }));
});
