import { createServer } from "http";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { kalshiService } from "./services/kalshiService.js";
import { liveSportsService } from "./services/liveSportsService.js";

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

function parseDemoMode(searchParams) {
  return searchParams.get("demoMode") !== "false";
}

loadEnv();

const PORT = Number(process.env.PORT || 3001);

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
  const liveGameMatch = url.pathname.match(/^\/api\/live\/game\/([^/]+)$/);
  const livePlayersMatch = url.pathname.match(/^\/api\/live\/players\/([^/]+)$/);
  const kalshiMatch = url.pathname.match(/^\/api\/kalshi\/positions\/([^/]+)$/);

  if (liveGameMatch) {
    const game = liveSportsService.getLiveGame(liveGameMatch[1], demoMode);

    if (!game) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    sendJson(response, 200, game);
    return;
  }

  if (livePlayersMatch) {
    const players = liveSportsService.getPlayerStats(livePlayersMatch[1], demoMode);

    if (!players) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    sendJson(response, 200, players);
    return;
  }

  if (kalshiMatch) {
    const game = liveSportsService.getLiveGame(kalshiMatch[1], demoMode);

    if (!game) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    sendJson(response, 200, kalshiService.getPositionsForGame(kalshiMatch[1], game));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Kalshi Live Overlay backend listening on http://localhost:${PORT}`);
});
