import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrackedMarket } from "./kalshiService.js";

test("normalizeTrackedMarket does not show settled YES markets as YES 100 and NO 100", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXMLBGAME-26JUN02TEXSTL-TEX",
    event_ticker: "KXMLBGAME-26JUN02TEXSTL",
    title: "Rangers win",
    status: "settled",
    yes_bid_cents: null,
    yes_ask_cents: null,
    no_bid_cents: null,
    no_ask_cents: 100,
    last_price_cents: 100,
    updated_at: "2026-06-03T01:30:00Z"
  });

  assert.equal(market.lifecycleStatus, "settled");
  assert.equal(market.isActive, false);
  assert.equal(market.isResolved, true);
  assert.equal(market.resultKnown, true);
  assert.equal(market.winningSide, "YES");
  assert.equal(market.yesBidCents, 100);
  assert.equal(market.yesAskCents, 100);
  assert.equal(market.noBidCents, 0);
  assert.equal(market.noAskCents, 0);
});

test("normalizeTrackedMarket hides finalized prices when result is unknown", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXMLBGAME-26JUN02TEXSTL-TEX",
    event_ticker: "KXMLBGAME-26JUN02TEXSTL",
    title: "Rangers win",
    status: "finalized",
    yes_bid_cents: null,
    yes_ask_cents: null,
    no_bid_cents: null,
    no_ask_cents: 100,
    updated_at: "2026-06-03T01:30:00Z"
  });

  assert.equal(market.lifecycleStatus, "finalized");
  assert.equal(market.isResolved, true);
  assert.equal(market.resultKnown, false);
  assert.equal(market.winningSide, null);
  assert.equal(market.yesBidCents, null);
  assert.equal(market.yesAskCents, null);
  assert.equal(market.noBidCents, null);
  assert.equal(market.noAskCents, null);
});
