import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRawFeatures,
  MIN_TRAINING_EXAMPLES,
  normalizeFeatureVector
} from "./researchModelService.js";

test("buildRawFeatures extracts market model inputs", () => {
  const features = buildRawFeatures(
    {
      ticker: "KXNBA-SPURS-WIN",
      title: "Will the Spurs win?",
      sport: "basketball",
      yesAskCents: 42,
      yesBidCents: 40,
      previousPriceCents: 38,
      volume: 1200,
      liquidityCents: 25000,
      closeTime: "2026-06-06T23:00:00Z"
    },
    "2026-06-06T20:00:00Z"
  );

  assert.equal(features.yesPrice, 42);
  assert.equal(features.spread, 2);
  assert.equal(features.previousMove, 4);
  assert.equal(features.volume, 1200);
  assert.equal(features.liquidityCents, 25000);
  assert.equal(features.hoursUntilClose, 3);
  assert.equal(features.category, "sports");
});

test("normalizeFeatureVector returns the expected trained model shape", () => {
  const vector = normalizeFeatureVector({
    yesPrice: 42,
    spread: 2,
    volume: 1200,
    liquidityCents: 25000,
    hoursUntilClose: 3,
    previousMove: 4,
    category: "sports"
  });

  assert.equal(vector.length, 11);
  assert.equal(vector[0], 0.42);
  assert.equal(vector[6], 1);
});

test("research model requires enough settled training examples", () => {
  assert.equal(MIN_TRAINING_EXAMPLES, 25);
});
