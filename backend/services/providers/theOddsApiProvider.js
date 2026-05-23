const DEFAULT_SPORT_KEY = "basketball_nba";
const SCORES_BASE_URL = "https://api.the-odds-api.com/v4/sports";
const TEAM_ALIASES = {
  cavs: "cavaliers",
  cavaliers: "cavaliers",
  cle: "cavaliers",
  knicks: "knicks",
  nyk: "knicks"
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeTeamToken(value) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return TEAM_ALIASES[cleaned] ?? cleaned;
}

function extractMatchTokens(gameId) {
  const parts = gameId
    .split("-")
    .filter(Boolean)
    .map((part) => normalizeTeamToken(part))
    .filter((part) => part !== "demo");

  return new Set(parts);
}

function getScoreForTeam(event, teamName) {
  const scoreEntry = Array.isArray(event.scores)
    ? event.scores.find((entry) => entry.name === teamName)
    : undefined;

  return scoreEntry ? Number(scoreEntry.score ?? 0) : 0;
}

function inferGameStatus(event) {
  if (event.completed) {
    return "final";
  }

  if (Array.isArray(event.scores) && event.scores.length > 0) {
    return "live";
  }

  return "upcoming";
}

function normalizeClockLabel(gameStatus) {
  if (gameStatus === "final") {
    return "Final";
  }

  if (gameStatus === "live") {
    return "Live";
  }

  return "Scheduled";
}

function matchEventToGameId(gameId, events) {
  const tokens = extractMatchTokens(gameId);

  if (tokens.size === 0) {
    return events[0] ?? null;
  }

  return (
    events.find((event) => {
      const homeToken = normalizeTeamToken(event.home_team ?? "");
      const awayToken = normalizeTeamToken(event.away_team ?? "");
      const eventTokens = new Set([homeToken, awayToken]);

      return [...tokens].every((token) => eventTokens.has(token));
    }) ?? null
  );
}

export class TheOddsApiProvider {
  constructor({ fallbackProvider }) {
    this.fallbackProvider = fallbackProvider;
    this.loggedMissingKey = false;
    this.loggedFetchFailure = false;
  }

  getName() {
    return "the_odds_api";
  }

  getSupportedGames() {
    return this.fallbackProvider.getSupportedGames();
  }

  getSportKey() {
    return process.env.THE_ODDS_SPORT_KEY || DEFAULT_SPORT_KEY;
  }

  getApiKey() {
    return process.env.THE_ODDS_API_KEY?.trim() || "";
  }

  async getLiveGame(gameId, demoMode) {
    const scores = await this.fetchScores();

    if (!scores) {
      return this.fallbackProvider.getLiveGame(gameId, demoMode);
    }

    const event = matchEventToGameId(gameId, scores);

    if (!event) {
      return this.fallbackProvider.getLiveGame(gameId, demoMode);
    }

    return this.normalizeGame(gameId, event);
  }

  async getPlayerStats(gameId, demoMode) {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      return this.fallbackProvider.getPlayerStats(gameId, demoMode);
    }

    const game = await this.getLiveGame(gameId, demoMode);

    if (!game) {
      return this.fallbackProvider.getPlayerStats(gameId, demoMode);
    }

    return {
      gameId,
      updatedAt: game.updatedAt,
      lastUpdated: game.lastUpdated,
      period: game.period,
      clock: game.clock,
      teamScore: game.teamScore,
      players: [],
      unavailableReason: "The Odds API scores endpoint does not include player stat feeds."
    };
  }

  async fetchScores() {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      if (!this.loggedMissingKey) {
        console.warn(
          "[liveSports] THE_ODDS_API_KEY is missing. Falling back to mock sports data provider."
        );
        this.loggedMissingKey = true;
      }

      return null;
    }

    const sportKey = this.getSportKey();
    const url = new URL(`${SCORES_BASE_URL}/${sportKey}/scores/`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("daysFrom", "1");
    url.searchParams.set("dateFormat", "iso");

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`The Odds API responded with ${response.status}`);
      }

      this.loggedFetchFailure = false;
      return await response.json();
    } catch (error) {
      if (!this.loggedFetchFailure) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[liveSports] Failed to fetch The Odds API scores for ${sportKey}. Falling back to mock provider. ${message}`
        );
        this.loggedFetchFailure = true;
      }

      return null;
    }
  }

  normalizeGame(gameId, event) {
    const gameStatus = inferGameStatus(event);
    const homeScore = getScoreForTeam(event, event.home_team);
    const awayScore = getScoreForTeam(event, event.away_team);
    const updatedAt = event.last_update || new Date().toISOString();

    return {
      gameId,
      sourceEventId: event.id,
      sportKey: this.getSportKey(),
      title: `${event.away_team} at ${event.home_team}`,
      gameStatus,
      quarter: gameStatus === "final" ? "Final" : gameStatus === "live" ? "Live" : "Upcoming",
      period: gameStatus === "final" ? "Final" : gameStatus === "live" ? "Live" : "Upcoming",
      gameClock: normalizeClockLabel(gameStatus),
      clock: normalizeClockLabel(gameStatus),
      possessionTeam: null,
      homeTeam: {
        name: event.home_team,
        city: event.home_team,
        shortName: slugify(event.home_team).slice(0, 3).toUpperCase(),
        score: homeScore
      },
      awayTeam: {
        name: event.away_team,
        city: event.away_team,
        shortName: slugify(event.away_team).slice(0, 3).toUpperCase(),
        score: awayScore
      },
      teamScore: {
        home: homeScore,
        away: awayScore
      },
      playerStats: [],
      updatedAt,
      lastUpdated: updatedAt
    };
  }
}
