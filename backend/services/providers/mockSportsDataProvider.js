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

export class MockSportsDataProvider {
  getName() {
    return "mock";
  }

  getSupportedGames() {
    return SUPPORTED_GAMES;
  }

  getTodayGames() {
    return SUPPORTED_GAMES.map((game) => {
      const snapshot = getCurrentSnapshot(game.id);

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
        source: game.source
      };
    });
  }

  getLiveGame(gameId, demoMode) {
    const snapshot = getSnapshotForRequest(gameId, demoMode);

    if (!snapshot) {
      return null;
    }

    return {
      gameId,
      title: snapshot.title,
      gameStatus: snapshot.gameStatus,
      quarter: snapshot.quarter,
      period: snapshot.quarter,
      gameClock: snapshot.gameClock,
      clock: snapshot.gameClock,
      possessionTeam: snapshot.possessionTeam,
      homeTeam: snapshot.homeTeam,
      awayTeam: snapshot.awayTeam,
      teamScore: {
        home: snapshot.homeTeam.score,
        away: snapshot.awayTeam.score
      },
      playerStats: snapshot.playerStats,
      updatedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
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
      lastUpdated: game.updatedAt,
      period: game.period,
      clock: game.clock,
      teamScore: game.teamScore,
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
