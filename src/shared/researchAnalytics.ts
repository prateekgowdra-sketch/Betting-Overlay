export interface ResearchAnalyticsTrade {
  id: string;
  side: "YES" | "NO";
  entryPriceCents: number;
  modelProbabilityPercent: number;
  edgePercent: number;
  netEdgePercent?: number | null;
  suggestedRiskDollars: number;
  status: "open" | "settled";
  marketCategory?: string | null;
  exitValueCents?: number | null;
  profitLossDollars?: number | null;
}

export interface DetailedPaperTradeStats {
  totalProfitLossDollars: number;
  roiPercent: number | null;
  winRatePercent: number | null;
  averageEntryPriceCents: number | null;
  averageModelProbabilityPercent: number | null;
  averageEdgePercent: number | null;
  averageNetEdgePercent: number | null;
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
  return Math.max(0, trade.suggestedRiskDollars);
}

function getSettledTrades(trades: ResearchAnalyticsTrade[]): ResearchAnalyticsTrade[] {
  return trades.filter((trade) => trade.status === "settled");
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

export function settleResearchPaperTrade<T extends ResearchAnalyticsTrade>(
  trade: T,
  exitValueCents: number
): T {
  const safeExitValue = Math.max(0, Math.min(100, exitValueCents));
  const contracts =
    trade.entryPriceCents > 0 ? trade.suggestedRiskDollars / (trade.entryPriceCents / 100) : 0;
  const profitLossDollars = roundCents(
    contracts * ((safeExitValue - trade.entryPriceCents) / 100)
  );

  return {
    ...trade,
    status: "settled",
    exitValueCents: safeExitValue,
    profitLossDollars
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
    roiPercent: getRoi(settledTrades),
    winRatePercent: getWinRate(settledTrades),
    averageEntryPriceCents: average(trades.map((trade) => trade.entryPriceCents)),
    averageModelProbabilityPercent: average(
      trades.map((trade) => trade.modelProbabilityPercent)
    ),
    averageEdgePercent: average(trades.map((trade) => trade.edgePercent)),
    averageNetEdgePercent: average(
      trades
        .map((trade) => trade.netEdgePercent)
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
    "edgePercent",
    "netEdgePercent",
    "suggestedRiskDollars",
    "status",
    "marketCategory",
    "exitValueCents",
    "profitLossDollars"
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
