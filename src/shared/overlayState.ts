import {
  GameState,
  KalshiPosition,
  MarketLeg,
  OverlayData,
  PlayerStat,
  PositionStatus,
  TeamId
} from "./types";

export interface BackendGameResponse {
  gameId: string;
  title: string;
  gameStatus: "upcoming" | "live" | "final";
  quarter: string;
  gameClock: string;
  possessionTeam: TeamId;
  homeTeam: {
    name: string;
    shortName: string;
    score: number;
  };
  awayTeam: {
    name: string;
    shortName: string;
    score: number;
  };
  playerStats: Array<{
    playerName: string;
    team: TeamId;
    statType: "points" | "rebounds";
    direction: "over" | "under";
    current: number;
    target: number;
    unit: string;
  }>;
  updatedAt: string;
}

export interface BackendKalshiPositionResponse {
  gameId: string;
  updatedAt: string;
  positions: Array<{
    id: string;
    marketTitle: string;
    platform: string;
    side: "YES" | "NO";
    contracts: number;
    entryPriceCents: number;
    currentPriceCents: number;
    whatNeedsToHappen: string;
    marketLeg?: {
      id: string;
      playerName: string;
      statType: "points" | "rebounds";
      direction: "over" | "under";
      current: number;
      target: number;
      unit: string;
      whatNeedsToHappen: string;
    };
  }>;
}

export interface BackendPlayersResponse {
  gameId: string;
  updatedAt: string;
  players: Array<{
    playerName: string;
    team: TeamId;
    stats: {
      points?: number;
      rebounds?: number;
      assists?: number;
      threes_made?: number;
      steals?: number;
      blocks?: number;
      turnovers?: number;
    };
  }>;
}

export interface BackendKalshiMarketResponse {
  mode: "mock" | "real";
  environment: "demo" | "production";
  market: {
    ticker: string;
    title: string;
    status: string;
    yesPriceCents: number | null;
    noPriceCents: number | null;
    lastPriceCents: number | null;
    updatedAt: string | null;
  } | null;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deriveOverUnderStatus(
  direction: "over" | "under",
  current: number,
  target: number
): PositionStatus {
  if (direction === "over") {
    return current >= target ? "won" : "sweating";
  }

  return current > target ? "lost" : "sweating";
}

function derivePositionStatus(progress: number): PositionStatus {
  if (progress >= 100) {
    return "won";
  }

  if (progress >= 75) {
    return "on-track";
  }

  if (progress >= 45) {
    return "sweating";
  }

  return "danger";
}

function derivePlayerStat(raw: BackendGameResponse["playerStats"][number]): PlayerStat {
  const progress = clampProgress((raw.current / raw.target) * 100);
  const remaining = Math.max(0, raw.target - raw.current);

  return {
    id: `${raw.playerName}-${raw.statType}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    playerName: raw.playerName,
    team: raw.team,
    statType: raw.statType,
    direction: raw.direction,
    current: raw.current,
    target: raw.target,
    unit: raw.unit,
    progress,
    status: deriveOverUnderStatus(raw.direction, raw.current, raw.target),
    whatIsNeeded:
      raw.direction === "over"
        ? remaining === 0
          ? "Cashed"
          : `Needs ${remaining} more`
        : raw.current > raw.target
          ? "Dead"
          : `Can allow ${remaining} more`
  };
}

function deriveMarketLeg(
  leg: NonNullable<BackendKalshiPositionResponse["positions"][number]["marketLeg"]>
): MarketLeg {
  const progress = clampProgress((leg.current / leg.target) * 100);

  return {
    id: leg.id,
    playerName: leg.playerName,
    statType: leg.statType,
    direction: leg.direction,
    current: leg.current,
    target: leg.target,
    unit: leg.unit,
    progress,
    status: deriveOverUnderStatus(leg.direction, leg.current, leg.target),
    whatNeedsToHappen: leg.whatNeedsToHappen
  };
}

function derivePosition(
  raw: BackendKalshiPositionResponse["positions"][number]
): KalshiPosition {
  const currentValueCents = raw.currentPriceCents * raw.contracts;
  const costBasisCents = raw.entryPriceCents * raw.contracts;
  const unrealizedPnLCents = currentValueCents - costBasisCents;
  const progress = clampProgress((raw.currentPriceCents / 100) * 100);

  return {
    id: raw.id,
    marketTitle: raw.marketTitle,
    platform: raw.platform,
    side: raw.side,
    contracts: raw.contracts,
    entryPriceCents: raw.entryPriceCents,
    currentPriceCents: raw.currentPriceCents,
    currentValueCents,
    costBasisCents,
    unrealizedPnLCents,
    status: derivePositionStatus(progress),
    progress,
    whatNeedsToHappen: raw.whatNeedsToHappen,
    leg: raw.marketLeg ? deriveMarketLeg(raw.marketLeg) : undefined
  };
}

export function buildInitialOverlayData(): OverlayData {
  const initialGame: BackendGameResponse = {
    gameId: "knicks-cavs-demo",
    title: "Knicks vs Cavaliers",
    gameStatus: "live",
    quarter: "Q3",
    gameClock: "10:58",
    possessionTeam: "NYK",
    homeTeam: {
      name: "New York Knicks",
      shortName: "NYK",
      score: 82
    },
    awayTeam: {
      name: "Cleveland Cavaliers",
      shortName: "CLE",
      score: 77
    },
    playerStats: [
      {
        playerName: "Jalen Brunson",
        team: "NYK",
        statType: "points",
        direction: "over",
        current: 18,
        target: 25,
        unit: "pts"
      },
      {
        playerName: "Karl-Anthony Towns",
        team: "NYK",
        statType: "rebounds",
        direction: "over",
        current: 8,
        target: 10,
        unit: "reb"
      },
      {
        playerName: "Donovan Mitchell",
        team: "CLE",
        statType: "points",
        direction: "under",
        current: 21,
        target: 30,
        unit: "pts"
      }
    ],
    updatedAt: new Date().toISOString()
  };

  const initialPositions: BackendKalshiPositionResponse = {
    gameId: "knicks-cavs-demo",
    updatedAt: new Date().toISOString(),
    positions: [
      {
        id: "knicks-moneyline",
        marketTitle: "Will the Knicks beat the Cavaliers?",
        platform: "Kalshi",
        side: "YES",
        contracts: 10,
        entryPriceCents: 48,
        currentPriceCents: 62,
        whatNeedsToHappen: "The Knicks need to finish ahead at the final buzzer."
      },
      {
        id: "brunson-25",
        marketTitle: "Will Jalen Brunson score 25+ points?",
        platform: "Kalshi",
        side: "YES",
        contracts: 5,
        entryPriceCents: 52,
        currentPriceCents: 67,
        whatNeedsToHappen: "Needs 7 more points from Brunson to cash.",
        marketLeg: {
          id: "brunson-points-leg",
          playerName: "Jalen Brunson",
          statType: "points",
          direction: "over",
          current: 18,
          target: 25,
          unit: "pts",
          whatNeedsToHappen: "Needs 7 more points from Brunson to cash."
        }
      }
    ]
  };

  return mapBackendResponsesToOverlayData(initialGame, initialPositions);
}

export function mapBackendResponsesToOverlayData(
  gameResponse: BackendGameResponse,
  positionsResponse: BackendKalshiPositionResponse
): OverlayData {
  const gameState: GameState = {
    title: gameResponse.title,
    gameStatus: gameResponse.gameStatus,
    quarter: gameResponse.quarter,
    gameClock: gameResponse.gameClock,
    possession: gameResponse.possessionTeam,
    homeTeam: {
      id: "NYK",
      city: "New York",
      name: "Knicks",
      shortName: gameResponse.homeTeam.shortName,
      score: gameResponse.homeTeam.score
    },
    awayTeam: {
      id: "CLE",
      city: "Cleveland",
      name: "Cavaliers",
      shortName: gameResponse.awayTeam.shortName,
      score: gameResponse.awayTeam.score
    },
    playerStats: gameResponse.playerStats.map(derivePlayerStat),
    updatedAt: gameResponse.updatedAt
  };

  return {
    gameState,
    positions: positionsResponse.positions.map(derivePosition)
  };
}
