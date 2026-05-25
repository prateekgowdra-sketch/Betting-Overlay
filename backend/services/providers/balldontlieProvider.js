const BALLDONTLIE_BASE_URL = "https://api.balldontlie.io/v1";

function formatTodayDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function buildGameId(gameId) {
  return `balldontlie-${gameId}`;
}

function parseProviderGameId(gameId) {
  if (!gameId.startsWith("balldontlie-")) {
    return null;
  }

  const providerGameId = Number(gameId.slice("balldontlie-".length));
  return Number.isNaN(providerGameId) ? null : providerGameId;
}

function normalizeStatus(game) {
  const rawStatus = String(game.status ?? "").trim().toLowerCase();

  if (game.postponed) {
    return "final";
  }

  if (
    rawStatus === "final" ||
    rawStatus.startsWith("final") ||
    rawStatus.includes("postponed") ||
    rawStatus.includes("canceled")
  ) {
    return "final";
  }

  if (
    rawStatus.includes("qtr") ||
    rawStatus.includes("halftime") ||
    rawStatus.includes("ot") ||
    (typeof game.period === "number" && game.period > 0 && rawStatus !== "")
  ) {
    return "live";
  }

  return "upcoming";
}

function normalizePeriod(game) {
  const status = normalizeStatus(game);

  if (status === "final") {
    return "Final";
  }

  if (status === "upcoming") {
    return "Pregame";
  }

  if (String(game.status ?? "").toLowerCase().includes("ot")) {
    return "OT";
  }

  return typeof game.period === "number" && game.period > 0 ? `Q${game.period}` : "Live";
}

function normalizeClock(game) {
  const status = normalizeStatus(game);
  const time = String(game.time ?? "").trim();

  if (status === "final") {
    return "Final";
  }

  if (status === "upcoming") {
    return String(game.status ?? "").trim() || "--:--";
  }

  return time || String(game.status ?? "").trim() || "Live";
}

function normalizeGameListItem(game) {
  const updatedAt = new Date().toISOString();

  return {
    gameId: buildGameId(game.id),
    providerGameId: String(game.id),
    homeTeam: game.home_team?.full_name ?? game.home_team?.name ?? "Home",
    awayTeam: game.visitor_team?.full_name ?? game.visitor_team?.name ?? "Away",
    homeAbbr: game.home_team?.abbreviation ?? "HOME",
    awayAbbr: game.visitor_team?.abbreviation ?? "AWAY",
    scheduledTime: game.datetime ?? null,
    status: normalizeStatus(game),
    period: normalizePeriod(game),
    clock: normalizeClock(game),
    homeScore: Number(game.home_team_score ?? 0),
    awayScore: Number(game.visitor_team_score ?? 0),
    source: "real",
    updatedAt
  };
}

function normalizeGameState(gameId, game) {
  const updatedAt = new Date().toISOString();

  return {
    gameId,
    providerGameId: String(game.id),
    source: "real",
    title: `${game.visitor_team?.abbreviation ?? "AWAY"} at ${game.home_team?.abbreviation ?? "HOME"}`,
    gameStatus: normalizeStatus(game),
    quarter: normalizePeriod(game),
    period: normalizePeriod(game),
    gameClock: normalizeClock(game),
    clock: normalizeClock(game),
    possessionTeam: null,
    homeTeam: {
      name: game.home_team?.full_name ?? game.home_team?.name ?? "Home",
      city: game.home_team?.city ?? game.home_team?.name ?? "Home",
      shortName: game.home_team?.abbreviation ?? "HOME",
      score: Number(game.home_team_score ?? 0)
    },
    awayTeam: {
      name: game.visitor_team?.full_name ?? game.visitor_team?.name ?? "Away",
      city: game.visitor_team?.city ?? game.visitor_team?.name ?? "Away",
      shortName: game.visitor_team?.abbreviation ?? "AWAY",
      score: Number(game.visitor_team_score ?? 0)
    },
    homeScore: Number(game.home_team_score ?? 0),
    awayScore: Number(game.visitor_team_score ?? 0),
    teamScore: {
      home: Number(game.home_team_score ?? 0),
      away: Number(game.visitor_team_score ?? 0)
    },
    playerStats: [],
    updatedAt,
    lastUpdated: updatedAt
  };
}

function normalizePlayers(gameId, stats) {
  return {
    gameId,
    source: "balldontlie",
    updatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    players: stats.map((stat) => ({
      playerId: String(stat.player?.id ?? stat.id),
      name: `${stat.player?.first_name ?? ""} ${stat.player?.last_name ?? ""}`.trim(),
      team: stat.team?.abbreviation ?? "UNK",
      points: typeof stat.pts === "number" ? stat.pts : undefined,
      rebounds: typeof stat.reb === "number" ? stat.reb : undefined,
      assists: typeof stat.ast === "number" ? stat.ast : undefined,
      threesMade: typeof stat.fg3m === "number" ? stat.fg3m : undefined,
      steals: typeof stat.stl === "number" ? stat.stl : undefined,
      blocks: typeof stat.blk === "number" ? stat.blk : undefined,
      turnovers: typeof stat.turnover === "number" ? stat.turnover : undefined
    }))
  };
}

export class BalldontlieProvider {
  constructor({ fallbackProvider }) {
    this.fallbackProvider = fallbackProvider;
    this.loggedMissingKey = false;
    this.loggedFetchFailure = false;
  }

  getName() {
    return "balldontlie";
  }

  getApiKey() {
    return process.env.BALLDONTLIE_API_KEY?.trim() || "";
  }

  getSupportedGames() {
    return this.fallbackProvider.getSupportedGames();
  }

  logMissingKeyWarning(context) {
    if (this.loggedMissingKey) {
      return;
    }

    console.warn(
      `[liveSports] BALLDONTLIE_API_KEY is missing. Falling back to mock provider for ${context}.`
    );
    this.loggedMissingKey = true;
  }

  async getTodayGames() {
    const games = await this.fetchTodayGames();

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

    const game = await this.fetchGame(providerGameId);

    if (!game) {
      return this.fallbackProvider.getLiveGame(gameId, demoMode);
    }

    return normalizeGameState(gameId, game);
  }

  async getPlayerStats(gameId, demoMode) {
    const providerGameId = parseProviderGameId(gameId);

    if (!providerGameId) {
      return this.fallbackProvider.getPlayerStats(gameId, demoMode);
    }

    const stats = await this.fetchStats(providerGameId);

    if (!stats) {
      return {
        gameId,
        source: "balldontlie",
        updatedAt: new Date().toISOString(),
        players: [],
        unavailableReason: "BALLDONTLIE player stats unavailable for the selected game."
      };
    }

    return normalizePlayers(gameId, stats);
  }

  async fetchTodayGames() {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      this.logMissingKeyWarning("today's games");
      return null;
    }

    const url = new URL(`${BALLDONTLIE_BASE_URL}/games`);
    url.searchParams.append("dates[]", formatTodayDate());
    url.searchParams.set("per_page", "100");

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: process.env.BALLDONTLIE_API_KEY
        }
      });

      if (!response.ok) {
        throw new Error(`BALLDONTLIE responded with ${response.status}`);
      }

      this.loggedFetchFailure = false;
      const payload = await response.json();
      return Array.isArray(payload.data) ? payload.data : [];
    } catch (error) {
      if (!this.loggedFetchFailure) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[liveSports] Failed to fetch BALLDONTLIE games. Falling back to mock provider. ${message}`
        );
        this.loggedFetchFailure = true;
      }

      return null;
    }
  }

  async fetchGame(providerGameId) {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      this.logMissingKeyWarning("game state");
      return null;
    }

    try {
      const response = await fetch(`${BALLDONTLIE_BASE_URL}/games/${providerGameId}`, {
        headers: {
          Authorization: process.env.BALLDONTLIE_API_KEY
        }
      });

      if (!response.ok) {
        throw new Error(`BALLDONTLIE responded with ${response.status}`);
      }

      const payload = await response.json();
      return payload.data ?? null;
    } catch (error) {
      if (!this.loggedFetchFailure) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[liveSports] Failed to fetch BALLDONTLIE game ${providerGameId}. Falling back to mock provider. ${message}`
        );
        this.loggedFetchFailure = true;
      }

      return null;
    }
  }

  async fetchStats(providerGameId) {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      this.logMissingKeyWarning("player stats");
      return null;
    }

    const url = new URL(`${BALLDONTLIE_BASE_URL}/stats`);
    url.searchParams.append("game_ids[]", String(providerGameId));
    url.searchParams.set("per_page", "100");

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: process.env.BALLDONTLIE_API_KEY
        }
      });

      if (!response.ok) {
        throw new Error(`BALLDONTLIE responded with ${response.status}`);
      }

      const payload = await response.json();
      return Array.isArray(payload.data) ? payload.data : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(
        `[liveSports] Failed to fetch BALLDONTLIE player stats for game ${providerGameId}. ${message}`
      );
      return null;
    }
  }
}
