import { forecastMarketEdge } from "./forecasting";
import {
  KalshiMarketSide,
  KalshiMarketSnapshot,
  ResearchPaperTrade,
  ResearchSettings
} from "./types";

export interface EvCalculation {
  side: KalshiMarketSide;
  marketPriceCents: number | null;
  modelProbabilityPercent: number;
  edgePercent: number | null;
  netEdgePercent: number | null;
  expectedValueCents: number | null;
  maxProfitableBuyPriceCents: number;
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
  side: KalshiMarketSide;
  currentPriceCents: number | null;
  modelProbabilityPercent: number;
  edgePercent: number | null;
  netEdgePercent: number | null;
  confidence: "Low" | "Medium" | "High";
  suggestedRiskDollars: number;
  reason: string;
  ev: EvCalculation;
  arb: ArbitrageScan;
}

export interface PaperTradeStats {
  totalProfitLossDollars: number;
  winRatePercent: number | null;
  averageEdgePercent: number | null;
  tradeCount: number;
  openCount: number;
  settledCount: number;
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
  modelProbabilityPercent: number,
  feeSlippageBufferPercent: number
): EvCalculation {
  const marketPriceCents = getSidePrice(market, side);
  const sideModelProbability =
    side === "YES" ? modelProbabilityPercent : 100 - modelProbabilityPercent;
  const edgePercent =
    typeof marketPriceCents === "number" ? roundTenth(sideModelProbability - marketPriceCents) : null;
  const netEdgePercent =
    typeof edgePercent === "number" ? roundTenth(edgePercent - feeSlippageBufferPercent) : null;
  const expectedValueCents =
    typeof marketPriceCents === "number"
      ? roundTenth(sideModelProbability - marketPriceCents)
      : null;
  const maxProfitableBuyPriceCents = Math.max(
    0,
    Math.min(100, roundTenth(sideModelProbability - feeSlippageBufferPercent))
  );
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
    modelProbabilityPercent: roundTenth(sideModelProbability),
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
  const modelProbabilityPercent =
    typeof manualProbability === "number" && Number.isFinite(manualProbability)
      ? Math.max(1, Math.min(99, manualProbability))
      : heuristic.fairYesProbability;
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

  return {
    marketTicker: market.ticker,
    marketTitle: market.displayTitle || market.title,
    side: selectedEv.side,
    currentPriceCents: selectedEv.marketPriceCents,
    modelProbabilityPercent: selectedEv.modelProbabilityPercent,
    edgePercent: selectedEv.edgePercent,
    netEdgePercent: selectedEv.netEdgePercent,
    confidence,
    suggestedRiskDollars,
    reason: reasonParts.join(" · "),
    ev: selectedEv,
    arb: scanSameMarketArbitrage(market, settings.feeSlippageBufferPercent)
  };
}

export function summarizePaperTrades(trades: ResearchPaperTrade[]): PaperTradeStats {
  const settledTrades = trades.filter((trade) => trade.status === "settled");
  const winningTrades = settledTrades.filter((trade) => (trade.profitLossDollars ?? 0) > 0);
  const edges = trades.map((trade) => trade.edgePercent).filter((edge) => Number.isFinite(edge));

  return {
    totalProfitLossDollars: roundCents(
      settledTrades.reduce((sum, trade) => sum + (trade.profitLossDollars ?? 0), 0)
    ),
    winRatePercent:
      settledTrades.length > 0 ? roundTenth((winningTrades.length / settledTrades.length) * 100) : null,
    averageEdgePercent:
      edges.length > 0 ? roundTenth(edges.reduce((sum, edge) => sum + edge, 0) / edges.length) : null,
    tradeCount: trades.length,
    openCount: trades.filter((trade) => trade.status === "open").length,
    settledCount: settledTrades.length
  };
}
