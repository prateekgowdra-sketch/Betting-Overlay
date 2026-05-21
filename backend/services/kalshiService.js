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

class KalshiService {
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
