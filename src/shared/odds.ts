import { OddsMovement } from "./types";

export function americanOddsToImpliedProbability(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) {
    return 0;
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  }

  const absoluteOdds = Math.abs(odds);
  return absoluteOdds / (absoluteOdds + 100);
}

function getPotentialProfitForHundredStake(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) {
    return 0;
  }

  if (odds > 0) {
    return odds;
  }

  return (100 / Math.abs(odds)) * 100;
}

export function getOddsMovement(originalOdds: number, currentOdds: number): OddsMovement {
  const originalImpliedProbability = americanOddsToImpliedProbability(originalOdds);
  const currentImpliedProbability = americanOddsToImpliedProbability(currentOdds);
  const originalProfit = getPotentialProfitForHundredStake(originalOdds);
  const currentProfit = getPotentialProfitForHundredStake(currentOdds);

  return {
    originalImpliedProbability,
    currentImpliedProbability,
    probabilityDirection:
      currentImpliedProbability > originalImpliedProbability
        ? "up"
        : currentImpliedProbability < originalImpliedProbability
          ? "down"
          : "same",
    payoutDirection:
      currentProfit > originalProfit ? "better" : currentProfit < originalProfit ? "worse" : "same"
  };
}

export function formatAmericanOdds(odds: number): string {
  return `${odds >= 0 ? "+" : ""}${odds}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amount);
}
