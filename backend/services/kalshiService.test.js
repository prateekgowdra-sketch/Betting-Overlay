import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchQueryInfo,
  getSearchSeriesTickers,
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

test("normalizeTrackedMarket reads real Kalshi price field names", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXNBA-26SPURS-WIN",
    event_ticker: "KXNBA-26SPURS",
    title: "Spurs win",
    status: "open",
    yes_bid: 41,
    yes_ask: 43,
    no_bid: 56,
    no_ask: 58,
    last_price: 42,
    previous_price: 39,
    volume: 1200,
    liquidity: 25000,
    updated_at: "2026-06-05T01:30:00Z"
  });

  assert.equal(market.yesBidCents, 41);
  assert.equal(market.yesAskCents, 43);
  assert.equal(market.noBidCents, 56);
  assert.equal(market.noAskCents, 58);
  assert.equal(market.lastPriceCents, 42);
  assert.equal(market.previousPriceCents, 39);
  assert.equal(market.volume, 1200);
  assert.equal(market.liquidityCents, 25000);
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

test("normalizeTrackedMarket resolves settled NO markets as NO 100 and YES 0", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXNHLGAME-26JUN04NYRFLA-NYR",
    event_ticker: "KXNHLGAME-26JUN04NYRFLA",
    title: "Rangers win",
    status: "settled",
    no_won: true,
    yes_bid_cents: null,
    yes_ask_cents: null,
    no_bid_cents: null,
    no_ask_cents: null,
    last_price_cents: 0,
    updated_at: "2026-06-04T03:30:00Z"
  });

  assert.equal(market.lifecycleStatus, "settled");
  assert.equal(market.resultKnown, true);
  assert.equal(market.winningSide, "NO");
  assert.equal(market.yesBidCents, 0);
  assert.equal(market.yesAskCents, 0);
  assert.equal(market.noBidCents, 100);
  assert.equal(market.noAskCents, 100);
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

test("smart search detects Braves as an MLB team", () => {
  const queryInfo = buildSearchQueryInfo("braves", 2);

  assert.ok(queryInfo.expandedTerms.includes("atlanta braves"));
  assert.ok(queryInfo.expandedTerms.includes("atl"));
  assert.deepEqual(queryInfo.detectedSports, ["MLB"]);
  assert.equal(queryInfo.detectedTeams[0].team, "Atlanta Braves");
});

test("Braves search queries MLB series even without an explicit sport filter", () => {
  const seriesTickers = getSearchSeriesTickers({ search: "braves" });

  assert.ok(seriesTickers.includes("KXMLB"));
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

test("marketMatchesFilter supports Braves nickname and full-name searches", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXMLBGAME-26JUN08ATLNYM-ATL",
    event_ticker: "KXMLBGAME-26JUN08ATLNYM",
    title: "Atlanta Braves to beat the New York Mets?",
    status: "open",
    yes_bid_cents: 44,
    yes_ask_cents: 46,
    no_bid_cents: 54,
    no_ask_cents: 56,
    last_price_cents: 45,
    updated_at: "2026-06-06T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(market, { sport: "mlb", search: "braves" }), true);
  assert.equal(marketMatchesFilter(market, { sport: "mlb", search: "atlanta braves" }), true);
});

test("Braves search rejects markets that only mention ATL in the event ticker", () => {
  const opponentMarket = normalizeTrackedMarket({
    ticker: "KXMLBGAME-26JUN08ATLNYM-NYM",
    event_ticker: "KXMLBGAME-26JUN08ATLNYM",
    title: "New York Mets to win",
    status: "open",
    yes_bid_cents: 54,
    yes_ask_cents: 56,
    no_bid_cents: 44,
    no_ask_cents: 46,
    last_price_cents: 55,
    updated_at: "2026-06-06T18:30:00Z"
  });
  const totalMarket = normalizeTrackedMarket({
    ticker: "KXMLBTOTAL-26JUN08ATLNYM-8",
    event_ticker: "KXMLBGAME-26JUN08ATLNYM",
    title: "Will the game total go over 8 runs?",
    status: "open",
    yes_bid_cents: 48,
    yes_ask_cents: 50,
    no_bid_cents: 50,
    no_ask_cents: 52,
    last_price_cents: 49,
    updated_at: "2026-06-06T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(opponentMarket, { sport: "mlb", search: "braves" }), false);
  assert.equal(marketMatchesFilter(totalMarket, { sport: "mlb", search: "braves" }), false);
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

test("Spurs search matches direct team markets", () => {
  const teamMarket = normalizeTrackedMarket({
    ticker: "KXNBAGAME-26JUN03NYKSAS-SAS",
    event_ticker: "KXNBAGAME-26JUN03NYKSAS",
    title: "Game 1: New York at San Antonio Winner?",
    status: "open",
    yes_bid_cents: 36,
    yes_ask_cents: 39,
    no_bid_cents: 61,
    no_ask_cents: 64,
    last_price_cents: 38,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(teamMarket, { search: "spurs" }), true);
  assert.equal(marketMatchesFilter(teamMarket, { sport: "nba", search: "spurs" }), true);
});

test("player prop searches can be filtered to player scope", () => {
  const playerProp = normalizeTrackedMarket({
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

  assert.equal(playerProp.scope, "player");
  assert.equal(marketMatchesFilter(playerProp, { scope: "player", search: "castle assists" }), true);
  assert.equal(marketMatchesFilter(playerProp, { scope: "team", search: "castle assists" }), false);
});

test("team searches can include player props for that team", () => {
  const playerProp = normalizeTrackedMarket({
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

  assert.equal(marketMatchesFilter(playerProp, { search: "spurs" }), true);
  assert.equal(marketMatchesFilter(playerProp, { scope: "player", search: "spurs assists" }), true);
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

test("sports search recognizes soccer and World Cup style market text", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXWORLDCUPGAME-26JUN12USAMEX-USA",
    event_ticker: "KXWORLDCUPGAME-26JUN12USAMEX",
    title: "Will USA beat Mexico in the World Cup?",
    status: "open",
    yes_bid_cents: 48,
    yes_ask_cents: 52,
    no_bid_cents: 48,
    no_ask_cents: 52,
    last_price_cents: 50,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(market.sport, "Soccer");
  assert.equal(marketMatchesFilter(market, { sport: "soccer", search: "world cup usa mexico" }), true);
});

test("world cup search can match event context and country market side", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXFIFAWCGAME-26JUN12CANMEX-CAN",
    event_ticker: "KXFIFAWCGAME-26JUN12CANMEX",
    event_title: "2026 World Cup: Canada vs Mexico",
    title: "Canada",
    yes_sub_title: "Canada",
    status: "open",
    yes_bid_cents: 35,
    yes_ask_cents: 39,
    no_bid_cents: 61,
    no_ask_cents: 65,
    last_price_cents: 37,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(market.sport, "Soccer");
  assert.equal(marketMatchesFilter(market, { sport: "soccer", search: "world cup canada" }), true);
});

test("soccer country search ranks single game outcomes above combos", () => {
  const singleOutcome = normalizeTrackedMarket({
    ticker: "KXFIFAWCGAME-26JUN12CANMEX-CAN",
    event_ticker: "KXFIFAWCGAME-26JUN12CANMEX",
    event_title: "2026 World Cup: Canada vs Mexico",
    title: "Canada",
    yes_sub_title: "Canada",
    status: "open",
    yes_bid_cents: 35,
    yes_ask_cents: 39,
    no_bid_cents: 61,
    no_ask_cents: 65,
    last_price_cents: 37,
    updated_at: "2026-06-03T18:30:00Z"
  });
  const comboMarket = normalizeTrackedMarket({
    ticker: "KXMVE-26JUN12WORLDCUP-CANMEXBRA",
    event_ticker: "KXMVE-26JUN12WORLDCUP",
    event_title: "2026 World Cup combos",
    title: "Canada and Brazil both win",
    status: "open",
    yes_bid_cents: 20,
    yes_ask_cents: 24,
    no_bid_cents: 76,
    no_ask_cents: 80,
    last_price_cents: 22,
    updated_at: "2026-06-03T18:30:00Z",
    mve_selected_legs: [
      { market_ticker: "KXFIFAWCGAME-26JUN12CANMEX-CAN", side: "yes" },
      { market_ticker: "KXFIFAWCGAME-26JUN13BRAGER-BRA", side: "yes" }
    ]
  });

  assert.ok(
    marketSortScore(singleOutcome, { sport: "soccer", search: "canada world cup" }) >
      marketSortScore(comboMarket, { sport: "soccer", search: "canada world cup" })
  );
});

test("world cup round qualifier markets rank as single soccer outcomes", () => {
  const qualifier = normalizeTrackedMarket({
    ticker: "KXWCROUND-26SEMI-CAN",
    event_ticker: "KXWCROUND-26SEMI",
    event_title: "World Cup Semifinals Qualifiers",
    title: "Will Canada qualify for FIFA World Cup Semifinals?",
    status: "open",
    yes_bid_cents: 15,
    yes_ask_cents: 18,
    no_bid_cents: 82,
    no_ask_cents: 85,
    last_price_cents: 17,
    updated_at: "2026-06-03T18:30:00Z"
  });
  const comboMarket = normalizeTrackedMarket({
    ticker: "KXMVE-26WORLDCUP-CANQUALIFYCOMBO",
    event_ticker: "KXMVE-26WORLDCUP",
    event_title: "World Cup combos",
    title: "Canada qualifies and Brazil wins Group C",
    status: "open",
    yes_bid_cents: 10,
    yes_ask_cents: 13,
    no_bid_cents: 87,
    no_ask_cents: 90,
    last_price_cents: 11,
    updated_at: "2026-06-03T18:30:00Z",
    mve_selected_legs: [
      { market_ticker: "KXWCROUND-26SEMI-CAN", side: "yes" },
      { market_ticker: "KXWCGROUP-26C-BRA", side: "yes" }
    ]
  });

  assert.equal(marketMatchesFilter(qualifier, { sport: "soccer", search: "canada world cup" }), true);
  assert.ok(
    marketSortScore(qualifier, { sport: "soccer", search: "canada world cup" }) >
      marketSortScore(comboMarket, { sport: "soccer", search: "canada world cup" })
  );
});

test("non-sports Canada markets keep their Kalshi category instead of Sports", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXCANADAPM-26",
    event_ticker: "KXCANADAPM-26",
    title: "Will Canada have a new Prime Minister in 2026?",
    category: "Politics",
    status: "open",
    yes_bid_cents: 44,
    yes_ask_cents: 48,
    no_bid_cents: 52,
    no_ask_cents: 56,
    last_price_cents: 46,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(market.sport, "Politics");
  assert.equal(market.competition, "Politics");
});

test("canada world cup search matches real KXWCROUND qualifier market", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXWCROUND-26SEMI-CAN",
    event_ticker: "KXWCROUND-26SEMI",
    event_title: "World Cup Semifinals Qualifiers",
    title: "Will Canada qualify for FIFA World Cup Semifinals?",
    category: "Sports",
    status: "open",
    yes_bid_cents: 15,
    yes_ask_cents: 18,
    no_bid_cents: 82,
    no_ask_cents: 85,
    last_price_cents: 17,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(market.sport, "Soccer");
  assert.equal(marketMatchesFilter(market, { search: "canada world cup" }), true);
  assert.equal(marketMatchesFilter(market, { sport: "soccer", search: "canada world cup" }), true);
});

test("canada world cup search does not match player names containing can", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXWCPLAYERGOALS-26URU-ACANOB17",
    event_ticker: "KXWCPLAYERGOALS-26URU",
    event_title: "Uruguay: Goalscorers",
    title: "Will Agustin Canobbio score a goal in the 2026 Men's FIFA World Cup?",
    category: "Sports",
    status: "open",
    yes_bid_cents: 2,
    yes_ask_cents: 5,
    no_bid_cents: 95,
    no_ask_cents: 98,
    last_price_cents: 3,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(market, { search: "canada world cup" }), false);
});

test("canada world cup search still matches Canada event text", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXWCPLAYERGOALS-26CAN-JOSORI21",
    event_ticker: "KXWCPLAYERGOALS-26CAN",
    event_title: "Canada: Goalscorers",
    title: "Will Jonathan Osorio score a goal in the 2026 Men's FIFA World Cup?",
    category: "Sports",
    status: "open",
    yes_bid_cents: 2,
    yes_ask_cents: 5,
    no_bid_cents: 95,
    no_ask_cents: 98,
    last_price_cents: 3,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(marketMatchesFilter(market, { search: "canada world cup" }), true);
});

test("canada world cup search queries World Cup round series before generic soccer", () => {
  const seriesTickers = getSearchSeriesTickers({ search: "canada world cup" });

  assert.ok(seriesTickers.includes("KXWCROUND"));
  assert.ok(seriesTickers.indexOf("KXWCROUND") < seriesTickers.indexOf("KXSOCCER"));
});

test("marketSortScore recognizes hockey as a direct sports line", () => {
  const directMarket = normalizeTrackedMarket({
    ticker: "KXNHLGAME-26JUN04NYRFLA-NYR",
    event_ticker: "KXNHLGAME-26JUN04NYRFLA",
    title: "Will the Rangers beat the Panthers?",
    status: "open",
    yes_bid_cents: 45,
    yes_ask_cents: 48,
    no_bid_cents: 52,
    no_ask_cents: 55,
    last_price_cents: 46,
    updated_at: "2026-06-03T18:30:00Z"
  });
  const genericMarket = normalizeTrackedMarket({
    ticker: "KXHOCKEYTICKET-26JUN04NYRFLA",
    event_ticker: "KXHOCKEYTICKET-26JUN04NYRFLA",
    title: "What will tickets cost for Rangers vs Panthers?",
    status: "open",
    yes_bid_cents: 45,
    yes_ask_cents: 48,
    no_bid_cents: 52,
    no_ask_cents: 55,
    last_price_cents: 46,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.ok(
    marketSortScore(directMarket, { search: "hockey rangers panthers" }) >
      marketSortScore(genericMarket, { search: "hockey rangers panthers" })
  );
});

test("sport filter supports college football aliases", () => {
  const market = normalizeTrackedMarket({
    ticker: "KXNCAAFGAME-26SEP05UGAALA-UGA",
    event_ticker: "KXNCAAFGAME-26SEP05UGAALA",
    title: "Will Georgia beat Alabama?",
    status: "open",
    yes_bid_cents: 50,
    yes_ask_cents: 53,
    no_bid_cents: 47,
    no_ask_cents: 50,
    last_price_cents: 52,
    updated_at: "2026-06-03T18:30:00Z"
  });

  assert.equal(market.sport, "College Football");
  assert.equal(marketMatchesFilter(market, { sport: "ncaafb", search: "college football georgia alabama" }), true);
});
