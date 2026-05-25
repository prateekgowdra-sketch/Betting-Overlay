import test from "node:test";
import assert from "node:assert/strict";
import { buildDateWindow, selectRelevantGamesByWindow } from "./providers/balldontlieProvider.js";

test("buildDateWindow includes today and nearby dates", () => {
  const dates = buildDateWindow(new Date("2026-05-25T12:00:00Z"), 1, 2);

  assert.deepEqual(dates, ["2026-05-24", "2026-05-25", "2026-05-26", "2026-05-27"]);
});

test("selectRelevantGamesByWindow prefers games on the current date", () => {
  const groupedGames = {
    "2026-05-24": [{ id: 1, datetime: "2026-05-24T23:00:00Z" }],
    "2026-05-25": [
      { id: 2, datetime: "2026-05-25T23:00:00Z" },
      { id: 3, datetime: "2026-05-25T21:00:00Z" }
    ],
    "2026-05-26": [{ id: 4, datetime: "2026-05-26T00:00:00Z" }]
  };

  const games = selectRelevantGamesByWindow(groupedGames, "2026-05-25");

  assert.deepEqual(
    games.map((game) => game.id),
    [3, 2]
  );
});

test("selectRelevantGamesByWindow falls forward when today has no games", () => {
  const groupedGames = {
    "2026-05-26": [{ id: 4, datetime: "2026-05-26T00:00:00Z" }],
    "2026-05-27": [{ id: 5, datetime: "2026-05-27T00:00:00Z" }]
  };

  const games = selectRelevantGamesByWindow(groupedGames, "2026-05-25");

  assert.deepEqual(
    games.map((game) => game.id),
    [4]
  );
});

test("selectRelevantGamesByWindow falls back to recent past when future is empty", () => {
  const groupedGames = {
    "2026-05-23": [{ id: 1, datetime: "2026-05-23T23:00:00Z" }],
    "2026-05-24": [{ id: 2, datetime: "2026-05-24T20:00:00Z" }]
  };

  const games = selectRelevantGamesByWindow(groupedGames, "2026-05-25");

  assert.deepEqual(
    games.map((game) => game.id),
    [2]
  );
});
