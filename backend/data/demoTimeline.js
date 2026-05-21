export const DEMO_GAME_ID = "knicks-cavs-demo";

export const SUPPORTED_GAMES = [
  {
    id: DEMO_GAME_ID,
    label: "Knicks vs Cavaliers Demo"
  }
];

export const demoTimeline = [
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "10:58",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 82 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 77 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 18, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 8, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 21, target: 30, unit: "pts" }
    ]
  },
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "9:21",
    possessionTeam: "CLE",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 84 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 80 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 19, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 8, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 22, target: 30, unit: "pts" }
    ]
  },
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "6:14",
    possessionTeam: "CLE",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 88 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 84 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 21, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 9, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 24, target: 30, unit: "pts" }
    ]
  },
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "2:48",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 93 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 89 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 22, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 9, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 25, target: 30, unit: "pts" }
    ]
  },
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q4",
    gameClock: "11:37",
    possessionTeam: "CLE",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 95 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 92 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 23, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 9, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 26, target: 30, unit: "pts" }
    ]
  },
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q4",
    gameClock: "8:42",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 101 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 95 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 24, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 10, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 27, target: 30, unit: "pts" }
    ]
  },
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q4",
    gameClock: "2:11",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 108 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 102 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 27, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 11, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 29, target: 30, unit: "pts" }
    ]
  },
  {
    title: "Knicks vs Cavaliers",
    gameStatus: "final",
    quarter: "Q4",
    gameClock: "0:00",
    possessionTeam: "NYK",
    homeTeam: { name: "New York Knicks", shortName: "NYK", score: 112 },
    awayTeam: { name: "Cleveland Cavaliers", shortName: "CLE", score: 106 },
    playerStats: [
      { playerName: "Jalen Brunson", team: "NYK", statType: "points", direction: "over", current: 29, target: 25, unit: "pts" },
      { playerName: "Karl-Anthony Towns", team: "NYK", statType: "rebounds", direction: "over", current: 12, target: 10, unit: "reb" },
      { playerName: "Donovan Mitchell", team: "CLE", statType: "points", direction: "under", current: 31, target: 30, unit: "pts" }
    ]
  }
];
