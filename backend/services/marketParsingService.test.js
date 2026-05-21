import test from "node:test";
import assert from "node:assert/strict";
import { parseKalshiMarketTitle } from "./marketParsingService.js";

test("parses a team win market", () => {
  const parsed = parseKalshiMarketTitle("Will the Knicks beat the Cavaliers?");

  assert.equal(parsed.marketType, "team");
  assert.equal(parsed.isTeamMarket, true);
  assert.equal(parsed.isPlayerMarket, false);
  assert.match(parsed.whatNeedsToHappen, /Knicks/i);
});

test("parses a player points over market", () => {
  const parsed = parseKalshiMarketTitle("Will Jalen Brunson score 25+ points?");

  assert.equal(parsed.marketType, "player");
  assert.equal(parsed.playerName, "Jalen Brunson");
  assert.equal(parsed.statType, "points");
  assert.equal(parsed.direction, "over");
  assert.equal(parsed.target, 25);
  assert.ok(parsed.marketLeg);
  assert.equal(parsed.marketLeg?.playerName, "Jalen Brunson");
  assert.equal(parsed.marketLeg?.statType, "points");
  assert.equal(parsed.marketLeg?.direction, "over");
  assert.equal(parsed.marketLeg?.target, 25);
});

test("parses a player rebounds over market", () => {
  const parsed = parseKalshiMarketTitle("Will Karl-Anthony Towns grab 10+ rebounds?");

  assert.equal(parsed.marketType, "player");
  assert.equal(parsed.playerName, "Karl-Anthony Towns");
  assert.equal(parsed.statType, "rebounds");
  assert.equal(parsed.direction, "over");
  assert.equal(parsed.target, 10);
});

test("parses a player under market", () => {
  const parsed = parseKalshiMarketTitle("Will Donovan Mitchell stay under 30 points?");

  assert.equal(parsed.marketType, "player");
  assert.equal(parsed.playerName, "Donovan Mitchell");
  assert.equal(parsed.statType, "points");
  assert.equal(parsed.direction, "under");
  assert.equal(parsed.target, 30);
  assert.match(parsed.whatNeedsToHappen, /under 30/i);
});

test("returns unknown for unsupported markets", () => {
  const parsed = parseKalshiMarketTitle("Will there be overtime?");

  assert.equal(parsed.marketType, "unknown");
  assert.equal(parsed.isTeamMarket, false);
  assert.equal(parsed.isPlayerMarket, false);
  assert.ok(parsed.whatNeedsToHappen.length > 0);
});
