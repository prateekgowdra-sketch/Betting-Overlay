import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchQueryInfo,
  marketMatchesFilter,
  marketSortScore,
  normalizeTrackedMarket
} from "./kalshiService.js";

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

test("buildSearchQueryInfo expands team nicknames and abbreviations", () => {
  const queryInfo = buildSearchQueryInfo("knicks", 2);

  assert.equal(queryInfo.originalQuery, "knicks");
  assert.ok(queryInfo.expandedTerms.includes("new york knicks"));
  assert.ok(queryInfo.expandedTerms.includes("nyk"));
  assert.deepEqual(queryInfo.detectedSports, ["NBA"]);
  assert.equal(queryInfo.detectedTeams[0].team, "New York Knicks");
});

test("smart search treats Rangers as an ambiguous multi-sport query", () => {
  const queryInfo = buildSearchQueryInfo("rangers", 2);
  const teams = queryInfo.detectedTeams.map((team) => `${team.team} ${team.sport}`);

  assert.ok(teams.includes("Texas Rangers MLB"));
  assert.ok(teams.includes("New York Rangers NHL"));
});

test("marketMatchesFilter supports matchup-style alias searches", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXMLBGAME-26JUN03TEXSTL-TEX",
    event_ticker: "KXMLBGAME-26JUN03TEXSTL",
    title: "Game 1: Texas at St. Louis Winner?",
    status: "open",
    yes_bid_cents: 48,
    yes_ask_cents: 52,
    no_bid_cents: 48,
    no_ask_cents: 52,
    last_price_cents: 50,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(market, { search: "rangers cardinals" }), true);
});

test("marketMatchesFilter rejects generic-only sports searches", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXMLBTOTAL-26JUN03TEXSTL-8",
    event_ticker: "KXMLBGAME-26JUN03TEXSTL",
    title: "Will the game total go over 8 runs?",
    status: "open",
    yes_bid_cents: 48,
    yes_ask_cents: 52,
    no_bid_cents: 48,
    no_ask_cents: 52,
    last_price_cents: 50,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(market, { search: "game win" }), false);
});

test("marketMatchesFilter expands Castle assists player/stat searches", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXNBAAST-26JUN03NYKSAS-SASCASTLE-6",
    event_ticker: "KXNBAGAME-26JUN03NYKSAS",
    title: "Will Stephon Castle record 6+ assists?",
    status: "open",
    yes_bid_cents: 46,
    yes_ask_cents: 49,
    no_bid_cents: 51,
    no_ask_cents: 54,
    last_price_cents: 48,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(market, { search: "castle assists" }), true);
});

test("marketSortScore prioritizes direct matchup markets over weak event markets", () => {
  const directMarket = normalizeTrackedMarket({
    ticker: "KXNBAGAME-26JUN03NYKSAS-NYK",
    event_ticker: "KXNBAGAME-26JUN03NYKSAS",
    title: "Game 1: New York at San Antonio Winner?",
    status: "open",
    yes_bid_cents: 61,
    yes_ask_cents: 64,
    no_bid_cents: 36,
    no_ask_cents: 39,
    last_price_cents: 62,
    updated_at: "2026-06-03T18:30:00Z"
  });
  const ticketMarket = normalizeTrackedMarket({
    ticker: "KXNBATICKET-26JUN03NYKSAS",
    event_ticker: "KXNBATICKET-26JUN03NYKSAS",
    title: "What will the get-in price be for Game 1?",
    status: "open",
    yes_bid_cents: 50,
    yes_ask_cents: 55,
    no_bid_cents: 45,
    no_ask_cents: 50,
    last_price_cents: 52,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.ok(
    marketSortScore(directMarket, { search: "knicks spurs" }) >
      marketSortScore(ticketMarket, { search: "knicks spurs" })
  );
});
