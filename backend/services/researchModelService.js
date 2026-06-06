import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "backend", "data");
const SNAPSHOTS_PATH = join(DATA_DIR, "researchMarketSnapshots.json");
const MODEL_PATH = join(DATA_DIR, "researchModel.json");
const MODEL_VERSION = "logistic-market-v1";
const FEATURE_NAMES = [
  "yesPrice",
  "spread",
  "volumeLog",
  "liquidityLog",
  "hoursUntilClose",
  "previousMove",
  "isSports",
  "isPolitics",
  "isEconomics",
  "isWeather",
  "isCrypto"
];
const MIN_TRAINING_EXAMPLES = 25;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile(path, fallback) {
  ensureDataDir();

  if (!existsSync(path)) {
    writeFileSync(path, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(path, value) {
  ensureDataDir();
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-clamp(value, -35, 35)));
}

function getYesPrice(market) {
  if (typeof market?.yesAskCents === "number") return market.yesAskCents;
  if (typeof market?.yesBidCents === "number") return market.yesBidCents;
  if (typeof market?.lastPriceCents === "number") return market.lastPriceCents;
  return null;
}

function getSpread(market) {
  if (
    typeof market?.yesAskCents === "number" &&
    typeof market?.yesBidCents === "number" &&
    market.yesAskCents >= market.yesBidCents
  ) {
    return market.yesAskCents - market.yesBidCents;
  }

  if (
    typeof market?.noAskCents === "number" &&
    typeof market?.noBidCents === "number" &&
    market.noAskCents >= market.noBidCents
  ) {
    return market.noAskCents - market.noBidCents;
  }

  return null;
}

function getHoursUntilClose(market, capturedAt) {
  if (!market?.closeTime) {
    return null;
  }

  const closeTime = new Date(market.closeTime).getTime();
  const captureTime = new Date(capturedAt).getTime();

  if (!Number.isFinite(closeTime) || !Number.isFinite(captureTime)) {
    return null;
  }

  return Math.max(0, (closeTime - captureTime) / 3600000);
}

function inferCategory(market) {
  const text = [
    market?.sport,
    market?.competition,
    market?.scope,
    market?.eventTitle,
    market?.title
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

function normalizeFeatureVector(rawFeatures) {
  const yesPrice = rawFeatures.yesPrice;
  const spread = rawFeatures.spread;

  return [
    typeof yesPrice === "number" ? clamp(yesPrice / 100, 0, 1) : 0.5,
    typeof spread === "number" ? clamp(spread / 20, 0, 1) : 0.5,
    Math.log10(Math.max(0, rawFeatures.volume ?? 0) + 1) / 6,
    Math.log10(Math.max(0, rawFeatures.liquidityCents ?? 0) + 1) / 8,
    typeof rawFeatures.hoursUntilClose === "number"
      ? clamp(rawFeatures.hoursUntilClose / 168, 0, 1)
      : 0.5,
    typeof rawFeatures.previousMove === "number" ? clamp(rawFeatures.previousMove / 50, -1, 1) : 0,
    rawFeatures.category === "sports" ? 1 : 0,
    rawFeatures.category === "politics" ? 1 : 0,
    rawFeatures.category === "economics" ? 1 : 0,
    rawFeatures.category === "weather" ? 1 : 0,
    rawFeatures.category === "crypto" ? 1 : 0
  ];
}

function buildRawFeatures(market, capturedAt = new Date().toISOString()) {
  const yesPrice = getYesPrice(market);

  return {
    yesPrice,
    spread: getSpread(market),
    volume: typeof market?.volume === "number" ? market.volume : null,
    liquidityCents: typeof market?.liquidityCents === "number" ? market.liquidityCents : null,
    hoursUntilClose: getHoursUntilClose(market, capturedAt),
    previousMove:
      typeof yesPrice === "number" && typeof market?.previousPriceCents === "number"
        ? yesPrice - market.previousPriceCents
        : null,
    category: inferCategory(market)
  };
}

function getMarketLabel(market) {
  if (!market?.isResolved || !market.resultKnown || !market.winningSide) {
    return null;
  }

  return market.winningSide === "YES" ? 1 : 0;
}

function snapshotFromMarket(market, capturedAt = new Date().toISOString()) {
  if (!market?.ticker) {
    return null;
  }

  const rawFeatures = buildRawFeatures(market, capturedAt);

  if (typeof rawFeatures.yesPrice !== "number") {
    return null;
  }

  return {
    id: `${market.ticker}-${capturedAt}`,
    ticker: market.ticker,
    title: market.displayTitle || market.title || market.ticker,
    capturedAt,
    closeTime: market.closeTime ?? null,
    status: market.lifecycleStatus ?? market.status ?? "unknown",
    label: getMarketLabel(market),
    winningSide: market.winningSide ?? null,
    rawFeatures,
    features: normalizeFeatureVector(rawFeatures)
  };
}

function dedupeSnapshots(snapshots) {
  const byId = new Map();

  for (const snapshot of snapshots) {
    if (!snapshot?.ticker || !snapshot?.capturedAt) {
      continue;
    }

    byId.set(`${snapshot.ticker}-${snapshot.capturedAt}`, snapshot);
  }

  return Array.from(byId.values()).sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
}

function labelHistoricalSnapshots(snapshots) {
  const labelsByTicker = new Map();

  for (const snapshot of snapshots) {
    if (typeof snapshot.label === "number") {
      labelsByTicker.set(snapshot.ticker, {
        label: snapshot.label,
        winningSide: snapshot.winningSide ?? (snapshot.label === 1 ? "YES" : "NO")
      });
    }
  }

  return snapshots.map((snapshot) => {
    const label = labelsByTicker.get(snapshot.ticker);

    if (!label || typeof snapshot.label === "number") {
      return snapshot;
    }

    return {
      ...snapshot,
      label: label.label,
      winningSide: label.winningSide
    };
  });
}

function trainLogisticRegression(examples) {
  const weights = Array(FEATURE_NAMES.length).fill(0);
  let bias = 0;
  const learningRate = 0.08;
  const l2 = 0.001;

  for (let epoch = 0; epoch < 700; epoch += 1) {
    for (const example of examples) {
      const prediction = sigmoid(
        bias + example.features.reduce((sum, value, index) => sum + value * weights[index], 0)
      );
      const error = prediction - example.label;

      bias -= learningRate * error;

      for (let index = 0; index < weights.length; index += 1) {
        weights[index] -= learningRate * ((error * example.features[index]) + (l2 * weights[index]));
      }
    }
  }

  return {
    weights: weights.map((value) => round(value, 6)),
    bias: round(bias, 6)
  };
}

function scoreModel(model, features) {
  return sigmoid(
    model.bias + features.reduce((sum, value, index) => sum + value * model.weights[index], 0)
  );
}

function evaluateModel(model, examples) {
  if (examples.length === 0) {
    return {
      logLoss: null,
      brierScore: null,
      accuracy: null
    };
  }

  let logLoss = 0;
  let brier = 0;
  let correct = 0;

  for (const example of examples) {
    const probability = clamp(scoreModel(model, example.features), 0.001, 0.999);
    logLoss += -(example.label * Math.log(probability) + (1 - example.label) * Math.log(1 - probability));
    brier += (probability - example.label) ** 2;
    correct += (probability >= 0.5 ? 1 : 0) === example.label ? 1 : 0;
  }

  return {
    logLoss: round(logLoss / examples.length),
    brierScore: round(brier / examples.length),
    accuracy: round((correct / examples.length) * 100, 1)
  };
}

class ResearchModelService {
  listSnapshots() {
    const snapshots = readJsonFile(SNAPSHOTS_PATH, []);
    return Array.isArray(snapshots) ? snapshots : [];
  }

  getModel() {
    const model = readJsonFile(MODEL_PATH, null);
    return model && model.version === MODEL_VERSION ? model : null;
  }

  recordMarketSnapshots(markets = []) {
    const capturedAt = new Date().toISOString();
    const nextSnapshots = markets
      .map((market) => snapshotFromMarket(market, capturedAt))
      .filter(Boolean);

    if (nextSnapshots.length === 0) {
      return {
        recorded: 0,
        totalSnapshots: this.listSnapshots().length
      };
    }

    const existing = this.listSnapshots();
    const merged = labelHistoricalSnapshots(dedupeSnapshots([...existing, ...nextSnapshots]));
    writeJsonFile(SNAPSHOTS_PATH, merged);

    return {
      recorded: nextSnapshots.length,
      totalSnapshots: merged.length
    };
  }

  getTrainingExamples() {
    return this.listSnapshots()
      .filter((snapshot) => typeof snapshot.label === "number" && Array.isArray(snapshot.features))
      .map((snapshot) => ({
        ticker: snapshot.ticker,
        capturedAt: snapshot.capturedAt,
        features: snapshot.features.map((value) => Number(value) || 0),
        label: snapshot.label
      }));
  }

  trainModel() {
    const examples = this.getTrainingExamples();

    if (examples.length < MIN_TRAINING_EXAMPLES) {
      return {
        trained: false,
        reason: "insufficient_data",
        requiredExamples: MIN_TRAINING_EXAMPLES,
        trainingExamples: examples.length
      };
    }

    const splitIndex = Math.max(1, Math.floor(examples.length * 0.8));
    const trainingExamples = examples.slice(0, splitIndex);
    const validationExamples = examples.slice(splitIndex);
    const modelWeights = trainLogisticRegression(trainingExamples);
    const model = {
      version: MODEL_VERSION,
      trainedAt: new Date().toISOString(),
      featureNames: FEATURE_NAMES,
      trainingExamples: trainingExamples.length,
      validationExamples: validationExamples.length,
      ...modelWeights,
      metrics: evaluateModel(modelWeights, validationExamples.length > 0 ? validationExamples : trainingExamples)
    };

    writeJsonFile(MODEL_PATH, model);

    return {
      trained: true,
      model
    };
  }

  getStatus() {
    const snapshots = this.listSnapshots();
    const trainingExamples = this.getTrainingExamples();
    const model = this.getModel();

    return {
      modelAvailable: Boolean(model),
      modelVersion: model?.version ?? MODEL_VERSION,
      trainedAt: model?.trainedAt ?? null,
      snapshotCount: snapshots.length,
      trainingExamples: trainingExamples.length,
      requiredExamples: MIN_TRAINING_EXAMPLES,
      readyToTrain: trainingExamples.length >= MIN_TRAINING_EXAMPLES,
      metrics: model?.metrics ?? null
    };
  }

  forecastMarket(market) {
    const rawFeatures = buildRawFeatures(market);
    const features = normalizeFeatureVector(rawFeatures);
    const model = this.getModel();

    if (!model) {
      return {
        available: false,
        reason: "model_not_trained",
        modelVersion: MODEL_VERSION,
        rawFeatures,
        featureNames: FEATURE_NAMES
      };
    }

    const probability = scoreModel(model, features);
    const yesPrice = rawFeatures.yesPrice;
    const edgePercent = typeof yesPrice === "number" ? round((probability * 100) - yesPrice, 1) : null;

    return {
      available: true,
      modelVersion: model.version,
      trainedAt: model.trainedAt,
      modelProbabilityPercent: round(probability * 100, 1),
      edgePercent,
      confidence:
        model.trainingExamples >= 250 ? "High" : model.trainingExamples >= 75 ? "Medium" : "Low",
      rawFeatures,
      featureNames: FEATURE_NAMES
    };
  }
}

export const researchModelService = new ResearchModelService();
export {
  FEATURE_NAMES,
  MIN_TRAINING_EXAMPLES,
  MODEL_VERSION,
  buildRawFeatures,
  normalizeFeatureVector
};
