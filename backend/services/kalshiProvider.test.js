import test from "node:test";
import assert from "node:assert/strict";
import { KalshiProvider } from "./providers/kalshiProvider.js";

test("KalshiProvider discovers matchup games from team markets", async () => {
  const provider = new KalshiProvider({
    fallbackProvider: {
      getSupportedGames() {
        return [];
      },
      getTodayGames() {
        return [];
      },
      getLiveGame() {
        return null;
      },
      getPlayerStats() {
        return null;
      }
    },
    kalshiService: {
      async getMarkets() {
        return {
          markets: [
            {
              ticker: "KXNBA-OKC-SAS-ML",
              title: "Will the Oklahoma City Thunder beat the San Antonio Spurs?",
              status: "active",
              yes_bid_cents: 61,
              yes_ask_cents: 63,
              no_bid_cents: 37,
              no_ask_cents: 39,
              last_price_cents: 62,
              updated_at: "2026-06-01T19:00:00Z"
            },
            {
              ticker: "KXNBA-SGA-PTS-30",
              title: "Will Shai Gilgeous-Alexander score 30+ points?",
              status: "active",
              yes_bid_cents: 55,
              yes_ask_cents: 57,
              no_bid_cents: 43,
              no_ask_cents: 45,
              last_price_cents: 56,
              updated_at: "2026-06-01T19:00:00Z"
            }
          ]
        };
      }
    }
  });

  const games = await provider.getTodayGames();

  assert.equal(games.length, 1);
  assert.equal(games[0].gameId, "kalshi-KXNBA-OKC-SAS-ML");
  assert.equal(games[0].homeTeam, "Oklahoma City Thunder");
  assert.equal(games[0].awayTeam, "San Antonio Spurs");
  assert.equal(games[0].source, "kalshi");
});

test("KalshiProvider returns unavailable player stats without a sports feed", async () => {
  const provider = new KalshiProvider({
    fallbackProvider: {
      getSupportedGames() {
        return [];
      },
      getTodayGames() {
        return [];
      },
      getLiveGame() {
        return null;
      },
      getPlayerStats() {
        return null;
      }
    },
    kalshiService: {
      async getMarkets() {
        return { markets: [] };
      }
    }
  });

  const stats = await provider.getPlayerStats("kalshi-KXNBA-OKC-SAS-ML", false);

  assert.deepEqual(stats.players, []);
  assert.equal(stats.source, "kalshi");
  assert.match(stats.unavailableReason, /Sports stats unavailable/i);
});
