import { forecastMarketEdge } from "./forecasting";
import {
  KalshiMarketSide,
  KalshiMarketSnapshot,
  ResearchPaperTrade,
  ResearchSettings
} from "./types";
import {
  DetailedPaperTradeStats,
  exportResearchTradesAsCsv,
  exportResearchTradesAsJson,
  getCalibrationBuckets,
  getCategoryBuckets,
  getEdgeBuckets,
  ResearchBucket,
  settleResearchPaperTrade,
  summarizeDetailedPaperTrades
} from "./researchAnalytics";

export interface EvCalculation {
  side: KalshiMarketSide;
  marketPriceCents: number | null;
  modelProbabilityPercent: number | null;
  edgePercent: number | null;
  netEdgePercent: number | null;
  expectedValueCents: number | null;
  maxProfitableBuyPriceCents: number | null;
  label: "Positive EV" | "Neutral" | "Negative EV" | "Unavailable";
}

export interface ArbitrageScan {
  yesAskCents: number | null;
  noAskCents: number | null;
  totalCostCents: number | null;
  grossArbCents: number | null;
  netArbCents: number | null;
  isOpportunity: boolean;
}

export interface ResearchPick {
  marketTicker: string;
  marketTitle: string;
  marketCategory: string;
  side: KalshiMarketSide;
  currentPriceCents: number | null;
  modelProbabilityPercent: number | null;
  edgePercent: number | null;
  netEdgePercent: number | null;
  confidence: "Low" | "Medium" | "High";
  suggestedRiskDollars: number;
  reason: string;
  positiveSignal: string;
  negativeSignal: string;
  source: "manual" | "heuristic" | "arb_scanner";
  ev: EvCalculation;
  arb: ArbitrageScan;
}

export interface ResearchAnalytics {
  stats: DetailedPaperTradeStats;
  calibrationBuckets: ResearchBucket[];
  edgeBuckets: ResearchBucket[];
  categoryBuckets: ResearchBucket[];
}

const DEFAULT_RISK_DIVISOR = 4;

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function getSidePrice(market: KalshiMarketSnapshot, side: KalshiMarketSide): number | null {
  if (side === "YES") {
    return market.yesAskCents ?? market.yesBidCents ?? market.lastPriceCents;
  }

  if (typeof market.noAskCents === "number") return market.noAskCents;
  if (typeof market.noBidCents === "number") return market.noBidCents;
  if (typeof market.lastPriceCents === "number") {
    return Math.max(0, Math.min(100, 100 - market.lastPriceCents));
  }

  return null;
}

function getBestBid(market: KalshiMarketSnapshot, side: KalshiMarketSide): number | null {
  return side === "YES" ? market.yesBidCents : market.noBidCents;
}

function inferMarketCategory(market: KalshiMarketSnapshot): string {
  const text = [
    market.sport,
    market.competition,
    market.scope,
    market.eventTitle,
    market.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/nba|nfl|mlb|nhl|soccer|football|basketball|baseball|tennis|golf|sports?|racing|mma/.test(text)) {
    return "sports";
  }

  if (/election|candidate|senate|congress|president|politic/.test(text)) {
    return "politics";
  }

  if (/fed|inflation|cpi|gdp|recession|rate|econom/.test(text)) {
    return "economics";
  }

  if (/weather|temperature|rain|snow|hurricane|storm/.test(text)) {
    return "weather";
  }

  if (/bitcoin|crypto|ethereum|btc|eth/.test(text)) {
    return "crypto";
  }

  return "other";
}

function getPositiveSignal(
  netEdge: number | null,
  arb: ArbitrageScan,
  confidence: ResearchPick["confidence"]
): string {
  if (arb.isOpportunity) {
    return "same-market arb signal";
  }

  if (typeof netEdge === "number" && netEdge > 0) {
    return "positive net edge after buffer";
  }

  if (confidence === "High") {
    return "higher model confidence";
  }

  return "watchlist candidate";
}

function getNegativeSignal(
  netEdge: number | null,
  arb: ArbitrageScan,
  confidence: ResearchPick["confidence"]
): string {
  if (typeof netEdge !== "number") {
    return "missing current market price";
  }

  if (netEdge <= 0) {
    return "edge does not clear buffer";
  }

  if (!arb.isOpportunity && typeof arb.totalCostCents === "number" && arb.totalCostCents >= 100) {
    return "no same-market arb";
  }

  if (confidence === "Low") {
    return "low model confidence";
  }

  return "execution risk";
}

export function getDefaultResearchSettings(): ResearchSettings {
  return {
    enableRealTrading: false,
    maxPaperTradeDollars: 5,
    maxDailyRiskDollars: 25,
    minimumEdgePercent: 3,
    feeSlippageBufferPercent: 2,
    manualModelProbability: 50
  };
}

export function calculateEv(
  market: KalshiMarketSnapshot,
  side: KalshiMarketSide,
  modelProbabilityPercent: number | null,
  feeSlippageBufferPercent: number
): EvCalculation {
  const marketPriceCents = getSidePrice(market, side);
  const sideModelProbability =
    typeof modelProbabilityPercent === "number"
      ? side === "YES"
        ? modelProbabilityPercent
        : 100 - modelProbabilityPercent
      : null;
  const edgePercent =
    typeof marketPriceCents === "number" && typeof sideModelProbability === "number"
      ? roundTenth(sideModelProbability - marketPriceCents)
      : null;
  const netEdgePercent =
    typeof edgePercent === "number" ? roundTenth(edgePercent - feeSlippageBufferPercent) : null;
  const expectedValueCents =
    typeof marketPriceCents === "number" && typeof sideModelProbability === "number"
      ? roundTenth(sideModelProbability - marketPriceCents)
      : null;
  const maxProfitableBuyPriceCents =
    typeof sideModelProbability === "number"
      ? Math.max(0, Math.min(100, roundTenth(sideModelProbability - feeSlippageBufferPercent)))
      : null;
  const label =
    typeof netEdgePercent !== "number"
      ? "Unavailable"
      : netEdgePercent > 0
        ? "Positive EV"
        : Math.abs(netEdgePercent) < 1
          ? "Neutral"
          : "Negative EV";

  return {
    side,
    marketPriceCents,
    modelProbabilityPercent:
      typeof sideModelProbability === "number" ? roundTenth(sideModelProbability) : null,
    edgePercent,
    netEdgePercent,
    expectedValueCents,
    maxProfitableBuyPriceCents,
    label
  };
}

export function scanSameMarketArbitrage(
  market: KalshiMarketSnapshot,
  feeSlippageBufferPercent: number
): ArbitrageScan {
  const bestNoBid = getBestBid(market, "NO");
  const bestYesBid = getBestBid(market, "YES");
  const yesAskCents = typeof bestNoBid === "number" ? 100 - bestNoBid : market.yesAskCents;
  const noAskCents = typeof bestYesBid === "number" ? 100 - bestYesBid : market.noAskCents;
  const totalCostCents =
    typeof yesAskCents === "number" && typeof noAskCents === "number"
      ? roundTenth(yesAskCents + noAskCents)
      : null;
  const grossArbCents =
    typeof totalCostCents === "number" ? roundTenth(100 - totalCostCents) : null;
  const netArbCents =
    typeof grossArbCents === "number" ? roundTenth(grossArbCents - feeSlippageBufferPercent) : null;

  return {
    yesAskCents,
    noAskCents,
    totalCostCents,
    grossArbCents,
    netArbCents,
    isOpportunity: typeof netArbCents === "number" && netArbCents > 0
  };
}

export function generateResearchPick(
  market: KalshiMarketSnapshot,
  settings: ResearchSettings,
  manualProbability?: number
): ResearchPick {
  const heuristic = forecastMarketEdge(market, "YES", getSidePrice(market, "YES"));
  const isManualProbability = typeof manualProbability === "number" && Number.isFinite(manualProbability);
  const marketYesProbability = getSidePrice(market, "YES");
  const modelProbabilityPercent =
    isManualProbability
      ? Math.max(1, Math.min(99, manualProbability))
      : heuristic.fairYesProbability ?? marketYesProbability;
  const yesEv = calculateEv(market, "YES", modelProbabilityPercent, settings.feeSlippageBufferPercent);
  const noEv = calculateEv(market, "NO", modelProbabilityPercent, settings.feeSlippageBufferPercent);
  const selectedEv =
    (yesEv.netEdgePercent ?? -Infinity) >= (noEv.netEdgePercent ?? -Infinity) ? yesEv : noEv;
  const confidence = heuristic.confidence;
  const netEdge = selectedEv.netEdgePercent ?? 0;
  const riskScale = Math.max(0, Math.min(1, netEdge / Math.max(1, settings.minimumEdgePercent * 2)));
  const suggestedRiskDollars =
    selectedEv.label === "Positive EV"
      ? roundCents(Math.min(settings.maxPaperTradeDollars, settings.maxDailyRiskDollars / DEFAULT_RISK_DIVISOR) * riskScale)
      : 0;
  const reasonParts = [
    `${selectedEv.label}`,
    `net edge ${typeof selectedEv.netEdgePercent === "number" ? `${selectedEv.netEdgePercent.toFixed(1)}%` : "--"}`,
    `confidence ${confidence}`,
    heuristic.movementForecast.toLowerCase()
  ];
  const arb = scanSameMarketArbitrage(market, settings.feeSlippageBufferPercent);
  const source = arb.isOpportunity ? "arb_scanner" : isManualProbability ? "manual" : "heuristic";
  const positiveSignal = getPositiveSignal(selectedEv.netEdgePercent, arb, confidence);
  const negativeSignal = getNegativeSignal(selectedEv.netEdgePercent, arb, confidence);

  return {
    marketTicker: market.ticker,
    marketTitle: market.displayTitle || market.title,
    marketCategory: inferMarketCategory(market),
    side: selectedEv.side,
    currentPriceCents: selectedEv.marketPriceCents,
    modelProbabilityPercent: selectedEv.modelProbabilityPercent,
    edgePercent: selectedEv.edgePercent,
    netEdgePercent: selectedEv.netEdgePercent,
    confidence,
    suggestedRiskDollars,
    reason: [...reasonParts, positiveSignal, negativeSignal].join(" · "),
    positiveSignal,
    negativeSignal,
    source,
    ev: selectedEv,
    arb
  };
}

export function settlePaperTrade(
  trade: ResearchPaperTrade,
  exitValueCents: number
): ResearchPaperTrade {
  return {
    ...settleResearchPaperTrade(trade, exitValueCents),
    settledAt: new Date().toISOString()
  };
}

export function summarizePaperTrades(trades: ResearchPaperTrade[]): ResearchAnalytics {
  return {
    stats: summarizeDetailedPaperTrades(trades),
    calibrationBuckets: getCalibrationBuckets(trades),
    edgeBuckets: getEdgeBuckets(trades),
    categoryBuckets: getCategoryBuckets(trades)
  };
}

export { exportResearchTradesAsCsv, exportResearchTradesAsJson };
