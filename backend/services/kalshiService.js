import { kalshiClient } from "./kalshiClient.js";
import { parseKalshiMarketTitle } from "./marketParsingService.js";
import { researchModelService } from "./researchModelService.js";

const marketSearchCache = new Map();
const MARKET_SEARCH_CACHE_TTL_MS = 30000;
const liveContextCache = new Map();
const LIVE_CONTEXT_CACHE_TTL_MS = 120000;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function currentByPlayer(game, playerName, statType) {
  return (
    game.playerStats.find(
      (playerStat) =>
        playerStat.playerName === playerName && playerStat.statType === statType
    )?.current ?? 0
  );
}

function getNowIso() {
  return new Date().toISOString();
}

function getCachedValue(key) {
  const cached = marketSearchCache.get(key);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAt > MARKET_SEARCH_CACHE_TTL_MS) {
    marketSearchCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedValue(key, value) {
  marketSearchCache.set(key, {
    cachedAt: Date.now(),
    value
  });
}

function getCachedLiveContext(key) {
  const cached = liveContextCache.get(key);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAt > LIVE_CONTEXT_CACHE_TTL_MS) {
    liveContextCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedLiveContext(key, value) {
  liveContextCache.set(key, {
    cachedAt: Date.now(),
    value
  });
}

function getMockPortfolioPositions() {
  return [
    {
      ticker: "KXO-NYK-CLE-MONEYLINE",
      market_title: "Will the Knicks beat the Cavaliers?",
      side: "YES",
      position_contracts: 10,
      entry_price_cents: 48,
      current_price_cents: 62,
      realized_pnl_cents: 0,
      unrealized_pnl_cents: 140,
      updated_at: getNowIso()
    },
    {
      ticker: "KXO-JBRUNSON-PTS-25",
      market_title: "Will Jalen Brunson score 25+ points?",
      side: "YES",
      position_contracts: 5,
      entry_price_cents: 52,
      current_price_cents: 67,
      realized_pnl_cents: 0,
      unrealized_pnl_cents: 75,
      updated_at: getNowIso()
    }
  ];
}

function getMockMarkets() {
  return [
    {
      ticker: "KXO-NYK-CLE-MONEYLINE",
      event_ticker: "KXO-NYK-CLE",
      event_title: "Knicks vs Cavaliers",
      title: "Will the Knicks beat the Cavaliers?",
      sport: "NBA",
      competition: "NBA",
      scope: "team",
      status: "active",
      yes_bid_cents: 60,
      yes_ask_cents: 64,
      no_bid_cents: 36,
      no_ask_cents: 40,
      last_price_cents: 62,
      updated_at: getNowIso()
    },
    {
      ticker: "KXO-JBRUNSON-PTS-25",
      event_ticker: "KXO-NYK-CLE",
      event_title: "Knicks vs Cavaliers",
      title: "Will Jalen Brunson score 25+ points?",
      sport: "NBA",
      competition: "NBA",
      scope: "player",
      status: "active",
      yes_bid_cents: 65,
      yes_ask_cents: 69,
      no_bid_cents: 31,
      no_ask_cents: 35,
      last_price_cents: 67,
      updated_at: getNowIso()
    }
  ];
}

function dollarsStringToCents(value) {
  if (typeof value !== "string" || value === "") {
    return null;
  }

  const numeric = Number(value);

  if (Number.isNaN(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

function centsNumberOrNull(value) {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  if (String(value).trim() === "") {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function centsAmountOrNull(value) {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  if (String(value).trim() === "") {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.round(numeric));
}

function fixedPointStringToNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) ?? null;
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = numberOrNull(value);

    if (typeof numeric === "number") {
      return numeric;
    }
  }

  return null;
}

function findNestedValue(source, candidateKeys) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const queue = [source];
  const seen = new Set();
  const keys = new Set(candidateKeys.map((key) => key.toLowerCase()));

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }

    seen.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (keys.has(key.toLowerCase()) && value !== undefined && value !== null && value !== "") {
        return value;
      }

      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return null;
}

function unwrapLiveDataCandidate(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return (
    payload.live_data ??
    payload.liveData ??
    payload.game ??
    payload.game_context ??
    payload.gameContext ??
    payload.event?.live_data ??
    payload.event?.liveData ??
    payload.event ??
    payload
  );
}

function normalizeLiveContextFromPayload(payload, fallbackMarket = null) {
  const liveData = unwrapLiveDataCandidate(payload);

  if (!liveData || typeof liveData !== "object") {
    return null;
  }

  const homeTeam = firstString(
    liveData.home_team,
    liveData.homeTeam,
    liveData.home?.name,
    liveData.home?.team,
    findNestedValue(liveData, ["home_team", "homeTeam", "homeName", "home"])
  );
  const awayTeam = firstString(
    liveData.away_team,
    liveData.awayTeam,
    liveData.away?.name,
    liveData.away?.team,
    findNestedValue(liveData, ["away_team", "awayTeam", "awayName", "away"])
  );
  const homeScore = firstNumber(
    liveData.home_score,
    liveData.homeScore,
    liveData.home?.score,
    findNestedValue(liveData, ["home_score", "homeScore"])
  );
  const awayScore = firstNumber(
    liveData.away_score,
    liveData.awayScore,
    liveData.away?.score,
    findNestedValue(liveData, ["away_score", "awayScore"])
  );
  const status = firstString(
    liveData.status,
    liveData.game_status,
    liveData.gameStatus,
    liveData.state,
    findNestedValue(liveData, ["status", "game_status", "gameStatus"])
  );
  const period = firstString(
    liveData.period,
    liveData.quarter,
    liveData.inning,
    liveData.half,
    findNestedValue(liveData, ["period", "quarter", "inning", "half"])
  );
  const clock = firstString(
    liveData.clock,
    liveData.game_clock,
    liveData.gameClock,
    liveData.time_remaining,
    findNestedValue(liveData, ["clock", "game_clock", "gameClock", "time_remaining"])
  );
  const updatedAt = firstString(
    liveData.updated_at,
    liveData.updatedAt,
    liveData.last_updated,
    liveData.lastUpdated,
    findNestedValue(liveData, ["updated_at", "updatedAt", "last_updated", "lastUpdated"])
  );
  const hasScoreboard =
    Boolean(homeTeam || awayTeam || status || period || clock) ||
    typeof homeScore === "number" ||
    typeof awayScore === "number";

  if (!hasScoreboard) {
    return null;
  }

  return {
    available: true,
    source: "kalshi_live_data",
    sport: fallbackMarket?.sport ?? null,
    status,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    period,
    clock,
    updatedAt: updatedAt ?? getNowIso()
  };
}

function unavailableLiveContext(reason, market = null) {
  return {
    available: false,
    source: "unavailable",
    sport: market?.sport ?? null,
    status: null,
    homeTeam: null,
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    period: null,
    clock: null,
    updatedAt: getNowIso(),
    unavailableReason: reason
  };
}

const TEAM_NAMES_BY_ABBR = {
  ATL: "Hawks",
  BKN: "Nets",
  BOS: "Celtics",
  CHA: "Hornets",
  CHI: "Bulls",
  CLE: "Cavaliers",
  DAL: "Mavericks",
  DEN: "Nuggets",
  DET: "Pistons",
  GSW: "Warriors",
  HOU: "Rockets",
  IND: "Pacers",
  LAC: "Clippers",
  LAL: "Lakers",
  MEM: "Grizzlies",
  MIA: "Heat",
  MIL: "Bucks",
  MIN: "Timberwolves",
  NOP: "Pelicans",
  NYK: "Knicks",
  OKC: "Thunder",
  ORL: "Magic",
  PHI: "76ers",
  PHX: "Suns",
  POR: "Trail Blazers",
  SAC: "Kings",
  SAS: "Spurs",
  TOR: "Raptors",
  UTA: "Jazz",
  WAS: "Wizards"
};

const MLB_TEAM_NAMES_BY_ABBR = {
  ARI: "Diamondbacks",
  ATH: "A's",
  ATL: "Braves",
  BAL: "Orioles",
  BOS: "Red Sox",
  CHC: "Cubs",
  CIN: "Reds",
  CLE: "Guardians",
  COL: "Rockies",
  CWS: "White Sox",
  DET: "Tigers",
  HOU: "Astros",
  KC: "Royals",
  LAA: "Angels",
  LAD: "Dodgers",
  MIA: "Marlins",
  MIL: "Brewers",
  MIN: "Twins",
  NYM: "Mets",
  NYY: "Yankees",
  PHI: "Phillies",
  PIT: "Pirates",
  SD: "Padres",
  SEA: "Mariners",
  SF: "Giants",
  STL: "Cardinals",
  TB: "Rays",
  TEX: "Rangers",
  TOR: "Blue Jays",
  WSH: "Nationals"
};

const NFL_TEAM_NAMES_BY_ABBR = {
  ARI: "Cardinals",
  ATL: "Falcons",
  BAL: "Ravens",
  BUF: "Bills",
  CAR: "Panthers",
  CHI: "Bears",
  CIN: "Bengals",
  CLE: "Browns",
  DAL: "Cowboys",
  DEN: "Broncos",
  DET: "Lions",
  GB: "Packers",
  HOU: "Texans",
  IND: "Colts",
  JAX: "Jaguars",
  KC: "Chiefs",
  LAC: "Chargers",
  LAR: "Rams",
  LV: "Raiders",
  MIA: "Dolphins",
  MIN: "Vikings",
  NE: "Patriots",
  NO: "Saints",
  NYG: "Giants",
  NYJ: "Jets",
  PHI: "Eagles",
  PIT: "Steelers",
  SEA: "Seahawks",
  SF: "49ers",
  TB: "Buccaneers",
  TEN: "Titans",
  WSH: "Commanders"
};

const NHL_TEAM_NAMES_BY_ABBR = {
  ANA: "Ducks",
  BOS: "Bruins",
  BUF: "Sabres",
  CAR: "Hurricanes",
  CBJ: "Blue Jackets",
  CGY: "Flames",
  CHI: "Blackhawks",
  COL: "Avalanche",
  DAL: "Stars",
  DET: "Red Wings",
  EDM: "Oilers",
  FLA: "Panthers",
  LAK: "Kings",
  MIN: "Wild",
  MTL: "Canadiens",
  NJD: "Devils",
  NSH: "Predators",
  NYI: "Islanders",
  NYR: "Rangers",
  OTT: "Senators",
  PHI: "Flyers",
  PIT: "Penguins",
  SEA: "Kraken",
  SJS: "Sharks",
  STL: "Blues",
  TB: "Lightning",
  TOR: "Maple Leafs",
  UTA: "Mammoth",
  VAN: "Canucks",
  VGK: "Golden Knights",
  WPG: "Jets",
  WSH: "Capitals"
};

const NBA_STAT_LABELS = {
  PTS: "pts",
  REB: "reb",
  AST: "ast",
  "3PT": "3PM",
  STL: "stl",
  BLK: "blk",
  TO: "turnovers"
};

function humanizePlayerCode(value) {
  const withoutNumber = String(value ?? "").replace(/\d+$/g, "");
  const match = withoutNumber.match(/^([A-Z])([A-Z]+)$/);

  if (!match) {
    return withoutNumber;
  }

  return `${match[1]} ${titleCase(match[2])}`;
}

function formatMatchupCode(matchupCode) {
  const match = String(matchupCode ?? "").match(/^([A-Z]{3})([A-Z]{3})$/);

  if (!match) {
    return matchupCode;
  }

  return `${match[1]}-${match[2]}`;
}

function deriveDisplayTitleFromTicker(rawMarket) {
  const ticker = String(rawMarket?.ticker ?? "");
  const nbaMatch = ticker.match(/^KXNBA(GAME|PTS|REB|AST|3PT|STL|BLK|TO|TOTAL|SPREAD)-[^-]+([A-Z]{6})-([A-Z0-9]+)$/);
  const mlbMatch = ticker.match(/^KXMLB(GAME|TOTAL|SPREAD|HR|HIT|KS)-[^-]+([A-Z]{4,6})-([A-Z0-9]+)$/);
  const nflMatch = ticker.match(/^KXNFL(GAME|TOTAL|SPREAD|TD|PASS|RUSH|REC)-[^-]+([A-Z]{4,6})-([A-Z0-9]+)$/);
  const nhlMatch = ticker.match(/^KXNHL(GAME|TOTAL|SPREAD|GOAL|PTS)-[^-]+([A-Z]{4,6})-([A-Z0-9]+)$/);

  if (!nbaMatch) {
    if (!mlbMatch && !nflMatch && !nhlMatch) {
      return null;
    }

    const directMatch = mlbMatch ?? nflMatch ?? nhlMatch;
    const teamNames =
      mlbMatch ? MLB_TEAM_NAMES_BY_ABBR : nflMatch ? NFL_TEAM_NAMES_BY_ABBR : NHL_TEAM_NAMES_BY_ABBR;
    const [, marketType, matchupCode, selection] = directMatch;
    const matchup = formatMatchupCode(matchupCode);

    if (marketType === "GAME") {
      const teamName = teamNames[selection] ?? selection;
      return `${teamName} win`;
    }

    if (marketType === "TOTAL") {
      return `${matchup} total ${selection}`;
    }

    if (marketType === "SPREAD") {
      const team = Object.keys(teamNames).find((abbr) => selection.startsWith(abbr));
      const line = team ? selection.slice(team.length) : selection;
      return `${teamNames[team] ?? team ?? matchup} spread ${line}`;
    }

    return rawMarket?.yes_sub_title ?? rawMarket?.subtitle ?? null;
  }

  const [, marketType, matchupCode, selection] = nbaMatch;
  const matchup = formatMatchupCode(matchupCode);

  if (marketType === "GAME") {
    const teamName = TEAM_NAMES_BY_ABBR[selection] ?? selection;
    return `${teamName} win`;
  }

  if (marketType === "TOTAL") {
    return `${matchup} total ${selection}`;
  }

  if (marketType === "SPREAD") {
    const team = selection.slice(0, 3);
    const line = selection.slice(3);
    return `${TEAM_NAMES_BY_ABBR[team] ?? team} spread ${line}`;
  }

  const playerMatch = selection.match(/^([A-Z]{3})([A-Z0-9]+)-(\d+(?:\.\d+)?)$/);

  if (playerMatch) {
    const [, team, playerCode, line] = playerMatch;
    const playerName = humanizePlayerCode(playerCode);
    return `${playerName} ${line}+ ${NBA_STAT_LABELS[marketType] ?? marketType.toLowerCase()} (${team})`;
  }

  return null;
}

function getReadableMarketTitle(rawMarket, fallbackTitle) {
  const derivedTitle = deriveDisplayTitleFromTicker(rawMarket);
  const rawTitle = String(fallbackTitle ?? rawMarket?.title ?? rawMarket?.ticker ?? "");

  if (derivedTitle) {
    return derivedTitle;
  }

  if (/^KX[A-Z0-9-]+$/.test(rawTitle)) {
    return rawMarket?.yes_sub_title ?? rawMarket?.subtitle ?? rawTitle;
  }

  return rawTitle;
}

function normalizeLifecycleStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (!normalized) {
    return "unavailable";
  }

  if (["settled"].some((token) => normalized.includes(token))) {
    return "settled";
  }

  if (["finalized", "resolved"].some((token) => normalized.includes(token))) {
    return "finalized";
  }

  if (["closed", "expired", "inactive", "final"].some((token) => normalized.includes(token))) {
    return "closed";
  }

  if (["active", "open", "live", "trading"].some((token) => normalized.includes(token))) {
    return "open";
  }

  return "unavailable";
}

function isResolvedLifecycle(lifecycleStatus) {
  return ["closed", "finalized", "settled"].includes(lifecycleStatus);
}

function parseWinningSideValue(value) {
  if (typeof value === "boolean") {
    return value ? "YES" : "NO";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 99) {
      return "YES";
    }

    if (value <= 1) {
      return "NO";
    }
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (["yes", "y", "true", "1", "yes_won"].includes(normalized)) {
    return "YES";
  }

  if (["no", "n", "false", "0", "no_won"].includes(normalized)) {
    return "NO";
  }

  if (normalized.includes("yes") && normalized.includes("won")) {
    return "YES";
  }

  if (normalized.includes("no") && normalized.includes("won")) {
    return "NO";
  }

  return null;
}

function getWinningSide(rawMarket, lifecycleStatus, lastPriceCents) {
  const explicitWinningSide = [
    rawMarket?.winning_side,
    rawMarket?.winningSide,
    rawMarket?.winner,
    rawMarket?.result,
    rawMarket?.outcome,
    rawMarket?.settlement_result,
    rawMarket?.settlementResult,
    rawMarket?.resolved_outcome,
    rawMarket?.resolvedOutcome,
    rawMarket?.market_result,
    findNestedValue(rawMarket, [
      "winning_side",
      "winningSide",
      "winner",
      "result",
      "outcome",
      "settlement_result",
      "settlementResult",
      "resolved_outcome",
      "resolvedOutcome",
      "market_result"
    ])
  ]
    .map(parseWinningSideValue)
    .find(Boolean);

  if (explicitWinningSide) {
    return explicitWinningSide;
  }

  const explicitSettlementPrice = [
    rawMarket?.settlement_price_cents,
    rawMarket?.settlementPriceCents,
    rawMarket?.settlement_value_cents,
    rawMarket?.settlementValueCents,
    rawMarket?.final_price_cents,
    rawMarket?.finalPriceCents,
    dollarsStringToCents(rawMarket?.settlement_price_dollars),
    dollarsStringToCents(rawMarket?.settlementPriceDollars),
    dollarsStringToCents(rawMarket?.settlement_value_dollars),
    dollarsStringToCents(rawMarket?.settlementValueDollars),
    dollarsStringToCents(rawMarket?.final_price_dollars),
    dollarsStringToCents(rawMarket?.finalPriceDollars)
  ]
    .map(parseWinningSideValue)
    .find(Boolean);

  if (explicitSettlementPrice) {
    return explicitSettlementPrice;
  }

  if (rawMarket?.yes_won === true || rawMarket?.yesWon === true) {
    return "YES";
  }

  if (rawMarket?.no_won === true || rawMarket?.noWon === true) {
    return "NO";
  }

  if (isResolvedLifecycle(lifecycleStatus)) {
    return parseWinningSideValue(lastPriceCents);
  }

  return null;
}

function normalizeKalshiMarket(rawMarket) {
  if (!rawMarket) {
    return null;
  }

  const lifecycleStatus = normalizeLifecycleStatus(rawMarket.status);
  const isResolved = isResolvedLifecycle(lifecycleStatus);

  if (
    "yes_ask_cents" in rawMarket ||
    "yes_bid_cents" in rawMarket ||
    "yes_ask" in rawMarket ||
    "yes_bid" in rawMarket ||
    "last_price" in rawMarket
  ) {
    const yesBidCents = centsNumberOrNull(rawMarket.yes_bid_cents ?? rawMarket.yes_bid);
    const yesAskCents = centsNumberOrNull(rawMarket.yes_ask_cents ?? rawMarket.yes_ask);
    const lastPriceCents = centsNumberOrNull(rawMarket.last_price_cents ?? rawMarket.last_price);
    const yesPriceCents =
      lastPriceCents ?? yesAskCents ?? yesBidCents ?? null;
    const noPriceCents =
      centsNumberOrNull(rawMarket.no_ask_cents ?? rawMarket.no_ask) ??
      centsNumberOrNull(rawMarket.no_bid_cents ?? rawMarket.no_bid) ??
      (typeof yesPriceCents === "number" ? 100 - yesPriceCents : null);
    const winningSide = getWinningSide(rawMarket, lifecycleStatus, lastPriceCents);

    return {
      ticker: rawMarket.ticker,
      title: rawMarket.title,
      status: rawMarket.status,
      lifecycleStatus,
      isActive: lifecycleStatus === "open",
      isResolved,
      winningSide,
      resultKnown: Boolean(winningSide),
      yesPriceCents,
      noPriceCents,
      lastPriceCents: lastPriceCents ?? yesPriceCents,
      updatedAt: rawMarket.updated_at ?? null
    };
  }

  const yesPriceCents =
    dollarsStringToCents(rawMarket.yes_ask_dollars) ??
    dollarsStringToCents(rawMarket.yes_bid_dollars) ??
    dollarsStringToCents(rawMarket.last_price_dollars) ??
    centsNumberOrNull(rawMarket.yes_ask_cents ?? rawMarket.yes_ask) ??
    centsNumberOrNull(rawMarket.yes_bid_cents ?? rawMarket.yes_bid) ??
    centsNumberOrNull(rawMarket.last_price_cents ?? rawMarket.last_price);
  const noPriceCents =
    dollarsStringToCents(rawMarket.no_ask_dollars) ??
    dollarsStringToCents(rawMarket.no_bid_dollars) ??
    centsNumberOrNull(rawMarket.no_ask_cents ?? rawMarket.no_ask) ??
    centsNumberOrNull(rawMarket.no_bid_cents ?? rawMarket.no_bid) ??
    (typeof yesPriceCents === "number" ? 100 - yesPriceCents : null);
  const lastPriceCents =
    dollarsStringToCents(rawMarket.last_price_dollars) ??
    centsNumberOrNull(rawMarket.last_price_cents ?? rawMarket.last_price) ??
    yesPriceCents;
  const winningSide = getWinningSide(rawMarket, lifecycleStatus, lastPriceCents);

  return {
    ticker: rawMarket.ticker,
    title: rawMarket.title ?? rawMarket.yes_sub_title ?? rawMarket.ticker,
    status: rawMarket.status ?? "unknown",
    lifecycleStatus,
    isActive: lifecycleStatus === "open",
    isResolved,
    winningSide,
    resultKnown: Boolean(winningSide),
    yesPriceCents,
    noPriceCents,
    lastPriceCents,
    updatedAt: rawMarket.updated_time ?? null
  };
}

function normalizeTrackedMarket(rawMarket, position = null) {
  const normalized = normalizeKalshiMarket(rawMarket);

  if (!normalized) {
    return null;
  }

  const metadata = deriveSportsMarketMetadata(rawMarket);
  const title =
    rawMarket.title ??
    rawMarket.market_title ??
    rawMarket.subtitle ??
    rawMarket.yes_sub_title ??
    normalized.title;
  const displayTitle = getReadableMarketTitle(rawMarket, title);
  const resolvedYesCents = normalized.resultKnown
    ? normalized.winningSide === "YES"
      ? 100
      : 0
    : null;
  const resolvedNoCents = normalized.resultKnown
    ? normalized.winningSide === "NO"
      ? 100
      : 0
    : null;
  const shouldUseResolvedPrices = normalized.isResolved && normalized.resultKnown;
  const shouldHideUnknownResolvedPrices = normalized.isResolved && !normalized.resultKnown;

  return {
    ticker: normalized.ticker,
    eventTicker: rawMarket.event_ticker ?? rawMarket.eventTicker ?? null,
    title,
    displayTitle,
    subtitle: rawMarket.subtitle ?? rawMarket.yes_sub_title ?? null,
    sport: metadata.sport,
    competition: metadata.competition,
    scope: metadata.scope,
    eventTitle: rawMarket.event_title ?? rawMarket.eventTitle ?? null,
    status: rawMarket.status ?? normalized.status ?? "unknown",
    lifecycleStatus: normalized.lifecycleStatus,
    isActive: normalized.isActive,
    isResolved: normalized.isResolved,
    winningSide: normalized.winningSide,
    resultKnown: normalized.resultKnown,
    yesBidCents: shouldUseResolvedPrices
      ? resolvedYesCents
      : shouldHideUnknownResolvedPrices
        ? null
        : dollarsStringToCents(rawMarket.yes_bid_dollars) ??
          centsNumberOrNull(rawMarket.yes_bid_cents ?? rawMarket.yes_bid),
    yesAskCents: shouldUseResolvedPrices
      ? resolvedYesCents
      : shouldHideUnknownResolvedPrices
        ? null
        : dollarsStringToCents(rawMarket.yes_ask_dollars) ??
          centsNumberOrNull(rawMarket.yes_ask_cents ?? rawMarket.yes_ask),
    noBidCents: shouldUseResolvedPrices
      ? resolvedNoCents
      : shouldHideUnknownResolvedPrices
        ? null
        : dollarsStringToCents(rawMarket.no_bid_dollars) ??
          centsNumberOrNull(rawMarket.no_bid_cents ?? rawMarket.no_bid),
    noAskCents: shouldUseResolvedPrices
      ? resolvedNoCents
      : shouldHideUnknownResolvedPrices
        ? null
        : dollarsStringToCents(rawMarket.no_ask_dollars) ??
          centsNumberOrNull(rawMarket.no_ask_cents ?? rawMarket.no_ask),
    lastPriceCents: normalized.lastPriceCents,
    previousPriceCents:
      dollarsStringToCents(rawMarket.previous_price_dollars) ??
      centsNumberOrNull(rawMarket.previous_price_cents ?? rawMarket.previous_price),
    volume: fixedPointStringToNumber(rawMarket.volume_fp ?? rawMarket.volume) ?? null,
    openInterest: fixedPointStringToNumber(rawMarket.open_interest_fp ?? rawMarket.open_interest) ?? null,
    liquidityCents:
      dollarsStringToCents(rawMarket.liquidity_dollars) ??
      centsAmountOrNull(rawMarket.liquidity_cents ?? rawMarket.liquidity),
    closeTime: rawMarket.close_time ?? null,
    updatedAt: normalized.updatedAt,
    position
  };
}

const SPORT_MARKET_DEFINITIONS = [
  {
    key: "nba",
    label: "NBA",
    patterns: ["nba", "basketball", "knicks", "cavaliers", "thunder", "spurs"],
    tickerPrefixes: ["NBA"],
    seriesTickers: ["KXNBA"]
  },
  {
    key: "wnba",
    label: "WNBA",
    patterns: ["wnba"],
    tickerPrefixes: ["WNBA"],
    seriesTickers: ["KXWNBA"]
  },
  {
    key: "ncaamb",
    label: "College Basketball",
    patterns: ["ncaamb", "ncaab", "college basketball", "march madness"],
    tickerPrefixes: ["NCAAMB", "NCAAB", "CBB"],
    seriesTickers: ["KXNCAAMB", "KXNCAAB", "KXCBB"]
  },
  {
    key: "ncaafb",
    label: "College Football",
    patterns: ["ncaaf", "college football", "cfb", "college football playoff"],
    tickerPrefixes: ["NCAAF", "CFB"],
    seriesTickers: ["KXNCAAF", "KXCFB"]
  },
  {
    key: "nfl",
    label: "NFL",
    patterns: ["nfl", "football", "super bowl", "afc", "nfc"],
    tickerPrefixes: ["NFL"],
    seriesTickers: ["KXNFL"]
  },
  {
    key: "mlb",
    label: "MLB",
    patterns: ["mlb", "baseball", "world series"],
    tickerPrefixes: ["MLB"],
    seriesTickers: ["KXMLB"]
  },
  {
    key: "nhl",
    label: "NHL",
    patterns: ["nhl", "hockey", "stanley cup"],
    tickerPrefixes: ["NHL"],
    seriesTickers: ["KXNHL"]
  },
  {
    key: "soccer",
    label: "Soccer",
    patterns: [
      "soccer",
      "football club",
      "world cup",
      "fifa",
      "fifa world cup",
      "world cup 2026",
      "mls",
      "epl",
      "premier league",
      "champions league",
      "uefa",
      "euros",
      "la liga",
      "serie a",
      "bundesliga",
      "concacaf",
      "copa america"
    ],
    tickerPrefixes: ["SOCCER", "MLS", "EPL", "UCL", "UEFA", "FIFA", "FIFAWC", "WC", "WCUP", "WORLDCUP", "CONCACAF"],
    seriesTickers: [
      "KXWCROUND",
      "KXWCGROUP",
      "KXWCWINNER",
      "KXWCFIFATOP10",
      "KXWCNOEURSA",
      "KXWC",
      "KXWCUP",
      "KXFIFAWC",
      "KXFIFA",
      "KXWORLDCUP",
      "KXWORLDCUP2026",
      "KXWORLD-CUP",
      "KXSOCCER",
      "KXMLS",
      "KXEPL",
      "KXUCL",
      "KXUEFA"
    ]
  },
  {
    key: "tennis",
    label: "Tennis",
    patterns: ["tennis", "wimbledon", "us open", "french open", "australian open", "atp", "wta"],
    tickerPrefixes: ["TENNIS", "ATP", "WTA"],
    seriesTickers: ["KXTENNIS", "KXATP", "KXWTA"]
  },
  {
    key: "golf",
    label: "Golf",
    patterns: ["golf", "masters", "pga", "us open", "open championship", "ryder cup"],
    tickerPrefixes: ["GOLF", "PGA", "MASTERS", "RYDER"],
    seriesTickers: ["KXGOLF", "KXPGA", "KXMASTERS"]
  },
  {
    key: "mma",
    label: "MMA",
    patterns: ["mma", "ufc", "fight night", "mixed martial arts"],
    tickerPrefixes: ["MMA", "UFC"],
    seriesTickers: ["KXMMA", "KXUFC"]
  },
  {
    key: "boxing",
    label: "Boxing",
    patterns: ["boxing", "boxer", "fight"],
    tickerPrefixes: ["BOXING", "BOX"],
    seriesTickers: ["KXBOXING", "KXBOX"]
  },
  {
    key: "racing",
    label: "Racing",
    patterns: ["racing", "nascar", "formula 1", "f1", "indycar", "daytona"],
    tickerPrefixes: ["NASCAR", "F1", "FORMULA1", "INDYCAR", "RACING"],
    seriesTickers: ["KXNASCAR", "KXF1", "KXFORMULA1", "KXINDYCAR"]
  },
  {
    key: "cricket",
    label: "Cricket",
    patterns: ["cricket", "ipl", "t20", "world cup cricket"],
    tickerPrefixes: ["CRICKET", "IPL", "T20"],
    seriesTickers: ["KXCRICKET", "KXIPL", "KXT20"]
  }
];

const SPORTS_MARKET_HINTS = SPORT_MARKET_DEFINITIONS.map(({ key, label, patterns }) => ({
  key,
  label,
  patterns
}));
const SPORT_TICKER_PREFIXES = Array.from(
  new Set(SPORT_MARKET_DEFINITIONS.flatMap((sport) => sport.tickerPrefixes))
).sort((a, b) => b.length - a.length);
const SPORT_SERIES_TICKERS = Array.from(
  new Set(SPORT_MARKET_DEFINITIONS.flatMap((sport) => sport.seriesTickers))
).sort((a, b) => b.length - a.length);
const DIRECT_SPORTS_LINE_TYPES = [
  "GAME",
  "PTS",
  "REB",
  "AST",
  "3PT",
  "STL",
  "BLK",
  "TO",
  "TOTAL",
  "SPREAD",
  "HR",
  "HIT",
  "KS",
  "GOAL",
  "TD",
  "PASS",
  "RUSH",
  "REC",
  "SOG",
  "SAVE",
  "SET",
  "MATCH",
  "WIN",
  "WINNER",
  "MONEYLINE",
  "ROUND",
  "GROUP",
  "QUALIFY",
  "ADVANCE"
];

function normalizeFilterValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\bst\s+ouis\b/g, "st louis")
    .replace(/\b(vs|versus|v)\b/g, " ")
    .replace(/\b(the|will|win|wins|beat|beats|defeat|defeats|to|by|at|home|away)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTokens(value) {
  const normalized = normalizeSearchText(value);
  const compact = normalized.replace(/\s+/g, "");
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  return compact.length >= 4 && tokens.length <= 2 && tokens.some((token) => token.length <= 3)
    ? [...tokens, compact]
    : tokens;
}

const GENERIC_SEARCH_TERMS = new Set([
  "yes",
  "no",
  "over",
  "under",
  "game",
  "score",
  "market",
  "sports",
  "sport",
  "total",
  "line"
]);

function getMeaningfulSearchTokens(value) {
  return getSearchTokens(value).filter((token) => !GENERIC_SEARCH_TERMS.has(token));
}

const TEAM_SEARCH_ALIASES = {
  knicks: "nyk",
  spurs: "sas",
  yankees: "nyy",
  mets: "nym",
  dodgers: "lad",
  lakers: "lal",
  clippers: "lac",
  warriors: "gsw",
  celtics: "bos",
  bulls: "chi",
  heat: "mia",
  thunder: "okc",
  cavaliers: "cle",
  cavs: "cle",
  nuggets: "den",
  suns: "phx",
  mavericks: "dal",
  mavs: "dal",
  timberwolves: "min",
  wolves: "min",
  sixers: "phi",
  "76ers": "phi",
  bucks: "mil",
  hawks: "atl",
  magic: "orl",
  pacers: "ind",
  pistons: "det",
  raptors: "tor",
  rockets: "hou",
  grizzlies: "mem",
  pelicans: "nop",
  kings: "sac",
  blazers: "por",
  jazz: "uta",
  hornets: "cha",
  nets: "bkn",
  commanders: "wsh",
  football: "xnfl",
  nfl: "xnfl",
  ravens: "bal",
  bills: "buf",
  panthers: "car",
  bears: "chi",
  bengals: "cin",
  browns: "cle",
  cowboys: "dal",
  broncos: "den",
  lions: "det",
  packers: "gb",
  texans: "hou",
  colts: "ind",
  jaguars: "jax",
  chiefs: "kc",
  chargers: "lac",
  rams: "lar",
  raiders: "lv",
  dolphins: "mia",
  vikings: "min",
  patriots: "ne",
  saints: "no",
  eagles: "phi",
  steelers: "pit",
  seahawks: "sea",
  "49ers": "sf",
  niners: "sf",
  buccaneers: "tb",
  bucs: "tb",
  titans: "ten",
  jets: "nyj",
  ncaaf: "ncaaf",
  cfb: "cfb",
  ncaab: "ncaab",
  ncaamb: "ncaamb",
  "march": "march madness",
  madness: "march madness",
  baseball: "xmlb",
  mlb: "xmlb",
  texas: "tex",
  rangers: "tex",
  "st": "stl",
  louis: "stl",
  cardinals: "stl",
  arizona: "ari",
  diamondbacks: "ari",
  athletics: "ath",
  braves: "atl",
  baltimore: "bal",
  orioles: "bal",
  redsox: "bos",
  "red": "bos",
  sox: "bos",
  cubs: "chc",
  reds: "cin",
  guardians: "cle",
  rockies: "col",
  whitesox: "cws",
  tigers: "det",
  astros: "hou",
  royals: "kc",
  angels: "laa",
  padres: "sd",
  mariners: "sea",
  giants: "sf",
  rays: "tb",
  nationals: "wsh",
  phillies: "phi",
  pirates: "pit",
  marlins: "mia",
  brewers: "mil",
  twins: "min",
  bluejays: "tor",
  jays: "tor",
  hockey: "xnhl",
  nhl: "xnhl",
  ducks: "ana",
  bruins: "bos",
  sabres: "buf",
  hurricanes: "car",
  canes: "car",
  bluejackets: "cbj",
  flames: "cgy",
  blackhawks: "chi",
  avalanche: "col",
  avs: "col",
  stars: "dal",
  redwings: "det",
  oilers: "edm",
  devils: "njd",
  predators: "nsh",
  islanders: "nyi",
  penguins: "pit",
  pens: "pit",
  kraken: "sea",
  sharks: "sjs",
  blues: "stl",
  lightning: "tb",
  mapleleafs: "tor",
  canadiens: "mtl",
  habs: "mtl",
  senators: "ott",
  flyers: "phi",
  canucks: "van",
  goldenknights: "vgk",
  knights: "vgk",
  capitals: "wsh",
  caps: "wsh",
  soccer: "soccer",
  futbol: "soccer",
  "world": "world cup",
  cup: "world cup",
  fifa: "fifa",
  usa: "usa",
  "united": "united states",
  states: "united states",
  canada: "canada",
  canadian: "canada",
  mexico: "mex",
  argentina: "arg",
  brazil: "bra",
  england: "eng",
  france: "fra",
  germany: "ger",
  spain: "esp",
  portugal: "por",
  italy: "ita",
  netherlands: "ned",
  japan: "jpn",
  korea: "kor",
  morocco: "mar",
  senegal: "sen",
  ghana: "gha",
  uruguay: "uru",
  colombia: "col",
  chile: "chi",
  ecuador: "ecu",
  peru: "per",
  australia: "aus",
  croatia: "cro",
  belgium: "bel",
  switzerland: "sui",
  denmark: "den",
  norway: "nor",
  sweden: "swe",
  poland: "pol",
  turkey: "tur",
  iran: "irn",
  qatar: "qat",
  saudi: "ksa",
  arabia: "ksa",
  mls: "mls",
  premier: "epl",
  epl: "epl",
  champions: "champions",
  uefa: "uefa",
  euros: "uefa",
  liga: "la liga",
  bundesliga: "bundesliga",
  concacaf: "concacaf",
  tennis: "tennis",
  atp: "atp",
  wta: "wta",
  wimbledon: "wimbledon",
  golf: "golf",
  pga: "pga",
  masters: "masters",
  mma: "mma",
  ufc: "ufc",
  boxing: "boxing",
  nascar: "nascar",
  racing: "racing",
  "f1": "formula 1",
  formula: "formula 1",
  cricket: "cricket",
  ipl: "ipl",
  wnba: "wnba",
  stephon: "stephon",
  castle: "stephon castle",
  assists: "ast",
  assist: "ast",
  ast: "ast"
};

const SMART_TEAM_ALIASES = [
  { sport: "NBA", team: "New York Knicks", abbreviation: "NYK", aliases: ["knicks", "new york knicks", "nyk", "new york"] },
  { sport: "NBA", team: "San Antonio Spurs", abbreviation: "SAS", aliases: ["spurs", "san antonio spurs", "sas", "san antonio"] },
  { sport: "NBA", team: "Boston Celtics", abbreviation: "BOS", aliases: ["celtics", "boston celtics", "bos", "boston"] },
  { sport: "NBA", team: "Los Angeles Lakers", abbreviation: "LAL", aliases: ["lakers", "los angeles lakers", "lal", "los angeles"] },
  { sport: "NBA", team: "Oklahoma City Thunder", abbreviation: "OKC", aliases: ["thunder", "oklahoma city thunder", "okc", "oklahoma city"] },
  { sport: "NBA", team: "Cleveland Cavaliers", abbreviation: "CLE", aliases: ["cavaliers", "cavs", "cleveland cavaliers", "cle", "cleveland"] },
  { sport: "MLB", team: "Texas Rangers", abbreviation: "TEX", aliases: ["rangers", "texas rangers", "tex", "texas"] },
  { sport: "MLB", team: "St. Louis Cardinals", abbreviation: "STL", aliases: ["cardinals", "st. louis cardinals", "st louis cardinals", "stl", "st louis"] },
  { sport: "MLB", team: "New York Yankees", abbreviation: "NYY", aliases: ["yankees", "new york yankees", "nyy", "new york"] },
  { sport: "MLB", team: "New York Mets", abbreviation: "NYM", aliases: ["mets", "new york mets", "nym", "new york"] },
  { sport: "MLB", team: "Los Angeles Dodgers", abbreviation: "LAD", aliases: ["dodgers", "los angeles dodgers", "lad", "los angeles"] },
  { sport: "MLB", team: "Boston Red Sox", abbreviation: "BOS", aliases: ["red sox", "redsox", "boston red sox", "bos", "boston"] },
  { sport: "NFL", team: "Kansas City Chiefs", abbreviation: "KC", aliases: ["chiefs", "kansas city chiefs", "kc", "kansas city"] },
  { sport: "NFL", team: "San Francisco 49ers", abbreviation: "SF", aliases: ["49ers", "niners", "san francisco 49ers", "sf", "san francisco"] },
  { sport: "NFL", team: "Philadelphia Eagles", abbreviation: "PHI", aliases: ["eagles", "philadelphia eagles", "phi", "philadelphia"] },
  { sport: "NFL", team: "Dallas Cowboys", abbreviation: "DAL", aliases: ["cowboys", "dallas cowboys", "dal", "dallas"] },
  { sport: "NFL", team: "Buffalo Bills", abbreviation: "BUF", aliases: ["bills", "buffalo bills", "buf", "buffalo"] },
  { sport: "NFL", team: "Baltimore Ravens", abbreviation: "BAL", aliases: ["ravens", "baltimore ravens", "bal", "baltimore"] },
  { sport: "NHL", team: "New York Rangers", abbreviation: "NYR", aliases: ["rangers", "new york rangers", "nyr", "new york"] },
  { sport: "NHL", team: "Washington Capitals", abbreviation: "WSH", aliases: ["capitals", "caps", "washington capitals", "wsh", "washington"] },
  { sport: "NHL", team: "Edmonton Oilers", abbreviation: "EDM", aliases: ["oilers", "edmonton oilers", "edm", "edmonton"] },
  { sport: "NHL", team: "Florida Panthers", abbreviation: "FLA", aliases: ["panthers", "florida panthers", "fla", "florida"] }
].map((team) => ({
  ...team,
  normalizedAliases: Array.from(
    new Set([...team.aliases, team.team, team.abbreviation].map(normalizeSearchText))
  ).filter(Boolean)
}));

function expandSearchToken(token) {
  const alias = TEAM_SEARCH_ALIASES[token];
  const matchingTeamAliases = SMART_TEAM_ALIASES.filter((team) =>
    team.normalizedAliases.includes(token)
  ).flatMap((team) => team.normalizedAliases);

  return Array.from(new Set([token, ...(alias ? [alias] : []), ...matchingTeamAliases]));
}

function getExpandedSearchTokens(value) {
  return Array.from(new Set(getMeaningfulSearchTokens(value).flatMap(expandSearchToken)));
}

function detectTeamsForQuery(value) {
  const normalizedQuery = normalizeSearchText(value);
  const queryTokens = new Set(getMeaningfulSearchTokens(value));

  if (!normalizedQuery) {
    return [];
  }

  return SMART_TEAM_ALIASES.map((team) => {
    const matchedAliases = team.normalizedAliases.filter((alias) => {
      if (!alias) {
        return false;
      }

      const aliasTokens = alias.split(" ");
      const isShortCode = alias.length <= 3 && aliasTokens.length === 1;

      if (isShortCode) {
        return normalizedQuery === alias || queryTokens.has(alias);
      }

      return (
        normalizedQuery === alias ||
        normalizedQuery.includes(alias) ||
        aliasTokens.every((token) => queryTokens.has(token))
      );
    });

    return matchedAliases.length > 0
      ? {
          sport: team.sport,
          team: team.team,
          abbreviation: team.abbreviation,
          aliases: team.aliases,
          normalizedAliases: team.normalizedAliases,
          matchedAliases
        }
      : null;
  }).filter(Boolean);
}

function buildSearchQueryInfo(value, resultCount = 0) {
  const detectedTeams = detectTeamsForQuery(value);
  const expandedTerms = Array.from(
    new Set([
      normalizeSearchText(value),
      ...getExpandedSearchTokens(value),
      ...detectedTeams.flatMap((team) => team.normalizedAliases)
    ].filter(Boolean))
  ).slice(0, 30);

  return {
    originalQuery: String(value ?? ""),
    expandedTerms,
    detectedTeams: detectedTeams.map((team) => ({
      sport: team.sport,
      team: team.team,
      abbreviation: team.abbreviation,
      matchedAliases: team.matchedAliases
    })),
    detectedSports: Array.from(new Set(detectedTeams.map((team) => team.sport))),
    resultCount
  };
}

function getSearchTeamGroups(value) {
  const detectedTeams = detectTeamsForQuery(value);
  const groupsByMatchedAlias = new Map();

  for (const team of detectedTeams) {
    const strongestAlias =
      team.matchedAliases
        .slice()
        .sort((a, b) => b.length - a.length)[0] ?? team.team;

    const existing = groupsByMatchedAlias.get(strongestAlias) ?? [];
    existing.push(team);
    groupsByMatchedAlias.set(strongestAlias, existing);
  }

  return Array.from(groupsByMatchedAlias.values());
}

function getSearchPageBudget(filters = {}) {
  const expandedTokens = getExpandedSearchTokens(filters.search);

  if (
    expandedTokens.some((token) =>
      [
        "xmlb",
        "xnfl",
        "xnhl",
        "wnba",
        "ncaaf",
        "cfb",
        "ncaab",
        "ncaamb",
        "soccer",
        "world cup",
        "fifa",
        "mls",
        "epl",
        "uefa",
        "tennis",
        "golf",
        "mma",
        "ufc",
        "boxing",
        "nascar",
        "racing",
        "formula 1",
        "cricket",
        "ipl"
      ].includes(token)
    )
  ) {
    return 5;
  }

  return filters.search ? 3 : 1;
}

function getSearchSeriesTickers(filters = {}) {
  const search = String(filters.search ?? "");
  const expandedTokens = getExpandedSearchTokens(search);
  const normalizedSearch = normalizeSearchText(search);
  const selectedSport = normalizeFilterValue(filters.sport);
  const matchesSelectedSport = (definition) =>
    selectedSport &&
    (normalizeFilterValue(definition.key) === selectedSport ||
      normalizeFilterValue(definition.label) === selectedSport);
  const matchesSearch = (definition) =>
    definition.patterns.some((pattern) => {
      const normalizedPattern = normalizeSearchText(pattern);

      return (
        normalizedSearch.includes(normalizedPattern) ||
        expandedTokens.includes(normalizedPattern) ||
        expandedTokens.includes(normalizeFilterValue(pattern))
      );
    });

  return Array.from(
    new Set(
      SPORT_MARKET_DEFINITIONS.filter((definition) =>
        matchesSelectedSport(definition) || (normalizedSearch && matchesSearch(definition))
      ).flatMap((definition) => definition.seriesTickers)
    )
  );
}

function getSeriesDiscoveryTokens(value) {
  const expandedTokens = getExpandedSearchTokens(value);
  const sportsContextTokens = new Set(
    SPORT_MARKET_DEFINITIONS.flatMap((definition) =>
      definition.patterns.flatMap((pattern) => [
        normalizeSearchText(pattern),
        normalizeFilterValue(pattern)
      ])
    )
  );
  const matchingTokens = expandedTokens.filter((token) => sportsContextTokens.has(token));

  return matchingTokens.length > 0 ? matchingTokens : getMeaningfulSearchTokens(value);
}

function eventMatchesSearch(event, filters = {}) {
  const searchTokens = getMeaningfulSearchTokens(filters.search);

  if (searchTokens.length === 0) {
    return true;
  }

  const eventHaystack = eventSearchHaystack(event);
  const marketHaystacks = Array.isArray(event?.markets)
    ? event.markets.map((market) => marketSearchHaystack(market))
    : [];

  return searchMatchesAnyContext(searchTokens, [eventHaystack, ...marketHaystacks]);
}

function marketMatchesSearchWithEventContext(market, rawMarket, rawEvent, filters = {}) {
  const searchTokens = getMeaningfulSearchTokens(filters.search);

  if (searchTokens.length === 0) {
    return true;
  }

  return searchMatchesAnyContext(searchTokens, [
    marketSearchHaystack(market),
    marketSearchHaystack(rawMarket),
    eventSearchHaystack(rawEvent)
  ]);
}

function marketSearchHaystack(market) {
  return [
    market.title,
    market.ticker,
    market.subtitle,
    market.eventTitle,
    market.eventTicker,
    market.sport,
    market.competition,
    market.scope,
    market.custom_strike?.["Associated Events"],
    market.custom_strike?.["Associated Markets"],
    market.custom_strike?.["Associated Market Sides"],
    ...(Array.isArray(market.mve_selected_legs)
      ? market.mve_selected_legs.flatMap((leg) => [leg.event_ticker, leg.market_ticker, leg.side])
      : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function eventSearchHaystack(event) {
  return [
    event?.title,
    event?.sub_title,
    event?.event_ticker,
    event?.series_ticker,
    event?.category,
    event?.competition,
    event?.competition_scope,
    event?.product_metadata?.competition,
    event?.product_metadata?.league,
    event?.product_metadata?.sport,
    ...(Array.isArray(event?.tags) ? event.tags : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function seriesSearchHaystack(series) {
  return [
    series?.ticker,
    series?.title,
    series?.category,
    series?.product_metadata?.competition,
    series?.product_metadata?.league,
    series?.product_metadata?.sport,
    ...(Array.isArray(series?.tags) ? series.tags : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function termMatchesHaystack(term, normalizedHaystack, rawHaystack) {
  const normalizedTerm = normalizeSearchText(term);
  const compactTerm = normalizedTerm.replace(/\s+/g, "");
  const compactHaystack = normalizedHaystack.replace(/\s+/g, "");
  const normalizedTokens = normalizedHaystack.split(/\s+/).filter(Boolean);
  const rawText = String(rawHaystack ?? "");

  if (!normalizedTerm) {
    return false;
  }

  if (compactTerm.length <= 3) {
    const upperTerm = compactTerm.toUpperCase();
    const tickerSegmentPattern = new RegExp(`(^|[-\\s])(?:\\d{2})?${upperTerm}($|[-\\s])`);

    return normalizedTokens.includes(normalizedTerm) || tickerSegmentPattern.test(rawText.toUpperCase());
  }

  return (
    normalizedHaystack.includes(normalizedTerm) ||
      rawHaystack.includes(normalizedTerm) ||
      (compactTerm.length >= 4 && compactHaystack.includes(compactTerm))
  );
}

function searchTokensMatchHaystack(searchTokens, haystack) {
  if (searchTokens.length === 0) {
    return false;
  }

  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedQuery = searchTokens.join(" ");
  const teamGroups = getSearchTeamGroups(normalizedQuery);

  if (teamGroups.length > 0) {
    return teamGroups.every((group) =>
      group.some((team) =>
        team.normalizedAliases.some((alias) =>
          termMatchesHaystack(alias, normalizedHaystack, haystack)
        )
      )
    );
  }

  return searchTokens.every((token) =>
    expandSearchToken(token).some(
      (candidate) => termMatchesHaystack(candidate, normalizedHaystack, haystack)
    )
  );
}

function searchMatchesAnyContext(searchTokens, haystacks) {
  if (searchTokens.length === 0) {
    return false;
  }

  const combinedHaystack = haystacks.filter(Boolean).join(" ");

  if (searchTokensMatchHaystack(searchTokens, combinedHaystack)) {
    return true;
  }

  return searchTokens.every((token) =>
    haystacks.some((haystack) =>
      expandSearchToken(token).some((candidate) =>
        termMatchesHaystack(candidate, normalizeSearchText(haystack), haystack)
      )
    )
  );
}

function extractAssociatedMarketTickers(rawMarket) {
  const fromCustomStrike = String(rawMarket?.custom_strike?.["Associated Markets"] ?? "")
    .split(",")
    .map((ticker) => ticker.trim())
    .filter(Boolean);
  const fromSelectedLegs = Array.isArray(rawMarket?.mve_selected_legs)
    ? rawMarket.mve_selected_legs
        .map((leg) => leg.market_ticker)
        .filter((ticker) => typeof ticker === "string" && ticker.trim())
    : [];

  return Array.from(new Set([...fromCustomStrike, ...fromSelectedLegs]));
}

function isLikelyComboMarket(rawMarket) {
  const ticker = String(rawMarket?.ticker ?? "").toUpperCase();
  const eventTicker = String(rawMarket?.event_ticker ?? rawMarket?.eventTicker ?? "").toUpperCase();
  const title = String(rawMarket?.title ?? rawMarket?.market_title ?? rawMarket?.yes_sub_title ?? "");

  return (
    ticker.includes("MVE") ||
    eventTicker.includes("MVE") ||
    Array.isArray(rawMarket?.mve_selected_legs) ||
    /combo|parlay|same game|same-game|multi[- ]?leg|all of these|each of these/i.test(title)
  );
}

function isLikelySingleOutcomeMarket(rawMarket) {
  const ticker = String(rawMarket?.ticker ?? "").toUpperCase();
  const title = String(rawMarket?.title ?? rawMarket?.market_title ?? rawMarket?.yes_sub_title ?? "");

  return (
    !isLikelyComboMarket(rawMarket) &&
    (isDirectSportsLineTicker(ticker) ||
      /who will win|winner|win the match|win the game|beat|defeat|moneyline|match winner|game winner|qualify|advance|reach the|make the/i.test(title))
  );
}

function normalizeEventMarket(rawMarket, rawEvent, position = null) {
  return normalizeTrackedMarket(
    {
      ...rawMarket,
      event_ticker: rawMarket?.event_ticker ?? rawEvent?.event_ticker,
      event_title: rawMarket?.event_title ?? rawEvent?.title,
      series_ticker: rawMarket?.series_ticker ?? rawEvent?.series_ticker,
      category: rawMarket?.category ?? rawEvent?.category,
      title:
        rawMarket?.title ??
        rawMarket?.market_title ??
        rawMarket?.yes_sub_title ??
        rawEvent?.title ??
        rawMarket?.ticker,
      subtitle: rawMarket?.subtitle ?? rawMarket?.yes_sub_title ?? rawEvent?.sub_title,
      sport: rawMarket?.sport ?? rawEvent?.product_metadata?.sport ?? null,
      competition:
        rawMarket?.competition ??
        rawEvent?.competition ??
        rawEvent?.product_metadata?.competition ??
        rawEvent?.product_metadata?.league ??
        null,
      scope: rawMarket?.scope ?? rawEvent?.competition_scope ?? null
    },
    position
  );
}

function isSportsTicker(ticker) {
  const normalizedTicker = String(ticker ?? "").toUpperCase();

  return SPORT_TICKER_PREFIXES.some((prefix) => normalizedTicker.startsWith(`KX${prefix}`));
}

function isDirectSportsLineTicker(ticker) {
  const normalizedTicker = String(ticker ?? "").toUpperCase();

  if (!isSportsTicker(normalizedTicker)) {
    return false;
  }

  const withoutKalshiPrefix = normalizedTicker.replace(/^KX/, "");

  return SPORT_TICKER_PREFIXES.some((sportPrefix) => {
    if (!withoutKalshiPrefix.startsWith(sportPrefix)) {
      return false;
    }

    const rest = withoutKalshiPrefix.slice(sportPrefix.length);

    return DIRECT_SPORTS_LINE_TYPES.some((lineType) => rest.startsWith(lineType));
  });
}

function marketSortScore(market, filters = {}) {
  const ticker = String(market.ticker ?? "");
  const title = String(market.title ?? "");
  const haystack = marketSearchHaystack(market);
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedTitle = normalizeSearchText(title);
  const detectedTeams = detectTeamsForQuery(filters.search);
  const teamGroups = getSearchTeamGroups(filters.search);
  let score = 0;

  if (isDirectSportsLineTicker(ticker) && /GAME|MATCH|WIN|WINNER/i.test(ticker)) score += 80;
  if (isDirectSportsLineTicker(ticker)) score += 70;
  if (isSportsTicker(ticker)) score += 25;
  if (isLikelySingleOutcomeMarket(market)) score += 90;
  if (isLikelyComboMarket(market)) score -= 140;
  if (/get.?in price|ticket|tickets|attendance/i.test(title)) score -= 80;

  if (filters.search) {
    const normalizedQuery = normalizeSearchText(filters.search);

    if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) {
      score += 100;
    }

    if (searchTokensMatchHaystack(getMeaningfulSearchTokens(filters.search), haystack)) {
      score += 35;
    }

    for (const team of detectedTeams) {
      const teamMatchedInTitle = team.normalizedAliases.some((alias) =>
        termMatchesHaystack(alias, normalizedTitle, title.toLowerCase())
      );
      const teamMatchedInTicker = [team.abbreviation.toLowerCase(), ...team.normalizedAliases].some((alias) =>
        termMatchesHaystack(alias, normalizeSearchText(ticker), ticker.toLowerCase())
      );

      if (teamMatchedInTitle) score += 45;
      if (teamMatchedInTicker) score += 30;
      if (normalizeFilterValue(market.competition) === normalizeFilterValue(team.sport)) score += 15;
      if (normalizeFilterValue(market.sport) === normalizeFilterValue(team.sport)) score += 15;
    }

    const matchedGroupCount = teamGroups.filter((group) =>
      group.some((team) =>
        team.normalizedAliases.some((alias) => termMatchesHaystack(alias, normalizedHaystack, haystack))
      )
    ).length;

    if (teamGroups.length >= 2 && matchedGroupCount >= 2) {
      score += 120;
    }
  }

  if (market.isActive || market.lifecycleStatus === "open") {
    score += 20;
  }

  if (market.isResolved || ["settled", "finalized", "closed"].includes(market.lifecycleStatus)) {
    score -= 40;
  }

  if (typeof market.volume === "number" && market.volume > 0) {
    score += Math.min(25, Math.log10(market.volume + 1) * 8);
  }

  if (market.closeTime) {
    const closeTime = new Date(market.closeTime).getTime();

    if (Number.isFinite(closeTime)) {
      score += closeTime >= Date.now() ? 10 : -10;
    }
  }

  return score;
}

function includesAny(haystack, patterns) {
  return patterns.some((pattern) => haystack.includes(pattern));
}

function titleCase(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part))
    .join(" ");
}

function deriveSportsMarketMetadata(rawMarket) {
  const text = [
    rawMarket.sport,
    rawMarket.competition,
    rawMarket.category,
    rawMarket.series_ticker,
    rawMarket.event_ticker,
    rawMarket.ticker,
    rawMarket.event_title,
    rawMarket.title,
    rawMarket.subtitle,
    rawMarket.yes_sub_title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const directSport = typeof rawMarket.sport === "string" ? rawMarket.sport.trim() : "";
  const directCategory = typeof rawMarket.category === "string" ? rawMarket.category.trim() : "";
  const matchedSport =
    SPORTS_MARKET_HINTS.map((sport) => {
      const strongestPattern = sport.patterns
        .filter((pattern) => text.includes(pattern))
        .sort((a, b) => b.length - a.length)[0];

      return strongestPattern ? { ...sport, score: strongestPattern.length } : null;
    })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)[0] ?? null;
  const parsed = parseKalshiMarketTitle(
    rawMarket.title ?? rawMarket.market_title ?? rawMarket.subtitle ?? ""
  );
  const fallbackCategory = directCategory || "Other";
  const fallbackSport =
    matchedSport?.label ??
    (isSportsTicker(rawMarket.ticker) ? "Sports" : fallbackCategory);
  const fallbackCompetition = matchedSport?.label ?? fallbackCategory;

  return {
    sport: directSport || fallbackSport,
    competition:
      typeof rawMarket.competition === "string" && rawMarket.competition.trim()
        ? rawMarket.competition.trim()
        : fallbackCompetition,
    scope:
      typeof rawMarket.scope === "string" && rawMarket.scope.trim()
        ? rawMarket.scope.trim()
        : parsed.marketType === "player"
          ? "player"
          : parsed.marketType === "team"
            ? "team"
            : "market"
  };
}

function marketMatchesFilter(market, filters = {}) {
  const sport = normalizeFilterValue(filters.sport);
  const competition = normalizeFilterValue(filters.competition);
  const scope = normalizeFilterValue(filters.scope);
  const searchTokens = getMeaningfulSearchTokens(filters.search);
  const matchingSportDefinition = SPORT_MARKET_DEFINITIONS.find((definition) => {
    const filterMatchesDefinition =
      sport &&
      (normalizeFilterValue(definition.key) === sport ||
        normalizeFilterValue(definition.label) === sport);

    if (!filterMatchesDefinition) {
      return false;
    }

    return (
      normalizeFilterValue(market.sport) === normalizeFilterValue(definition.label) ||
      normalizeFilterValue(market.competition) === normalizeFilterValue(definition.label) ||
      definition.patterns.some((pattern) =>
        marketSearchHaystack(market).includes(pattern.toLowerCase())
      ) ||
      definition.tickerPrefixes.some((prefix) =>
        String(market.ticker ?? "").toUpperCase().startsWith(`KX${prefix}`)
      )
    );
  });

  if (sport && normalizeFilterValue(market.sport) !== sport && !matchingSportDefinition) {
    return false;
  }

  if (competition && normalizeFilterValue(market.competition) !== competition) {
    return false;
  }

  if (scope && normalizeFilterValue(market.scope) !== scope) {
    return false;
  }

  if (String(filters.search ?? "").trim()) {
    return searchTokensMatchHaystack(searchTokens, marketSearchHaystack(market));
  }

  return true;
}

function normalizeOrderbookLevel(level) {
  if (!Array.isArray(level) || level.length < 2) {
    return null;
  }

  const priceCents = dollarsStringToCents(level[0]);

  if (typeof priceCents !== "number") {
    return null;
  }

  return {
    priceCents,
    count: String(level[1] ?? "0")
  };
}

function normalizeTeamToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function extractTeamsFromMarketTitle(title) {
  const match = String(title ?? "")
    .trim()
    .replace(/\?$/, "")
    .match(/^will\s+the\s+(.+?)\s+beat\s+the\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return [match[1].trim(), match[2].trim()];
}

function gameMatchesMarketTitle(game, title) {
  const teams = extractTeamsFromMarketTitle(title);

  if (!teams) {
    return false;
  }

  const gameTeams = [game.homeTeam?.name, game.awayTeam?.name].map(normalizeTeamToken);
  const marketTeams = teams.map(normalizeTeamToken);

  return marketTeams.every((team) => gameTeams.includes(team));
}

function normalizeSide(value) {
  const normalized = String(value ?? "YES").trim().toUpperCase();
  return normalized === "NO" ? "NO" : "YES";
}

function numberOrFallback(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePortfolioPosition(position) {
  const side = normalizeSide(position.side ?? position.position_side);
  const contracts = numberOrFallback(
    position.position_contracts ?? position.contract_count ?? position.contracts,
    0
  );
  const entryPriceCents = numberOrFallback(
    position.entry_price_cents ??
      position.average_price_cents ??
      dollarsStringToCents(position.average_price_dollars),
    50
  );
  const currentPriceCents =
    typeof position.current_price_cents === "number"
      ? position.current_price_cents
      : dollarsStringToCents(position.current_price_dollars);
  const currentValueCents =
    typeof position.current_value_cents === "number"
      ? position.current_value_cents
      : typeof currentPriceCents === "number"
        ? currentPriceCents * contracts
        : null;
  const costBasisCents =
    typeof position.cost_basis_cents === "number"
      ? position.cost_basis_cents
      : entryPriceCents * contracts;
  const unrealizedPnLCents =
    typeof position.unrealized_pnl_cents === "number"
      ? position.unrealized_pnl_cents
      : typeof currentValueCents === "number"
        ? currentValueCents - costBasisCents
        : null;

  return {
    ticker: position.ticker,
    title: position.market_title ?? position.title ?? position.ticker,
    side,
    contracts,
    entryPriceCents,
    currentPriceCents,
    currentValueCents,
    costBasisCents,
    unrealizedPnLCents,
    updatedAt: position.updated_at ?? position.updatedAt ?? getNowIso()
  };
}

function isClosedMarketStatus(status) {
  return isResolvedLifecycle(normalizeLifecycleStatus(status));
}

function getMarketDataStatus(market, fetchedAt = getNowIso()) {
  if (!market) {
    return "unavailable";
  }

  if (market.isResolved || isClosedMarketStatus(market.status)) {
    return market.lifecycleStatus === "settled" ? "settled" : "finalized";
  }

  const hasTradablePrice =
    typeof market.yesBidCents === "number" ||
    typeof market.yesAskCents === "number" ||
    typeof market.noBidCents === "number" ||
    typeof market.noAskCents === "number" ||
    typeof market.lastPriceCents === "number";

  return hasTradablePrice ? "live" : "unavailable";
}

function buildUnavailableMarket(ticker, reason, timestamp = getNowIso()) {
  return {
    ticker,
    eventTicker: null,
    title: ticker,
    subtitle: null,
    sport: null,
    competition: null,
    scope: null,
    eventTitle: null,
    status: "unavailable",
    yesBidCents: null,
    yesAskCents: null,
    noBidCents: null,
    noAskCents: null,
    lastPriceCents: null,
    previousPriceCents: null,
    volume: null,
    openInterest: null,
    liquidityCents: null,
    closeTime: null,
    updatedAt: timestamp,
    position: null,
    liveContext: unavailableLiveContext("Market data unavailable"),
    dataQuality: {
      marketDataStatus: "unavailable",
      positionStatus: "unavailable",
      liveContextStatus: "unavailable",
      lastUpdated: timestamp,
      message: reason
    }
  };
}

function attachPerMarketQuality(market, position, liveContext, positionsAvailable, timestamp) {
  const marketDataStatus = getMarketDataStatus(market, timestamp);
  const positionStatus = positionsAvailable
    ? position && position.contracts > 0
      ? "matched"
      : "none"
    : "unavailable";

  return {
    ...market,
    position,
    liveContext,
    dataQuality: {
      marketDataStatus,
      positionStatus,
      liveContextStatus: liveContext.available ? "available" : "unavailable",
      lastUpdated: timestamp,
      ...(market.isResolved || isClosedMarketStatus(market.status)
        ? { message: `Market is ${market.lifecycleStatus ?? market.status}` }
        : {})
    }
  };
}

class KalshiService {
  getMode() {
    return kalshiClient.getMode();
  }

  getEnvironment() {
    return kalshiClient.getEnvironment();
  }

  getPublicEnvironment() {
    return kalshiClient.getPublicEnvironment();
  }

  getAuthHealth() {
    const configured = kalshiClient.isConfiguredForRealMode();

    return {
      mode: configured ? "real" : "mock",
      environment: this.getEnvironment(),
      publicEnvironment: this.getPublicEnvironment(),
      configured,
      hasApiKeyId: kalshiClient.hasApiKeyId(),
      hasPrivateKeyPath: kalshiClient.hasPrivateKeyPath(),
      readOnly: true,
      message: configured
        ? "Kalshi read-only account data is available."
        : "Kalshi credentials are not configured; account positions use mock or unavailable data."
    };
  }

  async getBalance() {
    if (!kalshiClient.isConfiguredForRealMode()) {
      return {
        mode: "mock",
        environment: this.getEnvironment(),
        balanceCents: 100000,
        availableBalanceCents: 100000,
        pendingBalanceCents: 0,
        currency: "USD",
        updatedAt: getNowIso()
      };
    }

    const response = await kalshiClient.getBalance();

    return {
      mode: "real",
      environment: this.getEnvironment(),
      balance: response
    };
  }

  async getPositions() {
    if (!kalshiClient.isConfiguredForRealMode()) {
      const positions = getMockPortfolioPositions().map(normalizePortfolioPosition);

      return {
        mode: "mock",
        environment: this.getEnvironment(),
        updatedAt: getNowIso(),
        positions
      };
    }

    const response = await kalshiClient.getPositions();
    const positions = (response.market_positions ?? []).map(normalizePortfolioPosition);

    return {
      mode: "real",
      environment: this.getEnvironment(),
      updatedAt: getNowIso(),
      positions,
      raw: response
    };
  }

  async getMarket(ticker) {
    if (!kalshiClient.isConfiguredForRealMode()) {
      const market = getMockMarkets().find((entry) => entry.ticker === ticker) ?? null;

      return {
        mode: "mock",
        environment: this.getEnvironment(),
        market: normalizeKalshiMarket(market)
      };
    }

    const response = await kalshiClient.getMarket(ticker);

    return {
      mode: "real",
      environment: this.getEnvironment(),
      market: normalizeKalshiMarket(response.market ?? null),
      raw: response
    };
  }

  async getMarkets(query = {}) {
    if (!kalshiClient.isConfiguredForRealMode()) {
      return {
        mode: "mock",
        environment: this.getEnvironment(),
        markets: getMockMarkets()
      };
    }

    const response = await kalshiClient.getMarkets(query);

    return {
      mode: "real",
      environment: this.getEnvironment(),
      markets: response.markets ?? [],
      cursor: response.cursor ?? null,
      raw: response
    };
  }

  async getPublicMarkets(query = {}) {
    const response = await kalshiClient.getPublicMarkets(query);
    const positionsByTicker = await this.getPositionsByTickerSafe();
    const markets = (response.markets ?? [])
      .map((market) => normalizeTrackedMarket(market, positionsByTicker.get(market.ticker) ?? null))
      .filter(Boolean);

    researchModelService.recordMarketSnapshots(markets);

    return {
      mode: "real",
      environment: this.getPublicEnvironment(),
      markets,
      cursor: response.cursor ?? null,
      raw: response
    };
  }

  async getPublicEvents(query = {}) {
    const response = await kalshiClient.getPublicEvents(query);
    const positionsByTicker = await this.getPositionsByTickerSafe();
    const markets = [];

    for (const event of response.events ?? []) {
      for (const market of event.markets ?? []) {
        markets.push(normalizeEventMarket(market, event, positionsByTicker.get(market.ticker) ?? null));
      }
    }

    return {
      mode: "real",
      environment: this.getPublicEnvironment(),
      events: response.events ?? [],
      markets: markets.filter(Boolean),
      cursor: response.cursor ?? null,
      raw: response
    };
  }

  async getPublicSeries(query = {}) {
    const response = await kalshiClient.getPublicSeries(query);

    return {
      mode: "real",
      environment: this.getPublicEnvironment(),
      series: response.series ?? [],
      cursor: response.cursor ?? null,
      raw: response
    };
  }

  async getSportsFilters(query = {}) {
    const response = await this.getPublicMarkets({
      limit: query.limit ?? 100,
      status: query.status ?? "open"
    });
    const sports = new Map(
      SPORT_MARKET_DEFINITIONS.map((sport) => [
        sport.key,
        {
          sportKey: sport.key,
          sportName: sport.label,
          competitions: new Set([sport.label]),
          scopes: new Set()
        }
      ])
    );

    for (const market of response.markets) {
      const sportKey = normalizeFilterValue(market.sport);

      if (!sportKey) {
        continue;
      }

      const existing =
        sports.get(sportKey) ??
        {
          sportKey,
          sportName: titleCase(market.sport),
          competitions: new Set(),
          scopes: new Set()
        };

      if (market.competition) {
        existing.competitions.add(market.competition);
      }

      if (market.scope) {
        existing.scopes.add(market.scope);
      }

      sports.set(sportKey, existing);
    }

    return {
      source: "kalshi",
      sports: Array.from(sports.values())
        .map((sport) => ({
          sportKey: sport.sportKey,
          sportName: sport.sportName,
          competitions: Array.from(sport.competitions).sort((a, b) => a.localeCompare(b)),
          scopes: Array.from(sport.scopes).sort((a, b) => a.localeCompare(b))
        }))
        .sort((a, b) => a.sportName.localeCompare(b.sportName))
    };
  }

  async getSportsMarkets(filters = {}) {
    const limit = Number.isFinite(Number(filters.limit))
      ? Math.max(1, Math.min(100, Math.round(Number(filters.limit))))
      : 30;
    const cacheKey = filters.search
      ? JSON.stringify({
          type: "sports-markets",
          search: normalizeSearchText(filters.search),
          status: filters.status ?? "",
          sport: filters.sport ?? "",
          competition: filters.competition ?? "",
          scope: filters.scope ?? "",
          limit
        })
      : "";
    const cached = cacheKey ? getCachedValue(cacheKey) : null;

    if (cached) {
      return cached;
    }

    const pageLimit = filters.search ? 100 : limit;
    const collectedMarkets = [];
    const associatedTickers = new Set();
    const seenTickers = new Set();
    let cursor = filters.cursor;
    let response = null;
    const maxPages = getSearchPageBudget(filters);
    const addMarkets = (markets = []) => {
      for (const market of markets) {
        if (!market?.ticker || seenTickers.has(market.ticker)) {
          continue;
        }

        seenTickers.add(market.ticker);
        collectedMarkets.push(market);
      }
    };

    const guessedSeriesTickers = getSearchSeriesTickers(filters);
    const discoveredSeriesTickers = [];

    if (filters.search) {
      try {
        const seriesResponse = await this.getPublicSeries({
          status: filters.status ?? "open"
        });
        const searchTokens = getSeriesDiscoveryTokens(filters.search);
        const matchingSeriesTickers = seriesResponse.series
          .filter((series) =>
            searchMatchesAnyContext(searchTokens, [seriesSearchHaystack(series)])
          )
          .map((series) => series.ticker)
          .filter(Boolean)
          .slice(0, 8);

        for (const ticker of matchingSeriesTickers) {
          discoveredSeriesTickers.push(ticker);
        }
      } catch {
        // Series discovery is a search enhancement; generic event/market search still runs.
      }
    }

    const seriesTickers = Array.from(
      new Set([
        ...discoveredSeriesTickers,
        ...guessedSeriesTickers.filter((ticker) => discoveredSeriesTickers.length === 0 || ticker === "KXWC")
      ])
    ).slice(0, filters.search ? 10 : 10);

    for (const eventQuery of [
      {
        limit: pageLimit,
        with_nested_markets: true,
        ...(filters.status ? { status: filters.status } : {})
      },
      ...Array.from(new Set(seriesTickers)).map((seriesTicker) => ({
        series_ticker: seriesTicker,
        limit: pageLimit,
        with_nested_markets: true,
        ...(filters.status ? { status: filters.status } : {})
      }))
    ]) {
      try {
        const eventResponse = await this.getPublicEvents(eventQuery);
        const rawEvents = eventResponse.raw?.events ?? [];

        for (const rawEvent of rawEvents) {
          if (!eventMatchesSearch(rawEvent, filters)) {
            continue;
          }

          for (const rawMarket of rawEvent.markets ?? []) {
            const normalizedMarket = normalizeEventMarket(rawMarket, rawEvent);

            if (!normalizedMarket || !marketMatchesSearchWithEventContext(normalizedMarket, rawMarket, rawEvent, filters)) {
              continue;
            }

            addMarkets([normalizedMarket]);
          }
        }

        response = response ?? eventResponse;

        if (collectedMarkets.filter((market) => marketMatchesFilter(market, filters)).length >= limit) {
          break;
        }
      } catch {
        // Keep searching other Kalshi endpoints when a guessed series/event query is unsupported.
      }
    }

    for (const seriesTicker of seriesTickers) {
      if (collectedMarkets.filter((market) => marketMatchesFilter(market, filters)).length >= limit) {
        break;
      }

      try {
        const seriesResponse = await this.getPublicMarkets({
          series_ticker: seriesTicker,
          limit: pageLimit,
          ...(filters.status ? { status: filters.status } : {})
        });

        addMarkets(seriesResponse.markets);
        response = response ?? seriesResponse;
      } catch {
        // Some Kalshi sports use event/ticker naming that is not exposed as a series filter.
      }
    }

    const shouldScanGenericMarketPages =
      !filters.search || collectedMarkets.filter((market) => marketMatchesFilter(market, filters)).length < limit;

    for (let page = 0; shouldScanGenericMarketPages && page < maxPages; page += 1) {
      try {
        response = await this.getPublicMarkets({
          limit: pageLimit,
          cursor,
          ...(filters.status ? { status: filters.status } : {})
        });
      } catch (error) {
        if (collectedMarkets.some((market) => marketMatchesFilter(market, filters))) {
          break;
        }

        throw error;
      }

      addMarkets(response.markets);

      if (filters.search && response.raw?.markets) {
        const searchTokens = getSearchTokens(filters.search);

        for (const rawMarket of response.raw.markets) {
          if (!searchTokensMatchHaystack(searchTokens, marketSearchHaystack(rawMarket))) {
            continue;
          }

          for (const ticker of extractAssociatedMarketTickers(rawMarket)) {
            if (isDirectSportsLineTicker(ticker)) {
              associatedTickers.add(ticker);
            }
          }
        }
      }

      if (collectedMarkets.filter((market) => marketMatchesFilter(market, filters)).length >= limit) {
        break;
      }

      if (!response.cursor) {
        break;
      }

      cursor = response.cursor;
    }

    if (associatedTickers.size > 0) {
      try {
        const associatedResponse = await this.getPublicMarkets({
          tickers: Array.from(associatedTickers).slice(0, 100).join(","),
          limit: Math.min(100, associatedTickers.size)
        });

        addMarkets(associatedResponse.markets);
      } catch {
        // Keep the original market search results if associated lookup is unavailable.
      }
    }

    const markets = collectedMarkets
      .filter((market) => marketMatchesFilter(market, filters))
      .sort((a, b) => marketSortScore(b, filters) - marketSortScore(a, filters))
      .filter((market, index, allMarkets) => allMarkets.findIndex((entry) => entry.ticker === market.ticker) === index)
      .slice(0, limit);
    researchModelService.recordMarketSnapshots(markets);
    const queryInfo = buildSearchQueryInfo(filters.search, markets.length);

    const result = {
      ...(response ?? {
        mode: "real",
        environment: this.getPublicEnvironment(),
        cursor: null
      }),
      markets,
      queryInfo
    };

    if (cacheKey) {
      setCachedValue(cacheKey, result);
    }

    return result;
  }

  async getFreshPublicMarketsByTicker(tickers = []) {
    const uniqueTickers = Array.from(new Set(tickers.filter(Boolean)));

    if (uniqueTickers.length === 0) {
      return [];
    }

    try {
      const response = await this.getPublicMarkets({
        tickers: uniqueTickers.join(","),
        limit: Math.min(100, uniqueTickers.length)
      });

      return response.markets;
    } catch {
      const markets = await Promise.all(
        uniqueTickers.map(async (ticker) => {
          try {
            const response = await this.getPublicMarket(ticker);
            return response.market ?? null;
          } catch {
            return null;
          }
        })
      );

      return markets.filter(Boolean);
    }
  }

  async getPublicMarket(ticker) {
    const response = await kalshiClient.getPublicMarket(ticker);
    const positionsByTicker = await this.getPositionsByTickerSafe();

    return {
      mode: "real",
      environment: this.getPublicEnvironment(),
      market: normalizeTrackedMarket(
        response.market ?? null,
        positionsByTicker.get(ticker) ?? null
      ),
      raw: response
    };
  }

  async getPublicOrderbook(ticker, query = {}) {
    const response = await kalshiClient.getPublicOrderbook(ticker, query);
    const orderbook = response.orderbook_fp ?? {};

    return {
      mode: "real",
      environment: this.getPublicEnvironment(),
      orderbook: {
        ticker,
        yes: Array.isArray(orderbook.yes_dollars)
          ? orderbook.yes_dollars.map(normalizeOrderbookLevel).filter(Boolean)
          : [],
        no: Array.isArray(orderbook.no_dollars)
          ? orderbook.no_dollars.map(normalizeOrderbookLevel).filter(Boolean)
          : []
      },
      raw: response
    };
  }

  async getPositionsByTickerSafe() {
    if (!kalshiClient.isConfiguredForRealMode()) {
      return new Map();
    }

    try {
      const response = await kalshiClient.getPositions();
      const positions = Array.isArray(response.market_positions) ? response.market_positions : [];

      return new Map(
        positions.map((position) => [
          position.ticker,
          {
            side: normalizeSide(position.side ?? position.position_side),
            contracts: numberOrFallback(
              position.position_contracts ?? position.contract_count ?? position.contracts,
              0
            ),
            entryPriceCents: numberOrFallback(
              position.entry_price_cents ??
                position.average_price_cents ??
                dollarsStringToCents(position.average_price_dollars),
              50
            ),
            currentPriceCents:
              typeof position.current_price_cents === "number"
                ? position.current_price_cents
                : dollarsStringToCents(position.current_price_dollars),
            currentValueCents:
              typeof position.current_value_cents === "number"
                ? position.current_value_cents
                : null,
            costBasisCents:
              typeof position.cost_basis_cents === "number" ? position.cost_basis_cents : null,
            unrealizedPnLCents:
              typeof position.unrealized_pnl_cents === "number"
                ? position.unrealized_pnl_cents
                : null
          }
        ])
      );
    } catch {
      return new Map();
    }
  }

  async getLiveContextForWatchedMarket(watchedMarket) {
    if (!watchedMarket) {
      return unavailableLiveContext("Market data unavailable");
    }

    const cacheKey = watchedMarket.eventTicker || watchedMarket.ticker;
    const cached = getCachedLiveContext(cacheKey);

    if (cached) {
      return cached;
    }

    const embeddedContext = normalizeLiveContextFromPayload(watchedMarket, watchedMarket);

    if (embeddedContext) {
      setCachedLiveContext(cacheKey, embeddedContext);
      return embeddedContext;
    }

    if (!watchedMarket.eventTicker) {
      const unavailable = unavailableLiveContext("No Kalshi event ticker was available for this market", watchedMarket);
      setCachedLiveContext(cacheKey, unavailable);
      return unavailable;
    }

    try {
      const liveDataResponse = await kalshiClient.getPublicEventLiveData(watchedMarket.eventTicker);
      const liveContext = normalizeLiveContextFromPayload(liveDataResponse, watchedMarket);

      if (liveContext) {
        setCachedLiveContext(cacheKey, liveContext);
        return liveContext;
      }
    } catch {
      // Many Kalshi events do not expose public live_data; keep market odds as primary.
    }

    try {
      const eventResponse = await kalshiClient.getPublicEvent(watchedMarket.eventTicker);
      const liveContext = normalizeLiveContextFromPayload(eventResponse, watchedMarket);

      if (liveContext) {
        setCachedLiveContext(cacheKey, liveContext);
        return liveContext;
      }
    } catch {
      const unavailable = unavailableLiveContext("Kalshi event live data was unavailable", watchedMarket);
      setCachedLiveContext(cacheKey, unavailable);
      return unavailable;
    }

    const unavailable = unavailableLiveContext("Kalshi did not return live score context for this market", watchedMarket);
    setCachedLiveContext(cacheKey, unavailable);
    return unavailable;
  }

  async getOverlayState(query = {}) {
    const tickers = Array.isArray(query.tickers)
      ? query.tickers.filter(Boolean)
      : String(query.tickers ?? "")
          .split(",")
          .map((ticker) => ticker.trim())
          .filter(Boolean);
    const updatedAt = getNowIso();
    let watchedMarkets = [];
    let marketDataStatus = "unavailable";
    let marketMessage = "";

    try {
      if (tickers.length > 0) {
        const requestedTickers = new Set(tickers);
        watchedMarkets = (await this.getFreshPublicMarketsByTicker(tickers)).filter((market) =>
          requestedTickers.has(market.ticker)
        );
        marketDataStatus = watchedMarkets.length > 0 ? "live" : "unavailable";
      } else {
        marketDataStatus = "live";
      }
    } catch (error) {
      marketMessage =
        error instanceof Error ? error.message : "Market data unavailable from Kalshi.";
    }

    let positions = [];
    let positionsStatus = "unavailable";

    if (kalshiClient.isConfiguredForRealMode()) {
      try {
        const positionsResponse = await this.getPositions();
        positions = positionsResponse.positions ?? [];
        positionsStatus = "available";
      } catch {
        positions = [];
        positionsStatus = "unavailable";
      }
    }

    const positionsByTicker = new Map(positions.map((position) => [position.ticker, position]));
    const watchedMarketsWithPositions = await Promise.all(
      tickers.map(async (ticker) => {
        const market = watchedMarkets.find((entry) => entry.ticker === ticker);

        if (!market) {
          return buildUnavailableMarket(
            ticker,
            marketMessage || "Kalshi did not return this watched ticker",
            updatedAt
          );
        }

        const position = positionsByTicker.get(market.ticker) ?? market.position ?? null;
        const liveContext = await this.getLiveContextForWatchedMarket(market);

        return attachPerMarketQuality(
          market,
          position,
          liveContext,
          positionsStatus === "available",
          updatedAt
        );
      })
    );
    const aggregateMarketStatus = watchedMarketsWithPositions.some(
      (market) => market.dataQuality?.marketDataStatus === "live"
    )
      ? "live"
      : watchedMarketsWithPositions.some((market) => market.dataQuality?.marketDataStatus === "stale")
        ? "stale"
        : watchedMarketsWithPositions.some((market) => market.dataQuality?.marketDataStatus === "settled")
          ? "settled"
          : watchedMarketsWithPositions.some((market) => market.dataQuality?.marketDataStatus === "finalized")
            ? "finalized"
            : tickers.length === 0
              ? "live"
              : "unavailable";

    return {
      mode: "kalshi-only",
      watchedMarkets: watchedMarketsWithPositions,
      positions,
      manualBets: [],
      comboTrackers: [],
      alerts: [],
      portfolioSummary: null,
      groups: {
        active: watchedMarketsWithPositions.filter((market) => !market.isResolved),
        settled: watchedMarketsWithPositions.filter((market) => market.isResolved),
        archived: []
      },
      dataQuality: {
        marketDataStatus: aggregateMarketStatus,
        positionsStatus,
        positionStatus: positionsStatus,
        lastUpdated: updatedAt,
        ...(marketMessage ? { message: marketMessage } : {})
      },
      updatedAt
    };
  }

  async getPositionsForGame(gameId, game) {
    if (!kalshiClient.isConfiguredForRealMode()) {
      if (gameId === "thunder-spurs-demo") {
        return this.getThunderSpursPositions(gameId, game);
      }

      return this.getKnicksCavsPositions(gameId, game);
    }

    return this.getRealPositionsForGame(gameId, game);
  }

  async getRealPositionsForGame(gameId, game) {
    const [positionsResponse, marketsResponse] = await Promise.all([this.getPositions(), this.getMarkets()]);
    const rawPositions = Array.isArray(positionsResponse.positions) ? positionsResponse.positions : [];
    const normalizedMarkets = (Array.isArray(marketsResponse.markets) ? marketsResponse.markets : [])
      .map((market) => normalizeKalshiMarket(market))
      .filter(Boolean);

    const matchingMarkets = normalizedMarkets.filter((market) => gameMatchesMarketTitle(game, market.title));
    const matchingTickers = new Set(matchingMarkets.map((market) => market.ticker));
    const matchingPositions = rawPositions.filter((position) => {
      const title = position.title ?? position.market_title ?? position.ticker ?? "";
      return matchingTickers.has(position.ticker) || gameMatchesMarketTitle(game, title);
    });

    const positions = matchingPositions.length > 0
      ? matchingPositions.map((position, index) => this.normalizeRealPosition(position, matchingMarkets, index))
      : matchingMarkets.map((market, index) => this.normalizeWatchedMarketPosition(market, index));

    return {
      gameId,
      updatedAt: getNowIso(),
      positions
    };
  }

  normalizeRealPosition(position, matchingMarkets, index) {
    const marketTitle = position.title ?? position.market_title ?? position.ticker ?? `Kalshi market ${index + 1}`;
    const matchingMarket = matchingMarkets.find((market) => market.ticker === position.ticker || market.title === marketTitle);
    const parsedMarket = parseKalshiMarketTitle(marketTitle);
    const entryPriceCents = numberOrFallback(
      position.entry_price_cents ?? position.average_price_cents ?? dollarsStringToCents(position.average_price_dollars),
      50
    );
    const currentPriceCents = numberOrFallback(
      position.current_price_cents ?? matchingMarket?.yesPriceCents ?? matchingMarket?.lastPriceCents,
      entryPriceCents
    );
    const contracts = numberOrFallback(position.position_contracts ?? position.contract_count ?? position.contracts, 0);

    return {
      id: position.ticker ?? `kalshi-position-${index + 1}`,
      marketTitle,
      platform: "Kalshi",
      side: normalizeSide(position.side ?? position.position_side),
      contracts,
      entryPriceCents,
      currentPriceCents,
      whatNeedsToHappen: parsedMarket.whatNeedsToHappen,
      marketLeg: parsedMarket.marketLeg
    };
  }

  normalizeWatchedMarketPosition(market, index) {
    const parsedMarket = parseKalshiMarketTitle(market.title);
    const currentPriceCents = numberOrFallback(market.yesPriceCents ?? market.lastPriceCents, 50);

    return {
      id: market.ticker ?? `kalshi-watch-${index + 1}`,
      marketTitle: market.title,
      platform: "Kalshi",
      side: "YES",
      contracts: 0,
      entryPriceCents: currentPriceCents,
      currentPriceCents,
      whatNeedsToHappen: parsedMarket.whatNeedsToHappen,
      marketLeg: parsedMarket.marketLeg
    };
  }

  getKnicksCavsPositions(gameId, game) {
    const teamMarketTitle = "Will the Knicks beat the Cavaliers?";
    const brunsonMarketTitle = "Will Jalen Brunson score 25+ points?";
    const parsedTeamMarket = parseKalshiMarketTitle(teamMarketTitle);
    const parsedBrunsonMarket = parseKalshiMarketTitle(brunsonMarketTitle);
    const brunsonPoints = currentByPlayer(game, "Jalen Brunson", "points");
    const margin = game.homeTeam.score - game.awayTeam.score;
    const brunsonRemaining = Math.max(0, 25 - brunsonPoints);

    return {
      gameId,
      updatedAt: game.updatedAt,
      positions: [
        {
          id: "knicks-moneyline",
          marketTitle: teamMarketTitle,
          platform: "Kalshi",
          side: "YES",
          contracts: 10,
          entryPriceCents: 48,
          currentPriceCents: margin >= 8 ? 76 : margin >= 4 ? 62 : margin > 0 ? 55 : 34,
          whatNeedsToHappen:
            margin > 0
              ? "The Knicks need to stay in front until the final buzzer."
              : `The Knicks need to erase a ${Math.abs(margin)}-point deficit and win.`,
          parsedMarket: parsedTeamMarket
        },
        {
          id: "brunson-25",
          marketTitle: brunsonMarketTitle,
          platform: "Kalshi",
          side: "YES",
          contracts: 5,
          entryPriceCents: 52,
          currentPriceCents:
            brunsonRemaining === 0 ? 91 : brunsonPoints >= 24 ? 67 : brunsonPoints >= 20 ? 59 : 44,
          whatNeedsToHappen:
            brunsonRemaining === 0
              ? "Brunson has already cleared 25 points."
              : `${brunsonRemaining} more point${brunsonRemaining === 1 ? "" : "s"} from Brunson to cash.`,
          marketLeg: parsedBrunsonMarket.marketLeg
            ? {
                ...parsedBrunsonMarket.marketLeg,
                current: brunsonPoints,
                progress: clampPercent((brunsonPoints / parsedBrunsonMarket.marketLeg.target) * 100),
                status: brunsonPoints >= parsedBrunsonMarket.marketLeg.target ? "won" : "sweating",
                whatNeedsToHappen:
                  brunsonRemaining === 0
                    ? "Brunson has already cleared 25 points."
                    : `${brunsonRemaining} more point${brunsonRemaining === 1 ? "" : "s"} from Brunson to cash.`
              }
            : undefined,
          parsedMarket: parsedBrunsonMarket
        }
      ]
    };
  }

  getThunderSpursPositions(gameId, game) {
    const teamMarketTitle = "Will the Thunder beat the Spurs?";
    const shaiMarketTitle = "Will Shai Gilgeous-Alexander score 30+ points?";
    const parsedTeamMarket = parseKalshiMarketTitle(teamMarketTitle);
    const parsedShaiMarket = parseKalshiMarketTitle(shaiMarketTitle);
    const shaiPoints = currentByPlayer(game, "Shai Gilgeous-Alexander", "points");
    const margin = game.homeTeam.score - game.awayTeam.score;
    const shaiRemaining = Math.max(0, 30 - shaiPoints);

    return {
      gameId,
      updatedAt: game.updatedAt,
      positions: [
        {
          id: "thunder-moneyline",
          marketTitle: teamMarketTitle,
          platform: "Kalshi",
          side: "YES",
          contracts: 8,
          entryPriceCents: 54,
          currentPriceCents: margin >= 8 ? 78 : margin >= 4 ? 64 : margin > 0 ? 57 : 39,
          whatNeedsToHappen:
            margin > 0
              ? "The Thunder need to stay in front through the final buzzer."
              : `The Thunder need to erase a ${Math.abs(margin)}-point deficit and win.`,
          parsedMarket: parsedTeamMarket
        },
        {
          id: "sga-30",
          marketTitle: shaiMarketTitle,
          platform: "Kalshi",
          side: "YES",
          contracts: 4,
          entryPriceCents: 51,
          currentPriceCents:
            shaiRemaining === 0 ? 90 : shaiPoints >= 28 ? 72 : shaiPoints >= 22 ? 61 : 46,
          whatNeedsToHappen:
            shaiRemaining === 0
              ? "Shai has already cleared 30 points."
              : `${shaiRemaining} more point${shaiRemaining === 1 ? "" : "s"} from Shai to cash.`,
          marketLeg: parsedShaiMarket.marketLeg
            ? {
                ...parsedShaiMarket.marketLeg,
                current: shaiPoints,
                progress: clampPercent((shaiPoints / parsedShaiMarket.marketLeg.target) * 100),
                status: shaiPoints >= parsedShaiMarket.marketLeg.target ? "won" : "sweating",
                whatNeedsToHappen:
                  shaiRemaining === 0
                    ? "Shai has already cleared 30 points."
                    : `${shaiRemaining} more point${shaiRemaining === 1 ? "" : "s"} from Shai to cash.`
              }
            : undefined,
          parsedMarket: parsedShaiMarket
        }
      ]
    };
  }

  getMarketHealth(position) {
    return clampPercent((position.currentPriceCents / 100) * 100);
  }
}

export {
  buildSearchQueryInfo,
  getSearchSeriesTickers,
  marketMatchesFilter,
  marketSortScore,
  normalizeKalshiMarket,
  normalizeTrackedMarket
};

export const kalshiService = new KalshiService();
