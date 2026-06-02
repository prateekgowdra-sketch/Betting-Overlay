const BALLDONTLIE_BASE_URL = "https://api.balldontlie.io/v1";
const DEFAULT_LOOKBACK_DAYS = 1;
const DEFAULT_LOOKAHEAD_DAYS = 3;
const PLAYER_STATS_AUTH_COOLDOWN_MS = 15 * 60 * 1000;
const PLAYER_STATS_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const PLAYER_STATS_ERROR_COOLDOWN_MS = 30 * 1000;

function addDays(date, offsetDays) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + offsetDays);
  return nextDate;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTodayDate(date = new Date()) {
  return formatDate(date);
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

function getUpdatedAt(game) {
  return game.updated_at ?? game.datetime ?? new Date().toISOString();
}

function normalizeGameListItem(game) {
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
    source: "balldontlie",
    updatedAt: getUpdatedAt(game)
  };
}

function normalizeGameState(gameId, game) {
  const updatedAt = getUpdatedAt(game);

  return {
    gameId,
    providerGameId: String(game.id),
    source: "balldontlie",
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

function sortGamesByScheduledTime(games) {
  return [...games].sort((left, right) => {
    const leftTime = new Date(left.datetime ?? 0).getTime();
    const rightTime = new Date(right.datetime ?? 0).getTime();
    return leftTime - rightTime;
  });
}

export function buildDateWindow(baseDate = new Date(), lookbackDays = DEFAULT_LOOKBACK_DAYS, lookaheadDays = DEFAULT_LOOKAHEAD_DAYS) {
  const dates = [];

  for (let offset = -lookbackDays; offset <= lookaheadDays; offset += 1) {
    dates.push(formatDate(addDays(baseDate, offset)));
  }

  return dates;
}

export function selectRelevantGamesByWindow(groupedGames, preferredDate = formatTodayDate()) {
  const todaysGames = groupedGames[preferredDate] ?? [];

  if (todaysGames.length > 0) {
    return sortGamesByScheduledTime(todaysGames);
  }

  const futureDates = Object.keys(groupedGames)
    .filter((date) => date > preferredDate && (groupedGames[date]?.length ?? 0) > 0)
    .sort();

  if (futureDates.length > 0) {
    return sortGamesByScheduledTime(groupedGames[futureDates[0]]);
  }

  const pastDates = Object.keys(groupedGames)
    .filter((date) => date < preferredDate && (groupedGames[date]?.length ?? 0) > 0)
    .sort()
    .reverse();

  if (pastDates.length > 0) {
    return sortGamesByScheduledTime(groupedGames[pastDates[0]]);
  }

  return [];
}

export class BalldontlieProvider {
  constructor({ fallbackProvider }) {
    this.fallbackProvider = fallbackProvider;
    this.loggedMissingKey = false;
    this.loggedFetchFailure = false;
    this.playerStatsUnavailableUntil = 0;
    this.playerStatsUnavailableReason = null;
    this.loggedPlayerStatsWarning = false;
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

  logGamesResult(count) {
    console.log(`[liveSports] provider=balldontlie gamesReturned=${count}`);
  }

  getUnavailablePlayerStatsResponse(gameId, reason = "BALLDONTLIE player stats unavailable for the selected game.") {
    const timestamp = new Date().toISOString();

    return {
      gameId,
      source: "balldontlie",
      updatedAt: timestamp,
      lastUpdated: timestamp,
      players: [],
      unavailableReason: reason
    };
  }

  getActivePlayerStatsCooldown() {
    if (this.playerStatsUnavailableUntil > Date.now() && this.playerStatsUnavailableReason) {
      return this.playerStatsUnavailableReason;
    }

    return null;
  }

  setPlayerStatsCooldown(reason, durationMs) {
    this.playerStatsUnavailableReason = reason;
    this.playerStatsUnavailableUntil = Date.now() + durationMs;

    if (!this.loggedPlayerStatsWarning) {
      console.warn(`[liveSports] ${reason}`);
      this.loggedPlayerStatsWarning = true;
    }
  }

  clearPlayerStatsCooldown() {
    this.playerStatsUnavailableUntil = 0;
    this.playerStatsUnavailableReason = null;
    this.loggedPlayerStatsWarning = false;
  }

  async getTodayGames() {
    const groupedGames = await this.fetchGamesForDateWindow();

    if (!groupedGames) {
      return this.fallbackProvider.getTodayGames();
    }

    const games = selectRelevantGamesByWindow(groupedGames, formatTodayDate());
    this.logGamesResult(games.length);
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

    const unavailableReason = this.getActivePlayerStatsCooldown();

    if (unavailableReason) {
      return this.getUnavailablePlayerStatsResponse(gameId, unavailableReason);
    }

    const stats = await this.fetchStats(providerGameId);

    if (!stats) {
      return this.getUnavailablePlayerStatsResponse(
        gameId,
        this.playerStatsUnavailableReason ?? "BALLDONTLIE player stats unavailable for the selected game."
      );
    }

    return normalizePlayers(gameId, stats);
  }

  async fetchGamesForDateWindow() {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      this.logMissingKeyWarning("today's games");
      return null;
    }

    const dateWindow = buildDateWindow();
    const groupedGames = {};

    try {
      for (const date of dateWindow) {
        groupedGames[date] = await this.fetchGamesForDate(date);
      }

      this.loggedFetchFailure = false;
      return groupedGames;
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

  async fetchGamesForDate(date) {
    const url = new URL(`${BALLDONTLIE_BASE_URL}/games`);
    url.searchParams.append("dates[]", date);
    url.searchParams.set("per_page", "100");

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
        if (response.status === 401) {
          this.setPlayerStatsCooldown(
            "BALLDONTLIE player stats are not available for this API key or plan. Returning unavailable state until the cooldown expires.",
            PLAYER_STATS_AUTH_COOLDOWN_MS
          );
          return null;
        }

        if (response.status === 429) {
          this.setPlayerStatsCooldown(
            "BALLDONTLIE player stats rate-limited. Returning unavailable state until the cooldown expires.",
            PLAYER_STATS_RATE_LIMIT_COOLDOWN_MS
          );
          return null;
        }

        throw new Error(`BALLDONTLIE responded with ${response.status}`);
      }

      const payload = await response.json();
      this.clearPlayerStatsCooldown();
      return Array.isArray(payload.data) ? payload.data : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.setPlayerStatsCooldown(
        `Failed to fetch BALLDONTLIE player stats for game ${providerGameId}. ${message}`,
        PLAYER_STATS_ERROR_COOLDOWN_MS
      );
      return null;
    }
  }
}
