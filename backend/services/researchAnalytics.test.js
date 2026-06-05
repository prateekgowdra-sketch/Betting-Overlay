import assert from "node:assert/strict";
import test from "node:test";
import {
  exportResearchTradesAsCsv,
  exportResearchTradesAsJson,
  getCalibrationBuckets,
  getEdgeBuckets,
  settleResearchPaperTrade,
  summarizeDetailedPaperTrades
} from "../../src/shared/researchAnalytics.ts";

const sampleTrades = [
  {
    id: "win-55",
    side: "YES",
    entryPriceCents: 40,
    modelProbabilityPercent: 56,
    edgePercent: 6,
    netEdgePercent: 4,
    suggestedRiskDollars: 10,
    status: "settled",
    marketCategory: "sports",
    exitValueCents: 100,
    profitLossDollars: 15
  },
  {
    id: "loss-62",
    side: "YES",
    entryPriceCents: 55,
    modelProbabilityPercent: 62,
    edgePercent: 7,
    netEdgePercent: 5,
    suggestedRiskDollars: 11,
    status: "settled",
    marketCategory: "sports",
    exitValueCents: 0,
    profitLossDollars: -11
  },
  {
    id: "open-72",
    side: "NO",
    entryPriceCents: 30,
    modelProbabilityPercent: 72,
    edgePercent: 12,
    netEdgePercent: 9,
    suggestedRiskDollars: 6,
    status: "open",
    marketCategory: "politics"
  }
];

test("summarizeDetailedPaperTrades calculates ROI and core paper stats", () => {
  const stats = summarizeDetailedPaperTrades(sampleTrades);

  assert.equal(stats.totalProfitLossDollars, 4);
  assert.equal(stats.roiPercent, 19);
  assert.equal(stats.winRatePercent, 50);
  assert.equal(stats.averageEntryPriceCents, 41.7);
  assert.equal(stats.averageModelProbabilityPercent, 63.3);
  assert.equal(stats.averageEdgePercent, 8.3);
  assert.equal(stats.averageNetEdgePercent, 6);
  assert.equal(stats.openCount, 1);
  assert.equal(stats.settledCount, 2);
  assert.equal(stats.bestTrade?.id, "win-55");
  assert.equal(stats.worstTrade?.id, "loss-62");
});

test("getCalibrationBuckets groups settled trades by model probability", () => {
  const buckets = getCalibrationBuckets(sampleTrades);
  const bucket55 = buckets.find((bucket) => bucket.label === "55-60%");
  const bucket60 = buckets.find((bucket) => bucket.label === "60-65%");
  const bucket70 = buckets.find((bucket) => bucket.label === "70-80%");

  assert.equal(bucket55?.tradeCount, 1);
  assert.equal(bucket55?.predictedAverageProbabilityPercent, 56);
  assert.equal(bucket55?.winRatePercent, 100);
  assert.equal(bucket60?.tradeCount, 1);
  assert.equal(bucket60?.winRatePercent, 0);
  assert.equal(bucket70?.tradeCount, 0);
});

test("getEdgeBuckets groups settled trades by edge range", () => {
  const buckets = getEdgeBuckets(sampleTrades);
  const bucket5 = buckets.find((bucket) => bucket.label === "5-10%");
  const bucket10 = buckets.find((bucket) => bucket.label === "10%+");

  assert.equal(bucket5?.tradeCount, 2);
  assert.equal(bucket5?.profitLossDollars, 4);
  assert.equal(bucket5?.roiPercent, 19);
  assert.equal(bucket10?.tradeCount, 0);
});

test("settleResearchPaperTrade auto-calculates payout and P/L", () => {
  const settledWin = settleResearchPaperTrade(
    {
      id: "manual",
      side: "YES",
      entryPriceCents: 50,
      modelProbabilityPercent: 60,
      edgePercent: 10,
      netEdgePercent: 8,
      suggestedRiskDollars: 5,
      status: "open"
    },
    100
  );

  assert.equal(settledWin.status, "settled");
  assert.equal(settledWin.exitValueCents, 100);
  assert.equal(settledWin.profitLossDollars, 5);
});

test("research trade export produces parseable JSON and CSV headers", () => {
  const json = exportResearchTradesAsJson(sampleTrades);
  const parsed = JSON.parse(json);
  const csv = exportResearchTradesAsCsv(sampleTrades);

  assert.equal(parsed.version, 1);
  assert.equal(parsed.trades.length, 3);
  assert.match(csv.split("\n")[0], /id,side,entryPriceCents/);
  assert.match(csv, /"win-55"/);
});
