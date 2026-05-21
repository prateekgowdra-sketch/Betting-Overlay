import { createServer } from "http";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

function loadEnv() {
  const envPath = join(process.cwd(), "backend", ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const PORT = Number(process.env.PORT || 3001);
const DEMO_GAME_ID = "knicks-cavs-demo";

const timeline = [
  {
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "10:58",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 82 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 77 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 18 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 8 },
      "Donovan Mitchell": { team: "CLE", points: 21 }
    }
  },
  {
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "9:21",
    possessionTeam: "CLE",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 84 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 80 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 19 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 8 },
      "Donovan Mitchell": { team: "CLE", points: 22 }
    }
  },
  {
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "6:14",
    possessionTeam: "CLE",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 88 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 84 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 21 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 9 },
      "Donovan Mitchell": { team: "CLE", points: 24 }
    }
  },
  {
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "2:48",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 93 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 89 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 22 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 9 },
      "Donovan Mitchell": { team: "CLE", points: 25 }
    }
  },
  {
    gameStatus: "live",
    quarter: "Q4",
    gameClock: "11:37",
    possessionTeam: "CLE",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 95 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 92 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 23 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 9 },
      "Donovan Mitchell": { team: "CLE", points: 26 }
    }
  },
  {
    gameStatus: "live",
    quarter: "Q4",
    gameClock: "8:42",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 101 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 95 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 24 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 10 },
      "Donovan Mitchell": { team: "CLE", points: 27 }
    }
  },
  {
    gameStatus: "live",
    quarter: "Q4",
    gameClock: "2:11",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 108 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 102 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 27 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 11 },
      "Donovan Mitchell": { team: "CLE", points: 29 }
    }
  },
  {
    gameStatus: "final",
    quarter: "Q4",
    gameClock: "0:00",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 112 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 106 },
    players: {
      "Jalen Brunson": { team: "NYK", points: 29 },
      "Karl-Anthony Towns": { team: "NYK", rebounds: 12 },
      "Donovan Mitchell": { team: "CLE", points: 31 }
    }
  }
];

const sequenceIndexByGame = new Map();
const activeSnapshotByGame = new Map();
const SNAPSHOT_WINDOW_MS = 5000;

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function getCurrentSnapshot(gameId) {
  const currentIndex = sequenceIndexByGame.get(gameId) ?? 0;
  return timeline[Math.min(currentIndex, timeline.length - 1)];
}

function advanceSnapshot(gameId, demoMode) {
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

  activeSnapshotByGame.set(gameId, {
    snapshot,
    expiresAt: Date.now() + SNAPSHOT_WINDOW_MS
  });

  advanceSnapshot(gameId, demoMode);
  return snapshot;
}

function parseDemoMode(searchParams) {
  return searchParams.get("demoMode") !== "false";
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    setCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const demoMode = parseDemoMode(url.searchParams);
  const gameMatch = url.pathname.match(/^\/api\/live\/game\/([^/]+)$/);
  const playersMatch = url.pathname.match(/^\/api\/live\/players\/([^/]+)$/);

  if (gameMatch) {
    const gameId = gameMatch[1];

    if (gameId !== DEMO_GAME_ID) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    const snapshot = getSnapshotForRequest(gameId, demoMode);

    sendJson(response, 200, {
      gameId,
      gameStatus: snapshot.gameStatus,
      quarter: snapshot.quarter,
      gameClock: snapshot.gameClock,
      possessionTeam: snapshot.possessionTeam,
      homeTeam: snapshot.homeTeam,
      awayTeam: snapshot.awayTeam,
      updatedAt: new Date().toISOString()
    });
    return;
  }

  if (playersMatch) {
    const gameId = playersMatch[1];

    if (gameId !== DEMO_GAME_ID) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    const names = (url.searchParams.get("names") || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const snapshot = getSnapshotForRequest(gameId, demoMode);

    sendJson(response, 200, {
      gameId,
      updatedAt: new Date().toISOString(),
      players: names.map((playerName) => {
        const player = snapshot.players[playerName];

        return {
          playerName,
          team: player?.team ?? "NYK",
          stats: {
            points: player?.points,
            rebounds: player?.rebounds
          }
        };
      })
    });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Kalshi Live Overlay backend listening on http://localhost:${PORT}`);
});
