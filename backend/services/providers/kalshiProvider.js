import { kalshiService } from "../kalshiService.js";

const TEAM_ABBREVIATIONS = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS"
};
const KALSHI_GAME_PREFIX = "kalshi-";
const MARKET_CACHE_MS = 30 * 1000;

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getTeamAbbr(teamName) {
  return TEAM_ABBREVIATIONS[teamName] ?? slugify(teamName).slice(0, 3).toUpperCase();
}

function parseTeamMatchup(title) {
  const match = String(title ?? "")
    .trim()
    .replace(/\?$/, "")
    .match(/^will\s+the\s+(.+?)\s+beat\s+the\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    favoriteTeam: match[1].trim(),
    opponentTeam: match[2].trim()
  };
}

function buildGameId(ticker) {
  return `${KALSHI_GAME_PREFIX}${ticker}`;
}

function parseProviderGameId(gameId) {
  if (!String(gameId).startsWith(KALSHI_GAME_PREFIX)) {
    return null;
  }

  return gameId.slice(KALSHI_GAME_PREFIX.length);
}

function inferGameStatus(marketStatus) {
  const normalized = String(marketStatus ?? "").trim().toLowerCase();

  if (["settled", "closed", "final", "resolved", "expired"].some((token) => normalized.includes(token))) {
    return "final";
  }

  if (["active", "open", "live", "trading"].some((token) => normalized.includes(token))) {
    return "live";
  }

  return "upcoming";
}

function inferPeriodLabel(gameStatus) {
  if (gameStatus === "final") {
    return "Market Closed";
  }

  if (gameStatus === "live") {
    return "Market Live";
  }

  return "Pregame";
}

function buildClockLabel(market) {
  if (typeof market.yesPriceCents === "number" || typeof market.noPriceCents === "number") {
    const yesLabel = typeof market.yesPriceCents === "number" ? `Y ${market.yesPriceCents}` : "Y --";
    const noLabel = typeof market.noPriceCents === "number" ? `N ${market.noPriceCents}` : "N --";
    return `${yesLabel} / ${noLabel}`;
  }

  return inferPeriodLabel(inferGameStatus(market.status));
}

function normalizeMarketGame(market) {
  const matchup = parseTeamMatchup(market.title);

  if (!matchup) {
    return null;
  }

  const gameStatus = inferGameStatus(market.status);
  const homeTeam = matchup.favoriteTeam;
  const awayTeam = matchup.opponentTeam;

  return {
    gameId: buildGameId(market.ticker),
    providerGameId: market.ticker,
    homeTeam,
    awayTeam,
    homeAbbr: getTeamAbbr(homeTeam),
    awayAbbr: getTeamAbbr(awayTeam),
    scheduledTime: market.updatedAt ?? null,
    status: gameStatus,
    period: inferPeriodLabel(gameStatus),
    clock: buildClockLabel(market),
    homeScore: 0,
    awayScore: 0,
    source: "kalshi",
    updatedAt: market.updatedAt ?? new Date().toISOString(),
    title: `${awayTeam} at ${homeTeam}`
  };
}

export class KalshiProvider {
  constructor({ fallbackProvider, kalshiService: kalshiServiceOverride = kalshiService }) {
    this.fallbackProvider = fallbackProvider;
    this.kalshiService = kalshiServiceOverride;
    this.cachedGames = [];
    this.gamesCacheExpiresAt = 0;
    this.hasGamesCache = false;
    this.loggedFetchFailure = false;
  }

  getName() {
    return "kalshi";
  }

  getSupportedGames() {
    return this.fallbackProvider.getSupportedGames();
  }

  async getTodayGames() {
    const games = await this.discoverGamesFromMarkets();

    if (games.length === 0) {
      return this.fallbackProvider.getTodayGames();
    }

    return games.map(({ title, ...game }) => game);
  }

  async getLiveGame(gameId, demoMode) {
    const providerGameId = parseProviderGameId(gameId);

    if (!providerGameId) {
      return this.fallbackProvider.getLiveGame(gameId, demoMode);
    }

    const games = await this.discoverGamesFromMarkets();
    const game = games.find((entry) => entry.providerGameId === providerGameId);

    if (!game) {
      return null;
    }

    return {
      gameId: game.gameId,
      providerGameId: game.providerGameId,
      source: "kalshi",
      title: game.title,
      gameStatus: game.status,
      quarter: game.period,
      period: game.period,
      gameClock: game.clock,
      clock: game.clock,
      possessionTeam: null,
      homeTeam: {
        name: game.homeTeam,
        city: game.homeTeam,
        shortName: game.homeAbbr,
        score: game.homeScore
      },
      awayTeam: {
        name: game.awayTeam,
        city: game.awayTeam,
        shortName: game.awayAbbr,
        score: game.awayScore
      },
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      teamScore: {
        home: game.homeScore,
        away: game.awayScore
      },
      playerStats: [],
      updatedAt: game.updatedAt,
      lastUpdated: game.updatedAt
    };
  }

  async getPlayerStats(gameId, demoMode) {
    const providerGameId = parseProviderGameId(gameId);

    if (!providerGameId) {
      return this.fallbackProvider.getPlayerStats(gameId, demoMode);
    }

    const timestamp = new Date().toISOString();

    return {
      gameId,
      source: "kalshi",
      updatedAt: timestamp,
      lastUpdated: timestamp,
      players: [],
      unavailableReason: "Sports stats unavailable in Kalshi-first mode. Kalshi market tracking is still active."
    };
  }

  async discoverGamesFromMarkets() {
    if (this.gamesCacheExpiresAt > Date.now() && this.hasGamesCache) {
      return this.cachedGames;
    }

    try {
      const response = await this.kalshiService.getMarkets();
      const markets = Array.isArray(response.markets) ? response.markets : [];
      const normalizedGames = markets
        .map((market) => normalizeMarketGame(market))
        .filter(Boolean)
        .sort((left, right) => left.homeTeam.localeCompare(right.homeTeam));

      this.cachedGames = normalizedGames;
      this.gamesCacheExpiresAt = Date.now() + MARKET_CACHE_MS;
      this.hasGamesCache = true;
      this.loggedFetchFailure = false;
      console.log(`[liveSports] provider=kalshi gamesReturned=${normalizedGames.length}`);
      return normalizedGames;
    } catch (error) {
      if (!this.loggedFetchFailure) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(`[liveSports] Failed to discover Kalshi markets for game feed. Falling back to mock provider. ${message}`);
        this.loggedFetchFailure = true;
      }

      this.cachedGames = [];
      this.gamesCacheExpiresAt = Date.now() + MARKET_CACHE_MS;
      this.hasGamesCache = true;
      return [];
    }
  }
}
