import { createServer } from "http";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { kalshiService } from "./services/kalshiService.js";
import { liveSportsService } from "./services/liveSportsService.js";
import { manualParlayStorageService } from "./services/manualParlayStorageService.js";

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
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

loadEnv();

const PORT = Number(process.env.PORT || 3001);
const AVAILABLE_ROUTES = [
  "GET /",
  "GET /health",
  "GET /api/live/games/today",
  "GET /api/live/game/:gameId",
  "GET /api/live/players/:gameId",
  "GET /api/kalshi/balance",
  "GET /api/kalshi/positions",
  "GET /api/kalshi/market/:ticker",
  "GET /api/kalshi/positions/:gameId",
  "GET /api/parlays",
  "POST /api/parlays",
  "PUT /api/parlays/:id",
  "DELETE /api/parlays/:id"
];

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    setCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    sendJson(response, 200, {
      name: "Kalshi Live Overlay API",
      status: "running",
      sportsDataProvider: liveSportsService.getProviderName(),
      kalshiMode: kalshiService.getMode(),
      kalshiEnvironment: kalshiService.getEnvironment()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      message: "Backend running",
      sportsDataProvider: liveSportsService.getProviderName(),
      kalshiMode: kalshiService.getMode(),
      kalshiEnvironment: kalshiService.getEnvironment()
    });
    return;
  }

  const demoMode = parseDemoMode(url.searchParams);
  const liveGameMatch = url.pathname.match(/^\/api\/live\/game\/([^/]+)$/);
  const livePlayersMatch = url.pathname.match(/^\/api\/live\/players\/([^/]+)$/);
  const kalshiMatch = url.pathname.match(/^\/api\/kalshi\/positions\/([^/]+)$/);
  const kalshiMarketMatch = url.pathname.match(/^\/api\/kalshi\/market\/([^/]+)$/);
  const parlayMatch = url.pathname.match(/^\/api\/parlays\/([^/]+)$/);

  if (request.method === "GET" && url.pathname === "/api/parlays") {
    sendJson(response, 200, manualParlayStorageService.listParlays());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/parlays") {
    try {
      const body = await readJsonBody(request);
      sendJson(response, 201, manualParlayStorageService.createParlay(body));
    } catch {
      sendJson(response, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (request.method === "PUT" && parlayMatch) {
    try {
      const body = await readJsonBody(request);
      const updated = manualParlayStorageService.updateParlay(parlayMatch[1], body);

      if (!updated) {
        sendJson(response, 404, { error: "Unknown parlay id" });
        return;
      }

      sendJson(response, 200, updated);
    } catch {
      sendJson(response, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (request.method === "DELETE" && parlayMatch) {
    const deleted = manualParlayStorageService.deleteParlay(parlayMatch[1]);

    if (!deleted) {
      sendJson(response, 404, { error: "Unknown parlay id" });
      return;
    }

    sendJson(response, 200, { deleted: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/live/games/today") {
    sendJson(response, 200, await liveSportsService.getTodayGames());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/kalshi/balance") {
    try {
      sendJson(response, 200, await kalshiService.getBalance());
    } catch (error) {
      sendJson(response, 502, {
        error: "Failed to fetch Kalshi balance",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/kalshi/positions") {
    try {
      sendJson(response, 200, await kalshiService.getPositions());
    } catch (error) {
      sendJson(response, 502, {
        error: "Failed to fetch Kalshi positions",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
    return;
  }

  if (request.method === "GET" && kalshiMarketMatch) {
    try {
      const market = await kalshiService.getMarket(kalshiMarketMatch[1]);

      if (!market.market) {
        sendJson(response, 404, { error: "Unknown ticker" });
        return;
      }

      sendJson(response, 200, market);
    } catch (error) {
      sendJson(response, 502, {
        error: "Failed to fetch Kalshi market",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
    return;
  }

  if (request.method === "GET" && liveGameMatch) {
    const game = await liveSportsService.getLiveGame(liveGameMatch[1], demoMode);

    if (!game) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    sendJson(response, 200, game);
    return;
  }

  if (request.method === "GET" && livePlayersMatch) {
    const players = await liveSportsService.getPlayerStats(livePlayersMatch[1], demoMode);

    if (!players) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    sendJson(response, 200, players);
    return;
  }

  if (request.method === "GET" && kalshiMatch) {
    const game = await liveSportsService.getLiveGame(kalshiMatch[1], demoMode);

    if (!game) {
      sendJson(response, 404, { error: "Unknown gameId" });
      return;
    }

    sendJson(response, 200, kalshiService.getPositionsForGame(kalshiMatch[1], game));
    return;
  }

  if (!["GET", "POST", "PUT", "DELETE"].includes(request.method ?? "")) {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Kalshi Live Overlay backend listening on http://localhost:${PORT}`);
  console.log("Available routes:");
  for (const route of AVAILABLE_ROUTES) {
    console.log(
      `- http://localhost:${PORT}${route
        .slice(4)
        .replace(/:gameId/g, "knicks-cavs-demo")
        .replace(/:ticker/g, "KXO-NYK-CLE-MONEYLINE")}`
    );
  }
});
