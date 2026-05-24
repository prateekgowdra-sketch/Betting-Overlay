export const KNICKS_CAVS_GAME_ID = "knicks-cavs-demo";
export const THUNDER_SPURS_GAME_ID = "thunder-spurs-demo";

export const SUPPORTED_GAMES = [
  {
    id: KNICKS_CAVS_GAME_ID,
    providerGameId: "mock-knicks-cavs-001",
    label: "Knicks vs Cavaliers Demo",
    homeTeam: "New York Knicks",
    awayTeam: "Cleveland Cavaliers",
    homeAbbr: "NYK",
    awayAbbr: "CLE",
    scheduledTime: "2026-05-24T19:30:00-04:00",
    source: "mock"
  },
  {
    id: THUNDER_SPURS_GAME_ID,
    providerGameId: "mock-thunder-spurs-001",
    label: "Thunder vs Spurs Demo",
    homeTeam: "Oklahoma City Thunder",
    awayTeam: "San Antonio Spurs",
    homeAbbr: "OKC",
    awayAbbr: "SAS",
    scheduledTime: "2026-05-24T20:00:00-04:00",
    source: "mock"
  }
];

const KNICKS_CAVS_TIMELINE = [
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

const THUNDER_SPURS_TIMELINE = [
  {
    title: "Thunder vs Spurs",
    gameStatus: "upcoming",
    quarter: "Pregame",
    gameClock: "--:--",
    possessionTeam: "OKC",
    homeTeam: { name: "Oklahoma City Thunder", shortName: "OKC", score: 0 },
    awayTeam: { name: "San Antonio Spurs", shortName: "SAS", score: 0 },
    playerStats: [
      { playerName: "Shai Gilgeous-Alexander", team: "OKC", statType: "points", direction: "over", current: 0, target: 30, unit: "pts" },
      { playerName: "Chet Holmgren", team: "OKC", statType: "rebounds", direction: "over", current: 0, target: 9, unit: "reb" },
      { playerName: "Victor Wembanyama", team: "SAS", statType: "points", direction: "under", current: 0, target: 28, unit: "pts" }
    ]
  },
  {
    title: "Thunder vs Spurs",
    gameStatus: "live",
    quarter: "Q2",
    gameClock: "7:44",
    possessionTeam: "SAS",
    homeTeam: { name: "Oklahoma City Thunder", shortName: "OKC", score: 46 },
    awayTeam: { name: "San Antonio Spurs", shortName: "SAS", score: 41 },
    playerStats: [
      { playerName: "Shai Gilgeous-Alexander", team: "OKC", statType: "points", direction: "over", current: 14, target: 30, unit: "pts" },
      { playerName: "Chet Holmgren", team: "OKC", statType: "rebounds", direction: "over", current: 5, target: 9, unit: "reb" },
      { playerName: "Victor Wembanyama", team: "SAS", statType: "points", direction: "under", current: 12, target: 28, unit: "pts" }
    ]
  },
  {
    title: "Thunder vs Spurs",
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "3:08",
    possessionTeam: "OKC",
    homeTeam: { name: "Oklahoma City Thunder", shortName: "OKC", score: 74 },
    awayTeam: { name: "San Antonio Spurs", shortName: "SAS", score: 69 },
    playerStats: [
      { playerName: "Shai Gilgeous-Alexander", team: "OKC", statType: "points", direction: "over", current: 24, target: 30, unit: "pts" },
      { playerName: "Chet Holmgren", team: "OKC", statType: "rebounds", direction: "over", current: 7, target: 9, unit: "reb" },
      { playerName: "Victor Wembanyama", team: "SAS", statType: "points", direction: "under", current: 20, target: 28, unit: "pts" }
    ]
  },
  {
    title: "Thunder vs Spurs",
    gameStatus: "live",
    quarter: "Q4",
    gameClock: "5:26",
    possessionTeam: "SAS",
    homeTeam: { name: "Oklahoma City Thunder", shortName: "OKC", score: 99 },
    awayTeam: { name: "San Antonio Spurs", shortName: "SAS", score: 94 },
    playerStats: [
      { playerName: "Shai Gilgeous-Alexander", team: "OKC", statType: "points", direction: "over", current: 28, target: 30, unit: "pts" },
      { playerName: "Chet Holmgren", team: "OKC", statType: "rebounds", direction: "over", current: 8, target: 9, unit: "reb" },
      { playerName: "Victor Wembanyama", team: "SAS", statType: "points", direction: "under", current: 25, target: 28, unit: "pts" }
    ]
  },
  {
    title: "Thunder vs Spurs",
    gameStatus: "final",
    quarter: "Q4",
    gameClock: "0:00",
    possessionTeam: "OKC",
    homeTeam: { name: "Oklahoma City Thunder", shortName: "OKC", score: 116 },
    awayTeam: { name: "San Antonio Spurs", shortName: "SAS", score: 108 },
    playerStats: [
      { playerName: "Shai Gilgeous-Alexander", team: "OKC", statType: "points", direction: "over", current: 33, target: 30, unit: "pts" },
      { playerName: "Chet Holmgren", team: "OKC", statType: "rebounds", direction: "over", current: 10, target: 9, unit: "reb" },
      { playerName: "Victor Wembanyama", team: "SAS", statType: "points", direction: "under", current: 30, target: 28, unit: "pts" }
    ]
  }
];

export const DEMO_TIMELINES_BY_GAME = {
  [KNICKS_CAVS_GAME_ID]: KNICKS_CAVS_TIMELINE,
  [THUNDER_SPURS_GAME_ID]: THUNDER_SPURS_TIMELINE
};
