import { kalshiClient } from "./kalshiClient.js";
import { parseKalshiMarketTitle } from "./marketParsingService.js";

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

function fixedPointStringToNumber(value) {
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

function normalizeKalshiMarket(rawMarket) {
  if (!rawMarket) {
    return null;
  }

  if ("yes_ask_cents" in rawMarket || "yes_bid_cents" in rawMarket) {
    const yesPriceCents =
      rawMarket.last_price_cents ?? rawMarket.yes_ask_cents ?? rawMarket.yes_bid_cents ?? null;
    const noPriceCents =
      rawMarket.no_ask_cents ??
      rawMarket.no_bid_cents ??
      (typeof yesPriceCents === "number" ? 100 - yesPriceCents : null);

    return {
      ticker: rawMarket.ticker,
      title: rawMarket.title,
      status: rawMarket.status,
      yesPriceCents,
      noPriceCents,
      lastPriceCents: rawMarket.last_price_cents ?? yesPriceCents,
      updatedAt: rawMarket.updated_at ?? null
    };
  }

  const yesPriceCents =
    dollarsStringToCents(rawMarket.yes_ask_dollars) ??
    dollarsStringToCents(rawMarket.yes_bid_dollars) ??
    dollarsStringToCents(rawMarket.last_price_dollars);
  const noPriceCents =
    dollarsStringToCents(rawMarket.no_ask_dollars) ??
    dollarsStringToCents(rawMarket.no_bid_dollars) ??
    (typeof yesPriceCents === "number" ? 100 - yesPriceCents : null);

  return {
    ticker: rawMarket.ticker,
    title: rawMarket.title ?? rawMarket.yes_sub_title ?? rawMarket.ticker,
    status: rawMarket.status ?? "unknown",
    yesPriceCents,
    noPriceCents,
    lastPriceCents: dollarsStringToCents(rawMarket.last_price_dollars) ?? yesPriceCents,
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
    yesBidCents:
      normalized.yesPriceCents ?? dollarsStringToCents(rawMarket.yes_bid_dollars) ?? null,
    yesAskCents: dollarsStringToCents(rawMarket.yes_ask_dollars) ?? rawMarket.yes_ask_cents ?? null,
    noBidCents: dollarsStringToCents(rawMarket.no_bid_dollars) ?? rawMarket.no_bid_cents ?? null,
    noAskCents: normalized.noPriceCents ?? dollarsStringToCents(rawMarket.no_ask_dollars) ?? null,
    lastPriceCents: normalized.lastPriceCents,
    previousPriceCents:
      dollarsStringToCents(rawMarket.previous_price_dollars) ?? rawMarket.previous_price_cents ?? null,
    volume: fixedPointStringToNumber(rawMarket.volume_fp) ?? null,
    openInterest: fixedPointStringToNumber(rawMarket.open_interest_fp) ?? null,
    liquidityCents:
      dollarsStringToCents(rawMarket.liquidity_dollars) ?? rawMarket.liquidity_cents ?? null,
    closeTime: rawMarket.close_time ?? null,
    updatedAt: normalized.updatedAt,
    position
  };
}

const SPORTS_MARKET_HINTS = [
  { key: "nba", label: "NBA", patterns: ["nba", "basketball", "knicks", "cavaliers", "thunder", "spurs"] },
  { key: "nfl", label: "NFL", patterns: ["nfl", "football", "super bowl"] },
  { key: "mlb", label: "MLB", patterns: ["mlb", "baseball", "world series"] },
  { key: "nhl", label: "NHL", patterns: ["nhl", "hockey", "stanley cup"] },
  { key: "wnba", label: "WNBA", patterns: ["wnba"] },
  { key: "ncaaf", label: "College Football", patterns: ["ncaaf", "college football"] },
  { key: "ncaamb", label: "College Basketball", patterns: ["ncaamb", "college basketball", "march madness"] },
  { key: "soccer", label: "Soccer", patterns: ["soccer", "epl", "premier league", "champions league", "mls", "fifa"] },
  { key: "tennis", label: "Tennis", patterns: ["tennis", "wimbledon", "us open", "french open", "australian open"] },
  { key: "golf", label: "Golf", patterns: ["golf", "masters", "pga"] }
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

  return compact.length >= 4 ? [...tokens, compact] : tokens;
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
  premier: "epl",
  epl: "epl",
  champions: "champions",
  tennis: "tennis",
  golf: "golf",
  wnba: "wnba"
};

function expandSearchToken(token) {
  const alias = TEAM_SEARCH_ALIASES[token];
  return alias ? [token, alias] : [token];
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

function searchTokensMatchHaystack(searchTokens, haystack) {
  if (searchTokens.length === 0) {
    return true;
  }

  const normalizedHaystack = normalizeSearchText(haystack);

  return searchTokens.every((token) =>
    expandSearchToken(token).some(
      (candidate) => normalizedHaystack.includes(candidate) || haystack.includes(candidate)
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

function isDirectSportsLineTicker(ticker) {
  return /^KX(NBA|WNBA|MLB|NFL|NHL)(GAME|PTS|REB|AST|3PT|STL|BLK|TO|TOTAL|SPREAD|HR|HIT|KS|GOAL|TD|PASS|RUSH|REC)/i.test(
    ticker
  );
}

function marketSortScore(market, filters = {}) {
  const ticker = String(market.ticker ?? "");
  const title = String(market.title ?? "");
  let score = 0;

  if (/KX(NBA|WNBA|MLB|NFL|NHL)GAME/i.test(ticker)) score += 80;
  if (/KX(NBA|WNBA|MLB|NFL|NHL)(PTS|REB|AST|3PT|STL|BLK|TO|TOTAL|SPREAD|HR|HIT|KS|GOAL|TD|PASS|RUSH|REC)/i.test(ticker)) score += 70;
  if (/KXMVE/i.test(ticker)) score -= 60;
  if (/get.?in price|ticket|tickets|attendance/i.test(title)) score -= 80;

  if (filters.search && searchTokensMatchHaystack(getSearchTokens(filters.search), marketSearchHaystack(market))) {
    score += 20;
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
    rawMarket.event_title,
    rawMarket.title,
    rawMarket.subtitle,
    rawMarket.yes_sub_title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const directSport = typeof rawMarket.sport === "string" ? rawMarket.sport.trim() : "";
  const matchedSport =
    SPORTS_MARKET_HINTS.find((sport) => includesAny(text, sport.patterns)) ?? null;
  const parsed = parseKalshiMarketTitle(
    rawMarket.title ?? rawMarket.market_title ?? rawMarket.subtitle ?? ""
  );

  return {
    sport: directSport || matchedSport?.label || "Sports",
    competition:
      typeof rawMarket.competition === "string" && rawMarket.competition.trim()
        ? rawMarket.competition.trim()
        : matchedSport?.label || "Sports",
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
  const searchTokens = getSearchTokens(filters.search);

  if (sport && normalizeFilterValue(market.sport) !== sport) {
    return false;
  }

  if (competition && normalizeFilterValue(market.competition) !== competition) {
    return false;
  }

  if (scope && normalizeFilterValue(market.scope) !== scope) {
    return false;
  }

  if (searchTokens.length > 0) {
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
  return ["closed", "settled", "finalized", "expired"].includes(
    String(status ?? "").toLowerCase()
  );
}

function getMarketDataStatus(market, fetchedAt = getNowIso()) {
  if (!market) {
    return "unavailable";
  }

  if (isClosedMarketStatus(market.status)) {
    return "live";
  }

  const updatedAt = market.updatedAt ? new Date(market.updatedAt).getTime() : NaN;

  if (Number.isNaN(updatedAt)) {
    return "live";
  }

  const ageMs = new Date(fetchedAt).getTime() - updatedAt;

  return ageMs > 5 * 60 * 1000 ? "stale" : "live";
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
      lastUpdated: market.updatedAt ?? timestamp,
      ...(isClosedMarketStatus(market.status) ? { message: `Market is ${market.status}` } : {})
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

    return {
      mode: "real",
      environment: this.getPublicEnvironment(),
      markets: (response.markets ?? [])
        .map((market) => normalizeTrackedMarket(market, positionsByTicker.get(market.ticker) ?? null))
        .filter(Boolean),
      cursor: response.cursor ?? null,
      raw: response
    };
  }

  async getSportsFilters(query = {}) {
    const response = await this.getPublicMarkets({
      limit: query.limit ?? 100,
      status: query.status ?? "open"
    });
    const sports = new Map();

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
    const pageLimit = filters.search ? 100 : limit;
    const collectedMarkets = [];
    const associatedTickers = new Set();
    let cursor = filters.cursor;
    let response = null;
    const maxPages = filters.search ? 2 : 1;

    for (let page = 0; page < maxPages; page += 1) {
      response = await this.getPublicMarkets({
        limit: pageLimit,
        cursor,
        ...(filters.status ? { status: filters.status } : {})
      });

      collectedMarkets.push(...response.markets);

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

        collectedMarkets.push(...associatedResponse.markets);
      } catch {
        // Keep the original market search results if associated lookup is unavailable.
      }
    }

    const markets = collectedMarkets
      .filter((market) => marketMatchesFilter(market, filters))
      .sort((a, b) => marketSortScore(b, filters) - marketSortScore(a, filters))
      .filter((market, index, allMarkets) => allMarkets.findIndex((entry) => entry.ticker === market.ticker) === index)
      .slice(0, limit);

    return {
      ...(response ?? {
        mode: "real",
        environment: this.getPublicEnvironment(),
        cursor: null
      }),
      markets
    };
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

    const embeddedContext = normalizeLiveContextFromPayload(watchedMarket, watchedMarket);

    if (embeddedContext) {
      return embeddedContext;
    }

    if (!watchedMarket.eventTicker) {
      return unavailableLiveContext("No Kalshi event ticker was available for this market", watchedMarket);
    }

    try {
      const liveDataResponse = await kalshiClient.getPublicEventLiveData(watchedMarket.eventTicker);
      const liveContext = normalizeLiveContextFromPayload(liveDataResponse, watchedMarket);

      if (liveContext) {
        return liveContext;
      }
    } catch {
      // Many Kalshi events do not expose public live_data; keep market odds as primary.
    }

    try {
      const eventResponse = await kalshiClient.getPublicEvent(watchedMarket.eventTicker);
      const liveContext = normalizeLiveContextFromPayload(eventResponse, watchedMarket);

      if (liveContext) {
        return liveContext;
      }
    } catch {
      return unavailableLiveContext("Kalshi event live data was unavailable", watchedMarket);
    }

    return unavailableLiveContext("Kalshi did not return live score context for this market", watchedMarket);
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
        const marketsResponse = await this.getPublicMarkets({
          tickers: tickers.join(","),
          limit: Math.max(tickers.length, 1)
        });
        watchedMarkets = marketsResponse.markets.filter((market) =>
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
        : tickers.length === 0
          ? "live"
          : "unavailable";

    return {
      mode: "kalshi-only",
      watchedMarkets: watchedMarketsWithPositions,
      positions,
      manualBets: [],
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

export const kalshiService = new KalshiService();
