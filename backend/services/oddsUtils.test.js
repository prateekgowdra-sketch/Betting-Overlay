import test from "node:test";
import assert from "node:assert/strict";
import {
  americanOddsToImpliedProbability,
  formatAmericanOdds,
  getOddsMovement
} from "./oddsUtils.js";

test("americanOddsToImpliedProbability handles positive odds", () => {
  assert.equal(americanOddsToImpliedProbability(150), 100 / 250);
});

test("americanOddsToImpliedProbability handles negative odds", () => {
  assert.equal(americanOddsToImpliedProbability(-120), 120 / 220);
});

test("getOddsMovement detects higher chance but worse payout", () => {
  const movement = getOddsMovement(180, 140);

  assert.equal(movement.probabilityDirection, "up");
  assert.equal(movement.payoutDirection, "worse");
});

test("formatAmericanOdds includes plus sign for positive odds", () => {
  assert.equal(formatAmericanOdds(520), "+520");
  assert.equal(formatAmericanOdds(-105), "-105");
});
