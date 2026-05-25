const SPORTS_DATA_IO_BASE_URL = "https://api.sportsdata.io/v3/nba";

function formatDateForSportsDataIo(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizeStatus(value) {
  const normalized = String(value ?? "").toLowerCase();

  if (["final", "f/ot", "postponed", "canceled"].includes(normalized)) {
    return "final";
  }

  if (["inprogress", "live", "halftime"].includes(normalized)) {
    return "live";
  }

  return "upcoming";
}

function normalizeClock(game) {
  const minutes = game.TimeRemainingMinutes;
  const seconds = game.TimeRemainingSeconds;

  if (typeof minutes === "number" && typeof seconds === "number") {
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  if (game.IsClosed) {
    return "Final";
  }

  return "--:--";
}

function normalizePeriod(game) {
  if (typeof game.Quarter === "number" && game.Quarter > 0) {
    return `Q${game.Quarter}`;
  }

  return normalizeStatus(game.Status) === "upcoming" ? "Pregame" : "Final";
}

function buildGameId(gameId) {
  return `sportsdataio-${gameId}`;
}

function parseProviderGameId(gameId) {
  if (!gameId.startsWith("sportsdataio-")) {
    return null;
  }

  const providerGameId = Number(gameId.slice("sportsdataio-".length));
  return Number.isNaN(providerGameId) ? null : providerGameId;
}

function normalizeGameListItem(game) {
  return {
    gameId: buildGameId(game.GameID),
    providerGameId: String(game.GameID),
    homeTeam: game.HomeTeamName ?? game.HomeTeam,
    awayTeam: game.AwayTeamName ?? game.AwayTeam,
    homeAbbr: game.HomeTeam,
    awayAbbr: game.AwayTeam,
    scheduledTime: game.DateTime ?? null,
    status: normalizeStatus(game.Status),
    period: normalizePeriod(game),
    clock: normalizeClock(game),
    homeScore: Number(game.HomeTeamScore ?? 0),
    awayScore: Number(game.AwayTeamScore ?? 0),
    source: "real",
    updatedAt: game.Updated ?? new Date().toISOString()
  };
}

function normalizeGameState(gameId, game) {
  return {
    gameId,
    providerGameId: String(game.GameID),
    source: "real",
    title: `${game.AwayTeam} at ${game.HomeTeam}`,
    gameStatus: normalizeStatus(game.Status),
    quarter: normalizePeriod(game),
    period: normalizePeriod(game),
    gameClock: normalizeClock(game),
    clock: normalizeClock(game),
    possessionTeam: game.Possession ?? game.HomeTeam,
    homeTeam: {
      name: game.HomeTeamName ?? game.HomeTeam,
      city: game.HomeTeamCity ?? game.HomeTeam,
      shortName: game.HomeTeam,
      score: Number(game.HomeTeamScore ?? 0)
    },
    awayTeam: {
      name: game.AwayTeamName ?? game.AwayTeam,
      city: game.AwayTeamCity ?? game.AwayTeam,
      shortName: game.AwayTeam,
      score: Number(game.AwayTeamScore ?? 0)
    },
    homeScore: Number(game.HomeTeamScore ?? 0),
    awayScore: Number(game.AwayTeamScore ?? 0),
    teamScore: {
      home: Number(game.HomeTeamScore ?? 0),
      away: Number(game.AwayTeamScore ?? 0)
    },
    playerStats: [],
    updatedAt: game.Updated ?? new Date().toISOString(),
    lastUpdated: game.Updated ?? new Date().toISOString()
  };
}

function normalizePlayers(gameId, boxScore) {
  const playerGames = Array.isArray(boxScore.PlayerGames) ? boxScore.PlayerGames : [];

  return {
    gameId,
    source: "sportsdataio",
    updatedAt: boxScore.Game?.Updated ?? new Date().toISOString(),
    lastUpdated: boxScore.Game?.Updated ?? new Date().toISOString(),
    players: playerGames.map((player) => ({
      playerId: String(player.PlayerID ?? player.PlayerId ?? player.StatID ?? `${player.Name}-${player.Team}`),
      name: player.Name,
      team: player.Team,
      points: typeof player.Points === "number" ? player.Points : undefined,
      rebounds:
        typeof player.Rebounds === "number"
          ? player.Rebounds
          : typeof player.OffensiveRebounds === "number" || typeof player.DefensiveRebounds === "number"
            ? Number(player.OffensiveRebounds ?? 0) + Number(player.DefensiveRebounds ?? 0)
            : undefined,
      assists: typeof player.Assists === "number" ? player.Assists : undefined,
      threesMade: typeof player.ThreePointersMade === "number" ? player.ThreePointersMade : undefined,
      steals: typeof player.Steals === "number" ? player.Steals : undefined,
      blocks: typeof player.BlockedShots === "number" ? player.BlockedShots : undefined,
      turnovers: typeof player.Turnovers === "number" ? player.Turnovers : undefined
    }))
  };
}

export class SportsDataIoProvider {
  constructor({ fallbackProvider }) {
    this.fallbackProvider = fallbackProvider;
    this.loggedMissingKey = false;
    this.loggedFetchFailure = false;
  }

  getName() {
    return "sportsdataio";
  }

  getApiKey() {
    return process.env.SPORTSDATAIO_API_KEY?.trim() || "";
  }

  logWarningOnce(message) {
    if (this.loggedMissingKey) {
      return;
    }

    console.warn(message);
    this.loggedMissingKey = true;
  }

  getSupportedGames() {
    return this.fallbackProvider.getSupportedGames();
  }

  async getTodayGames() {
    const games = await this.fetchGamesByDate();

    if (!games) {
      return this.fallbackProvider.getTodayGames();
    }

    return games.map(normalizeGameListItem);
  }

  async getLiveGame(gameId, demoMode) {
    const providerGameId = parseProviderGameId(gameId);

    if (!providerGameId) {
      return this.fallbackProvider.getLiveGame(gameId, demoMode);
    }

    const games = await this.fetchGamesByDate();

    if (!games) {
      return this.fallbackProvider.getLiveGame(gameId, demoMode);
    }

    const game = games.find((entry) => entry.GameID === providerGameId);

    if (!game) {
      return null;
    }

    return normalizeGameState(gameId, game);
  }

  async getPlayerStats(gameId, demoMode) {
    const providerGameId = parseProviderGameId(gameId);

    if (!providerGameId) {
      return this.fallbackProvider.getPlayerStats(gameId, demoMode);
    }

    const boxScore = await this.fetchBoxScore(providerGameId);

    if (!boxScore) {
      return {
        gameId,
        source: "sportsdataio",
        updatedAt: new Date().toISOString(),
        players: [],
        unavailableReason: "SportsDataIO player stats unavailable for the selected game."
      };
    }

    return normalizePlayers(gameId, boxScore);
  }

  async fetchGamesByDate() {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      this.logWarningOnce(
        "[liveSports] SPORTSDATAIO_API_KEY is missing. Falling back to mock provider for SportsDataIO requests."
      );
      return null;
    }

    const date = formatDateForSportsDataIo();
    const url = `${SPORTS_DATA_IO_BASE_URL}/scores/json/GamesByDate/${date}`;

    try {
      const response = await fetch(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`SportsDataIO responded with ${response.status}`);
      }

      this.loggedFetchFailure = false;
      return await response.json();
    } catch (error) {
      if (!this.loggedFetchFailure) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[liveSports] Failed to fetch SportsDataIO games. Falling back to mock provider. ${message}`
        );
        this.loggedFetchFailure = true;
      }

      return null;
    }
  }

  async fetchBoxScore(providerGameId) {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      this.logWarningOnce(
        "[liveSports] SPORTSDATAIO_API_KEY is missing. Falling back to unavailable player stats for SportsDataIO requests."
      );
      return null;
    }

    const url = `${SPORTS_DATA_IO_BASE_URL}/stats/json/BoxScore/${providerGameId}`;

    try {
      const response = await fetch(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`SportsDataIO responded with ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (!this.loggedFetchFailure) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[liveSports] Failed to fetch SportsDataIO box score for game ${providerGameId}. ${message}`
        );
      }

      return null;
    }
  }
}
