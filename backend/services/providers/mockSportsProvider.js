import { DEMO_TIMELINES_BY_GAME, SUPPORTED_GAMES } from "../../data/demoTimeline.js";

const sequenceIndexByGame = new Map();
const activeSnapshotByGame = new Map();
const SNAPSHOT_WINDOW_MS = 5000;

function getCurrentSnapshot(gameId) {
  const currentIndex = sequenceIndexByGame.get(gameId) ?? 0;
  const timeline = DEMO_TIMELINES_BY_GAME[gameId];

  if (!timeline) {
    return null;
  }

  return timeline[Math.min(currentIndex, timeline.length - 1)];
}

function advanceSnapshot(gameId, demoMode) {
  const timeline = DEMO_TIMELINES_BY_GAME[gameId];

  if (!timeline) {
    return;
  }

  const currentIndex = sequenceIndexByGame.get(gameId) ?? 0;

  if (demoMode && currentIndex < timeline.length - 1) {
    sequenceIndexByGame.set(gameId, currentIndex + 1);
    return;
  }

  sequenceIndexByGame.set(gameId, currentIndex);
}

function getSnapshotForRequest(gameId, demoMode) {
  const existingWindow = activeSnapshotByGame.get(gameId);

  if (existingWindow && existingWindow.expiresAt > Date.now()) {
    return existingWindow.snapshot;
  }

  const snapshot = getCurrentSnapshot(gameId);

  if (!snapshot) {
    return null;
  }

  activeSnapshotByGame.set(gameId, {
    snapshot,
    expiresAt: Date.now() + SNAPSHOT_WINDOW_MS
  });

  advanceSnapshot(gameId, demoMode);
  return snapshot;
}

function normalizeTodayGame(game, snapshot) {
  return {
    gameId: game.id,
    providerGameId: game.providerGameId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeAbbr: game.homeAbbr,
    awayAbbr: game.awayAbbr,
    scheduledTime: game.scheduledTime,
    status: snapshot?.gameStatus ?? "upcoming",
    period: snapshot?.quarter ?? "Pregame",
    clock: snapshot?.gameClock ?? "--:--",
    homeScore: snapshot?.homeTeam.score ?? 0,
    awayScore: snapshot?.awayTeam.score ?? 0,
    source: "mock"
  };
}

function normalizeGame(gameId, snapshot) {
  return {
    gameId,
    providerGameId: `${gameId}-snapshot`,
    source: "mock",
    title: snapshot.title,
    gameStatus: snapshot.gameStatus,
    quarter: snapshot.quarter,
    period: snapshot.quarter,
    gameClock: snapshot.gameClock,
    clock: snapshot.gameClock,
    possessionTeam: snapshot.possessionTeam,
    homeTeam: snapshot.homeTeam,
    awayTeam: snapshot.awayTeam,
    homeScore: snapshot.homeTeam.score,
    awayScore: snapshot.awayTeam.score,
    teamScore: {
      home: snapshot.homeTeam.score,
      away: snapshot.awayTeam.score
    },
    playerStats: snapshot.playerStats,
    updatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
}

function normalizePlayers(game) {
  return {
    gameId: game.gameId,
    source: "mock",
    updatedAt: game.updatedAt,
    lastUpdated: game.updatedAt,
    period: game.period,
    clock: game.clock,
    players: game.playerStats.map((playerStat) => ({
      playerId: `${playerStat.team}-${playerStat.playerName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: playerStat.playerName,
      team: playerStat.team,
      points: playerStat.statType === "points" ? playerStat.current : undefined,
      rebounds: playerStat.statType === "rebounds" ? playerStat.current : undefined,
      assists: undefined,
      threesMade: playerStat.statType === "threes_made" ? playerStat.current : undefined,
      steals: undefined,
      blocks: undefined,
      turnovers: undefined
    }))
  };
}

export class MockSportsProvider {
  getName() {
    return "mock";
  }

  getSupportedGames() {
    return SUPPORTED_GAMES;
  }

  getTodayGames() {
    return SUPPORTED_GAMES.map((game) => normalizeTodayGame(game, getCurrentSnapshot(game.id)));
  }

  async getLiveGame(gameId, demoMode) {
    const snapshot = getSnapshotForRequest(gameId, demoMode);

    if (!snapshot) {
      return null;
    }

    return normalizeGame(gameId, snapshot);
  }

  async getPlayerStats(gameId, demoMode) {
    const game = await this.getLiveGame(gameId, demoMode);

    if (!game) {
      return null;
    }

    return normalizePlayers(game);
  }
}
