export interface ResearchAnalyticsTrade {
  id: string;
  side: "YES" | "NO";
  entryPriceCents: number;
  modelProbabilityPercent: number;
  hitRating?: number | null;
  bestBetScore?: number | null;
  edgePercent: number;
  netEdgePercent?: number | null;
  suggestedRiskDollars: number;
  riskInputDollars?: number | null;
  contracts?: number | null;
  actualCostDollars?: number | null;
  maxProfitDollars?: number | null;
  maxLossDollars?: number | null;
  expectedValueDollars?: number | null;
  expectedRoiPercent?: number | null;
  status: "open" | "settled" | "exited";
  marketCategory?: string | null;
  exitValueCents?: number | null;
  exitPriceCents?: number | null;
  exitValueDollars?: number | null;
  profitLossDollars?: number | null;
  realizedPnlDollars?: number | null;
  settlementResult?: "WIN" | "LOSS" | "EXIT" | null;
}

export interface DetailedPaperTradeStats {
  totalProfitLossDollars: number;
  totalDollarsRisked: number;
  roiPercent: number | null;
  winRatePercent: number | null;
  averageEntryPriceCents: number | null;
  averageModelProbabilityPercent: number | null;
  averageBestBetScore: number | null;
  averageEdgePercent: number | null;
  averageNetEdgePercent: number | null;
  averageExpectedRoiPercent: number | null;
  tradeCount: number;
  openCount: number;
  settledCount: number;
  bestTrade: ResearchAnalyticsTrade | null;
  worstTrade: ResearchAnalyticsTrade | null;
}

export interface ResearchBucket {
  label: string;
  tradeCount: number;
  predictedAverageProbabilityPercent: number | null;
  winRatePercent: number | null;
  roiPercent: number | null;
  profitLossDollars: number;
}

export interface PaperTradeCalculation {
  side: "YES" | "NO";
  entryPriceCents: number;
  modelProbabilityPercent: number;
  winProbabilityPercent: number;
  riskInputDollars: number;
  contracts: number;
  actualCostDollars: number;
  payoutIfWinDollars: number;
  maxProfitDollars: number;
  maxLossDollars: number;
  expectedValueDollars: number;
  expectedRoiPercent: number | null;
}

export interface PaperTradeExitScenario {
  label: string;
  exitPriceCents: number;
  cashoutValueDollars: number;
  profitLossDollars: number;
  roiPercent: number | null;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? roundTenth(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function getTradeRisk(trade: ResearchAnalyticsTrade): number {
  if (typeof trade.actualCostDollars === "number" && Number.isFinite(trade.actualCostDollars)) {
    return Math.max(0, trade.actualCostDollars);
  }

  return Math.max(0, trade.suggestedRiskDollars);
}

function getSettledTrades(trades: ResearchAnalyticsTrade[]): ResearchAnalyticsTrade[] {
  return trades.filter((trade) => trade.status === "settled" || trade.status === "exited");
}

function getWinRate(trades: ResearchAnalyticsTrade[]): number | null {
  if (trades.length === 0) {
    return null;
  }

  const wins = trades.filter((trade) => (trade.profitLossDollars ?? 0) > 0).length;
  return roundTenth((wins / trades.length) * 100);
}

function getRoi(trades: ResearchAnalyticsTrade[]): number | null {
  const totalRisk = trades.reduce((sum, trade) => sum + getTradeRisk(trade), 0);

  if (totalRisk <= 0) {
    return null;
  }

  const totalProfitLoss = trades.reduce((sum, trade) => sum + (trade.profitLossDollars ?? 0), 0);
  return roundTenth((totalProfitLoss / totalRisk) * 100);
}

function getProfitLoss(trades: ResearchAnalyticsTrade[]): number {
  return roundCents(trades.reduce((sum, trade) => sum + (trade.profitLossDollars ?? 0), 0));
}

function getWinProbabilityPercent(side: "YES" | "NO", modelYesProbabilityPercent: number): number {
  return side === "YES" ? modelYesProbabilityPercent : 100 - modelYesProbabilityPercent;
}

export function calculatePaperTrade(
  side: "YES" | "NO",
  entryPriceCents: number,
  modelYesProbabilityPercent: number,
  riskInputDollars: number
): PaperTradeCalculation | null {
  if (
    !Number.isFinite(entryPriceCents) ||
    entryPriceCents <= 0 ||
    entryPriceCents >= 100 ||
    !Number.isFinite(modelYesProbabilityPercent) ||
    !Number.isFinite(riskInputDollars) ||
    riskInputDollars <= 0
  ) {
    return null;
  }

  const priceDollars = entryPriceCents / 100;
  const contracts = Math.floor(riskInputDollars / priceDollars);

  if (contracts <= 0) {
    return null;
  }

  const actualCostDollars = roundCents(contracts * priceDollars);
  const payoutIfWinDollars = roundCents(contracts);
  const maxProfitDollars = roundCents(payoutIfWinDollars - actualCostDollars);
  const maxLossDollars = actualCostDollars;
  const winProbabilityPercent = roundTenth(
    getWinProbabilityPercent(side, modelYesProbabilityPercent)
  );
  const winProbability = winProbabilityPercent / 100;
  const expectedValueDollars = roundCents((winProbability * payoutIfWinDollars) - actualCostDollars);
  const expectedRoiPercent =
    actualCostDollars > 0 ? roundTenth((expectedValueDollars / actualCostDollars) * 100) : null;

  return {
    side,
    entryPriceCents: roundTenth(entryPriceCents),
    modelProbabilityPercent: roundTenth(modelYesProbabilityPercent),
    winProbabilityPercent,
    riskInputDollars: roundCents(riskInputDollars),
    contracts,
    actualCostDollars,
    payoutIfWinDollars,
    maxProfitDollars,
    maxLossDollars,
    expectedValueDollars,
    expectedRoiPercent
  };
}

export function calculateExitScenario(
  contracts: number,
  actualCostDollars: number,
  exitPriceCents: number,
  label = `${roundTenth(exitPriceCents)}c`
): PaperTradeExitScenario {
  const safeExitPriceCents = Math.max(0, Math.min(100, roundTenth(exitPriceCents)));
  const cashoutValueDollars = roundCents(contracts * (safeExitPriceCents / 100));
  const profitLossDollars = roundCents(cashoutValueDollars - actualCostDollars);
  const roiPercent =
    actualCostDollars > 0 ? roundTenth((profitLossDollars / actualCostDollars) * 100) : null;

  return {
    label,
    exitPriceCents: safeExitPriceCents,
    cashoutValueDollars,
    profitLossDollars,
    roiPercent
  };
}

export function getPaperTradeExitScenarios(
  calculation: PaperTradeCalculation,
  modelFairSidePriceCents?: number | null
): PaperTradeExitScenario[] {
  const scenarioPrices = [
    { label: "-10c", price: calculation.entryPriceCents - 10 },
    { label: "-5c", price: calculation.entryPriceCents - 5 },
    { label: "Entry", price: calculation.entryPriceCents },
    { label: "+5c", price: calculation.entryPriceCents + 5 },
    { label: "+10c", price: calculation.entryPriceCents + 10 }
  ];

  if (typeof modelFairSidePriceCents === "number" && Number.isFinite(modelFairSidePriceCents)) {
    scenarioPrices.push({ label: "Model", price: modelFairSidePriceCents });
  }

  return scenarioPrices.map((scenario) =>
    calculateExitScenario(
      calculation.contracts,
      calculation.actualCostDollars,
      scenario.price,
      scenario.label
    )
  );
}

export function settleResearchPaperTrade<T extends ResearchAnalyticsTrade>(
  trade: T,
  exitValueCents: number
): T {
  const safeExitValue = Math.max(0, Math.min(100, exitValueCents));
  const contracts =
    typeof trade.contracts === "number" && Number.isFinite(trade.contracts)
      ? Math.max(0, Math.floor(trade.contracts))
      : trade.entryPriceCents > 0
        ? Math.floor(getTradeRisk(trade) / (trade.entryPriceCents / 100))
        : 0;
  const actualCostDollars =
    typeof trade.actualCostDollars === "number" && Number.isFinite(trade.actualCostDollars)
      ? Math.max(0, trade.actualCostDollars)
      : roundCents(contracts * (trade.entryPriceCents / 100));
  const exitValueDollars = roundCents(contracts * (safeExitValue / 100));
  const profitLossDollars = roundCents(exitValueDollars - actualCostDollars);
  const settlementResult =
    safeExitValue === 100 ? "WIN" : safeExitValue === 0 ? "LOSS" : "EXIT";

  return {
    ...trade,
    status: settlementResult === "EXIT" ? "exited" : "settled",
    exitValueCents: safeExitValue,
    exitPriceCents: safeExitValue,
    exitValueDollars,
    profitLossDollars,
    realizedPnlDollars: profitLossDollars,
    settlementResult
  };
}

export function summarizeDetailedPaperTrades(
  trades: ResearchAnalyticsTrade[]
): DetailedPaperTradeStats {
  const settledTrades = getSettledTrades(trades);
  const sortedByProfit = [...settledTrades].sort(
    (a, b) => (b.profitLossDollars ?? 0) - (a.profitLossDollars ?? 0)
  );

  return {
    totalProfitLossDollars: getProfitLoss(settledTrades),
    totalDollarsRisked: roundCents(settledTrades.reduce((sum, trade) => sum + getTradeRisk(trade), 0)),
    roiPercent: getRoi(settledTrades),
    winRatePercent: getWinRate(settledTrades),
    averageEntryPriceCents: average(trades.map((trade) => trade.entryPriceCents)),
    averageModelProbabilityPercent: average(
      trades.map((trade) => trade.modelProbabilityPercent)
    ),
    averageBestBetScore: average(
      trades
        .map((trade) => trade.bestBetScore)
        .filter((value): value is number => typeof value === "number")
    ),
    averageEdgePercent: average(trades.map((trade) => trade.edgePercent)),
    averageNetEdgePercent: average(
      trades
        .map((trade) => trade.netEdgePercent)
        .filter((value): value is number => typeof value === "number")
    ),
    averageExpectedRoiPercent: average(
      trades
        .map((trade) => trade.expectedRoiPercent)
        .filter((value): value is number => typeof value === "number")
    ),
    tradeCount: trades.length,
    openCount: trades.filter((trade) => trade.status === "open").length,
    settledCount: settledTrades.length,
    bestTrade: sortedByProfit[0] ?? null,
    worstTrade: sortedByProfit[sortedByProfit.length - 1] ?? null
  };
}

function summarizeBucket(label: string, trades: ResearchAnalyticsTrade[]): ResearchBucket {
  const settledTrades = getSettledTrades(trades);

  return {
    label,
    tradeCount: settledTrades.length,
    predictedAverageProbabilityPercent: average(
      settledTrades.map((trade) => trade.modelProbabilityPercent)
    ),
    winRatePercent: getWinRate(settledTrades),
    roiPercent: getRoi(settledTrades),
    profitLossDollars: getProfitLoss(settledTrades)
  };
}

function bucketByRanges(
  trades: ResearchAnalyticsTrade[],
  ranges: Array<{ label: string; min: number; max: number | null }>,
  valueForTrade: (trade: ResearchAnalyticsTrade) => number
): ResearchBucket[] {
  return ranges.map((range) =>
    summarizeBucket(
      range.label,
      trades.filter((trade) => {
        const value = valueForTrade(trade);
        return value >= range.min && (range.max === null || value < range.max);
      })
    )
  );
}

export function getCalibrationBuckets(trades: ResearchAnalyticsTrade[]): ResearchBucket[] {
  return bucketByRanges(
    trades,
    [
      { label: "50-55%", min: 50, max: 55 },
      { label: "55-60%", min: 55, max: 60 },
      { label: "60-65%", min: 60, max: 65 },
      { label: "65-70%", min: 65, max: 70 },
      { label: "70-80%", min: 70, max: 80 },
      { label: "80%+", min: 80, max: null }
    ],
    (trade) => trade.modelProbabilityPercent
  );
}

export function getEdgeBuckets(trades: ResearchAnalyticsTrade[]): ResearchBucket[] {
  return bucketByRanges(
    trades,
    [
      { label: "0-2%", min: 0, max: 2 },
      { label: "2-5%", min: 2, max: 5 },
      { label: "5-10%", min: 5, max: 10 },
      { label: "10%+", min: 10, max: null }
    ],
    (trade) => trade.edgePercent
  );
}

export function getBestBetScoreBuckets(trades: ResearchAnalyticsTrade[]): ResearchBucket[] {
  return bucketByRanges(
    trades,
    [
      { label: "1-4", min: 1, max: 4 },
      { label: "4-6", min: 4, max: 6 },
      { label: "6-8", min: 6, max: 8 },
      { label: "8-10", min: 8, max: null }
    ],
    (trade) => trade.bestBetScore ?? 0
  );
}

export function getCategoryBuckets(trades: ResearchAnalyticsTrade[]): ResearchBucket[] {
  const categories = ["sports", "politics", "economics", "weather", "crypto", "other"];

  return categories.map((category) =>
    summarizeBucket(
      category,
      trades.filter((trade) => (trade.marketCategory ?? "other") === category)
    )
  );
}

export function exportResearchTradesAsJson(trades: ResearchAnalyticsTrade[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      trades
    },
    null,
    2
  );
}

export function exportResearchTradesAsCsv(trades: ResearchAnalyticsTrade[]): string {
  const columns = [
    "id",
    "side",
    "entryPriceCents",
    "modelProbabilityPercent",
    "hitRating",
    "bestBetScore",
    "edgePercent",
    "netEdgePercent",
    "suggestedRiskDollars",
    "riskInputDollars",
    "contracts",
    "actualCostDollars",
    "maxProfitDollars",
    "maxLossDollars",
    "expectedValueDollars",
    "expectedRoiPercent",
    "status",
    "marketCategory",
    "exitValueCents",
    "exitValueDollars",
    "profitLossDollars",
    "settlementResult"
  ];
  const rows = trades.map((trade) =>
    columns
      .map((column) => {
        const value = trade[column as keyof ResearchAnalyticsTrade] ?? "";
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(",")
  );

  return [columns.join(","), ...rows].join("\n");
}
