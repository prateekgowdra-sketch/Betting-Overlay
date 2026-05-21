import { DEMO_GAME_ID, SUPPORTED_GAMES, demoTimeline } from "../data/demoTimeline.js";

const sequenceIndexByGame = new Map();
const activeSnapshotByGame = new Map();
const SNAPSHOT_WINDOW_MS = 5000;

function getCurrentSnapshot(gameId) {
  const currentIndex = sequenceIndexByGame.get(gameId) ?? 0;
  return demoTimeline[Math.min(currentIndex, demoTimeline.length - 1)];
}

function advanceSnapshot(gameId, demoMode) {
  const currentIndex = sequenceIndexByGame.get(gameId) ?? 0;

  if (demoMode && currentIndex < demoTimeline.length - 1) {
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

  activeSnapshotByGame.set(gameId, {
    snapshot,
    expiresAt: Date.now() + SNAPSHOT_WINDOW_MS
  });

  advanceSnapshot(gameId, demoMode);
  return snapshot;
}

class LiveSportsService {
  getSupportedGames() {
    return SUPPORTED_GAMES;
  }

  getLiveGame(gameId, demoMode) {
    if (gameId !== DEMO_GAME_ID) {
      return null;
    }

    const snapshot = getSnapshotForRequest(gameId, demoMode);

    return {
      gameId,
      title: snapshot.title,
      gameStatus: snapshot.gameStatus,
      quarter: snapshot.quarter,
      gameClock: snapshot.gameClock,
      possessionTeam: snapshot.possessionTeam,
      homeTeam: snapshot.homeTeam,
      awayTeam: snapshot.awayTeam,
      playerStats: snapshot.playerStats,
      updatedAt: new Date().toISOString()
    };
  }

  getPlayerStats(gameId, demoMode) {
    const game = this.getLiveGame(gameId, demoMode);

    if (!game) {
      return null;
    }

    return {
      gameId,
      updatedAt: game.updatedAt,
      players: game.playerStats.map((playerStat) => ({
        playerName: playerStat.playerName,
        team: playerStat.team,
        stats: {
          points: playerStat.statType === "points" ? playerStat.current : undefined,
          rebounds: playerStat.statType === "rebounds" ? playerStat.current : undefined
        }
      }))
    };
  }
}

export const liveSportsService = new LiveSportsService();
