import { kalshiClient } from "./kalshiClient.js";
import { parseKalshiMarketTitle } from "./marketParsingService.js";

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function currentByPlayer(game, playerName, statType) {
  return (
    game.playerStats.find(
      (playerStat) =>
        playerStat.playerName === playerName && playerStat.statType === statType
    )?.current ?? 0
  );
}

function getNowIso() {
  return new Date().toISOString();
}

function getMockPortfolioPositions() {
  return [
    {
      ticker: "KXO-NYK-CLE-MONEYLINE",
      market_title: "Will the Knicks beat the Cavaliers?",
      side: "YES",
      position_contracts: 10,
      entry_price_cents: 48,
      current_price_cents: 62,
      realized_pnl_cents: 0,
      unrealized_pnl_cents: 140,
      updated_at: getNowIso()
    },
    {
      ticker: "KXO-JBRUNSON-PTS-25",
      market_title: "Will Jalen Brunson score 25+ points?",
      side: "YES",
      position_contracts: 5,
      entry_price_cents: 52,
      current_price_cents: 67,
      realized_pnl_cents: 0,
      unrealized_pnl_cents: 75,
      updated_at: getNowIso()
    }
  ];
}

function getMockMarkets() {
  return [
    {
      ticker: "KXO-NYK-CLE-MONEYLINE",
      title: "Will the Knicks beat the Cavaliers?",
      status: "active",
      yes_bid_cents: 60,
      yes_ask_cents: 64,
      last_price_cents: 62
    },
    {
      ticker: "KXO-JBRUNSON-PTS-25",
      title: "Will Jalen Brunson score 25+ points?",
      status: "active",
      yes_bid_cents: 65,
      yes_ask_cents: 69,
      last_price_cents: 67
    }
  ];
}

class KalshiService {
  getMode() {
    return kalshiClient.getMode();
  }

  getEnvironment() {
    return kalshiClient.getEnvironment();
  }

  async getBalance() {
    if (!kalshiClient.isConfiguredForRealMode()) {
      return {
        mode: "mock",
        environment: this.getEnvironment(),
        balanceCents: 100000,
        availableBalanceCents: 100000,
        pendingBalanceCents: 0,
        currency: "USD",
        updatedAt: getNowIso()
      };
    }

    const response = await kalshiClient.getBalance();

    return {
      mode: "real",
      environment: this.getEnvironment(),
      balance: response
    };
  }

  async getPositions() {
    if (!kalshiClient.isConfiguredForRealMode()) {
      return {
        mode: "mock",
        environment: this.getEnvironment(),
        updatedAt: getNowIso(),
        positions: getMockPortfolioPositions()
      };
    }

    const response = await kalshiClient.getPositions();

    return {
      mode: "real",
      environment: this.getEnvironment(),
      updatedAt: getNowIso(),
      positions: response.market_positions ?? [],
      raw: response
    };
  }

  async getMarket(ticker) {
    if (!kalshiClient.isConfiguredForRealMode()) {
      const market = getMockMarkets().find((entry) => entry.ticker === ticker) ?? null;

      return {
        mode: "mock",
        environment: this.getEnvironment(),
        market
      };
    }

    const response = await kalshiClient.getMarket(ticker);

    return {
      mode: "real",
      environment: this.getEnvironment(),
      market: response.market ?? null,
      raw: response
    };
  }

  async getMarkets(query = {}) {
    if (!kalshiClient.isConfiguredForRealMode()) {
      return {
        mode: "mock",
        environment: this.getEnvironment(),
        markets: getMockMarkets()
      };
    }

    const response = await kalshiClient.getMarkets(query);

    return {
      mode: "real",
      environment: this.getEnvironment(),
      markets: response.markets ?? [],
      cursor: response.cursor ?? null,
      raw: response
    };
  }

  getPositionsForGame(gameId, game) {
    const teamMarketTitle = "Will the Knicks beat the Cavaliers?";
    const brunsonMarketTitle = "Will Jalen Brunson score 25+ points?";
    const parsedTeamMarket = parseKalshiMarketTitle(teamMarketTitle);
    const parsedBrunsonMarket = parseKalshiMarketTitle(brunsonMarketTitle);
    const brunsonPoints = currentByPlayer(game, "Jalen Brunson", "points");
    const margin = game.homeTeam.score - game.awayTeam.score;
    const brunsonRemaining = Math.max(0, 25 - brunsonPoints);

    return {
      gameId,
      updatedAt: game.updatedAt,
      positions: [
        {
          id: "knicks-moneyline",
          marketTitle: teamMarketTitle,
          platform: "Kalshi",
          side: "YES",
          contracts: 10,
          entryPriceCents: 48,
          currentPriceCents: margin >= 8 ? 76 : margin >= 4 ? 62 : margin > 0 ? 55 : 34,
          whatNeedsToHappen:
            margin > 0
              ? "The Knicks need to stay in front until the final buzzer."
              : `The Knicks need to erase a ${Math.abs(margin)}-point deficit and win.`,
          parsedMarket: parsedTeamMarket
        },
        {
          id: "brunson-25",
          marketTitle: brunsonMarketTitle,
          platform: "Kalshi",
          side: "YES",
          contracts: 5,
          entryPriceCents: 52,
          currentPriceCents:
            brunsonRemaining === 0 ? 91 : brunsonPoints >= 24 ? 67 : brunsonPoints >= 20 ? 59 : 44,
          whatNeedsToHappen:
            brunsonRemaining === 0
              ? "Brunson has already cleared 25 points."
              : `${brunsonRemaining} more point${brunsonRemaining === 1 ? "" : "s"} from Brunson to cash.`,
          marketLeg: parsedBrunsonMarket.marketLeg
            ? {
                ...parsedBrunsonMarket.marketLeg,
                current: brunsonPoints,
                progress: clampPercent((brunsonPoints / parsedBrunsonMarket.marketLeg.target) * 100),
                status: brunsonPoints >= parsedBrunsonMarket.marketLeg.target ? "won" : "sweating",
                whatNeedsToHappen:
                  brunsonRemaining === 0
                    ? "Brunson has already cleared 25 points."
                    : `${brunsonRemaining} more point${brunsonRemaining === 1 ? "" : "s"} from Brunson to cash.`
              }
            : undefined,
          parsedMarket: parsedBrunsonMarket
        }
      ]
    };
  }

  getMarketHealth(position) {
    return clampPercent((position.currentPriceCents / 100) * 100);
  }
}

export const kalshiService = new KalshiService();
