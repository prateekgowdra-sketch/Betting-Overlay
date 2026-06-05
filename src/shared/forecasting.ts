import { KalshiComboTracker, KalshiMarketSide, KalshiMarketSnapshot } from "./types";

export type ForecastConfidence = "Low" | "Medium" | "High";
export type ForecastRiskLevel = "Low" | "Medium" | "High";

export interface MarketForecast {
  fairYesProbability: number | null;
  fairSideProbability: number | null;
  currentSideProbability: number | null;
  edgeCents: number | null;
  confidence: ForecastConfidence;
  movementForecast: "Likely up" | "Stable" | "Likely down" | "Unavailable";
  featureSummary: {
    currentPriceCents: number | null;
    recentMovementCents: number | null;
    volume: number | null;
    liquidityCents: number | null;
    bidAskSpreadCents: number | null;
    hoursUntilClose: number | null;
  };
  basedOn: string[];
}

export interface ComboForecastSummary {
  averageEdgeCents: number | null;
  riskLevel: ForecastRiskLevel;
  estimatedPayout: number | null;
  estimatedProfit: number | null;
  weakLegCount: number;
  correlationWarning: boolean;
}

function clampProbability(value: number): number {
  return Math.max(1, Math.min(99, value));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function getYesProbability(market?: KalshiMarketSnapshot): number | null {
  if (!market) {
    return null;
  }

  if (market.isResolved) {
    if (!market.resultKnown || !market.winningSide) {
      return null;
    }

    return market.winningSide === "YES" ? 100 : 0;
  }

  return market.yesAskCents ?? market.yesBidCents ?? market.lastPriceCents;
}

function getSideProbability(
  market: KalshiMarketSnapshot | undefined,
  side: KalshiMarketSide
): number | null {
  if (!market) {
    return null;
  }

  if (market.isResolved) {
    if (!market.resultKnown || !market.winningSide) {
      return null;
    }

    return market.winningSide === side ? 100 : 0;
  }

  if (side === "YES") {
    return market.yesAskCents ?? market.yesBidCents ?? market.lastPriceCents;
  }

  if (typeof market.noAskCents === "number") {
    return market.noAskCents;
  }

  if (typeof market.noBidCents === "number") {
    return market.noBidCents;
  }

  if (typeof market.lastPriceCents === "number") {
    return Math.max(0, Math.min(100, 100 - market.lastPriceCents));
  }

  return null;
}

function getBidAskSpreadCents(market?: KalshiMarketSnapshot): number | null {
  if (
    typeof market?.yesBidCents === "number" &&
    typeof market.yesAskCents === "number" &&
    market.yesAskCents >= market.yesBidCents
  ) {
    return market.yesAskCents - market.yesBidCents;
  }

  if (
    typeof market?.noBidCents === "number" &&
    typeof market.noAskCents === "number" &&
    market.noAskCents >= market.noBidCents
  ) {
    return market.noAskCents - market.noBidCents;
  }

  return null;
}

function getHoursUntilClose(market?: KalshiMarketSnapshot): number | null {
  if (!market?.closeTime || market.isResolved) {
    return null;
  }

  const closeTime = new Date(market.closeTime).getTime();

  if (!Number.isFinite(closeTime)) {
    return null;
  }

  return Math.max(0, (closeTime - Date.now()) / 3600000);
}

function getConfidence(
  market: KalshiMarketSnapshot | undefined,
  spreadCents: number | null,
  hoursUntilClose: number | null
): ForecastConfidence {
  let score = 0;

  if (typeof market?.volume === "number" && market.volume >= 1000) score += 2;
  else if (typeof market?.volume === "number" && market.volume >= 100) score += 1;

  if (typeof market?.liquidityCents === "number" && market.liquidityCents >= 100000) score += 2;
  else if (typeof market?.liquidityCents === "number" && market.liquidityCents >= 10000) score += 1;

  if (typeof spreadCents === "number" && spreadCents <= 3) score += 2;
  else if (typeof spreadCents === "number" && spreadCents <= 8) score += 1;

  if (typeof market?.previousPriceCents === "number") score += 1;
  if (typeof hoursUntilClose === "number" && hoursUntilClose > 0.5) score += 1;

  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

export function forecastMarketEdge(
  market: KalshiMarketSnapshot | undefined,
  side: KalshiMarketSide,
  fallbackSideProbability?: number | null
): MarketForecast {
  const fallbackYesProbability =
    typeof fallbackSideProbability === "number"
      ? side === "YES"
        ? fallbackSideProbability
        : 100 - fallbackSideProbability
      : null;
  const currentYesProbability = getYesProbability(market) ?? fallbackYesProbability;
  const currentSideProbability = getSideProbability(market, side) ?? fallbackSideProbability ?? null;
  const recentMovementCents =
    typeof currentYesProbability === "number" && typeof market?.previousPriceCents === "number"
      ? currentYesProbability - market.previousPriceCents
      : null;
  const spreadCents = getBidAskSpreadCents(market);
  const hoursUntilClose = getHoursUntilClose(market);

  if (!market || typeof currentYesProbability !== "number" || market.isResolved) {
    const fallbackFairSideProbability =
      typeof currentSideProbability === "number" ? currentSideProbability : null;

    return {
      fairYesProbability: typeof currentYesProbability === "number" ? currentYesProbability : null,
      fairSideProbability: fallbackFairSideProbability,
      currentSideProbability,
      edgeCents:
        typeof fallbackSideProbability === "number" && typeof currentSideProbability === "number"
          ? roundTenth(currentSideProbability - currentSideProbability)
          : null,
      confidence: "Low",
      movementForecast: market?.isResolved ? "Unavailable" : "Stable",
      featureSummary: {
        currentPriceCents: currentYesProbability,
        recentMovementCents,
        volume: market?.volume ?? null,
        liquidityCents: market?.liquidityCents ?? null,
        bidAskSpreadCents: spreadCents,
        hoursUntilClose
      },
      basedOn: ["current price", "market status"]
    };
  }

  const momentumAdjustment = Math.max(-5, Math.min(5, (recentMovementCents ?? 0) * 0.45));
  const volumeAdjustment =
    typeof market.volume === "number" ? Math.max(-2, Math.min(3, Math.log10(market.volume + 1) - 2)) : 0;
  const liquidityAdjustment =
    typeof market.liquidityCents === "number"
      ? Math.max(-1, Math.min(2, Math.log10(market.liquidityCents / 100 + 1) - 2.5))
      : 0;
  const spreadPenalty = typeof spreadCents === "number" ? -Math.min(4, spreadCents * 0.25) : -1.25;
  const closeAdjustment =
    typeof hoursUntilClose === "number" && hoursUntilClose < 2
      ? Math.max(-2.5, Math.min(2.5, ((recentMovementCents ?? 0) * (2 - hoursUntilClose)) / 4))
      : 0;

  const fairYesProbability = clampProbability(
    currentYesProbability +
      momentumAdjustment +
      volumeAdjustment +
      liquidityAdjustment +
      spreadPenalty +
      closeAdjustment
  );
  const fairSideProbability = side === "YES" ? fairYesProbability : 100 - fairYesProbability;
  const edgeCents =
    typeof currentSideProbability === "number"
      ? roundTenth(fairSideProbability - currentSideProbability)
      : null;
  const confidence = getConfidence(market, spreadCents, hoursUntilClose);
  const movementForecast =
    typeof edgeCents !== "number"
      ? "Unavailable"
      : edgeCents >= 3
        ? "Likely up"
        : edgeCents <= -3
          ? "Likely down"
          : "Stable";

  return {
    fairYesProbability: roundTenth(fairYesProbability),
    fairSideProbability: roundTenth(fairSideProbability),
    currentSideProbability,
    edgeCents,
    confidence,
    movementForecast,
    featureSummary: {
      currentPriceCents: currentYesProbability,
      recentMovementCents,
      volume: market.volume ?? null,
      liquidityCents: market.liquidityCents ?? null,
      bidAskSpreadCents: spreadCents,
      hoursUntilClose: typeof hoursUntilClose === "number" ? roundTenth(hoursUntilClose) : null
    },
    basedOn: ["current price", "recent movement", "volume", "liquidity", "spread", "time until close"]
  };
}

export function summarizeComboForecast(
  combo: KalshiComboTracker,
  marketsByTicker: Record<string, KalshiMarketSnapshot>,
  estimatedPayout: number | null
): ComboForecastSummary {
  const forecasts = combo.legs.map((leg) => ({
    leg,
    forecast: forecastMarketEdge(marketsByTicker[leg.ticker], leg.userSide, leg.entryPriceCents)
  }));
  const edges = forecasts
    .map(({ forecast }) => forecast.edgeCents)
    .filter((edge): edge is number => typeof edge === "number");
  const averageEdgeCents =
    edges.length > 0 ? roundTenth(edges.reduce((sum, edge) => sum + edge, 0) / edges.length) : null;
  const weakLegCount = edges.filter((edge) => edge < 1).length;
  const lowConfidenceCount = forecasts.filter(({ forecast }) => forecast.confidence === "Low").length;
  const eventTickerCounts = combo.legs.reduce<Record<string, number>>((counts, leg) => {
    if (leg.eventTicker) {
      counts[leg.eventTicker] = (counts[leg.eventTicker] ?? 0) + 1;
    }

    return counts;
  }, {});
  const correlationWarning = Object.values(eventTickerCounts).some((count) => count > 1);
  const riskLevel: ForecastRiskLevel =
    weakLegCount > 0 || lowConfidenceCount >= 2 || correlationWarning
      ? "High"
      : lowConfidenceCount === 1 || combo.legs.length >= 4
        ? "Medium"
        : "Low";

  return {
    averageEdgeCents,
    riskLevel,
    estimatedPayout,
    estimatedProfit:
      typeof estimatedPayout === "number" ? Math.max(0, estimatedPayout - combo.amountRisked) : null,
    weakLegCount,
    correlationWarning
  };
}
