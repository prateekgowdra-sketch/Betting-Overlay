import {
  LiveGameStatsResponse,
  PlayerStatsResponse
} from "../services/liveStatsService";
import { DemoState, PlayerProp, Position, PositionStatus } from "./types";

export const STORAGE_KEY = "kalshi-live-overlay-state";

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

function deriveLegStatus(
  direction: "over" | "under",
  current: number,
  target: number
): PositionStatus {
  if (direction === "over") {
    if (current >= target) {
      return "won";
    }

    return "sweating";
  }

  if (current > target) {
    return "lost";
  }

  return "sweating";
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function positionProgress(current: number, target: number): number {
  return clampProgress((current / target) * 100);
}

function propProgress(current: number, target: number): number {
  return clampProgress((current / target) * 100);
}

export function buildInitialState(): DemoState {
  const brunsonPositionPoints = 18;
  const brunsonLegPoints = 18;
  const townsRebounds = 8;
  const mitchellPoints = 21;

  const positions: Position[] = [
    {
      id: "knicks-moneyline",
      marketTitle: "Will the Knicks beat the Cavaliers?",
      platform: "Kalshi",
      side: "YES",
      contracts: 10,
      entryPriceCents: 48,
      currentPriceCents: 62,
      status: "won",
      progress: 68,
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
      status: derivePositionStatus(positionProgress(brunsonPositionPoints, 25)),
      progress: positionProgress(brunsonPositionPoints, 25),
      whatNeedsToHappen: `${Math.max(0, 25 - brunsonPositionPoints)} more point${25 - brunsonPositionPoints === 1 ? "" : "s"} from Brunson to cash.`
    }
  ];

  const playerProps: PlayerProp[] = [
    {
      id: "brunson-points",
      player: "Jalen Brunson",
      team: "NYK",
      statLabel: "Points",
      direction: "over",
      current: brunsonLegPoints,
      target: 25,
      unit: "pts",
      progress: propProgress(brunsonLegPoints, 25),
      status: deriveLegStatus("over", brunsonLegPoints, 25),
      whatIsNeeded: `Needs ${Math.max(0, 25 - brunsonLegPoints)} more`
    },
    {
      id: "towns-rebounds",
      player: "Karl-Anthony Towns",
      team: "NYK",
      statLabel: "Rebounds",
      direction: "over",
      current: townsRebounds,
      target: 10,
      unit: "reb",
      progress: propProgress(townsRebounds, 10),
      status: deriveLegStatus("over", townsRebounds, 10),
      whatIsNeeded: `Needs ${Math.max(0, 10 - townsRebounds)} more`
    },
    {
      id: "mitchell-points",
      player: "Donovan Mitchell",
      team: "CLE",
      statLabel: "Points",
      direction: "under",
      current: mitchellPoints,
      target: 30,
      unit: "pts",
      progress: propProgress(mitchellPoints, 30),
      status: deriveLegStatus("under", mitchellPoints, 30),
      whatIsNeeded: `Can allow ${Math.max(0, 30 - mitchellPoints)} more`
    }
  ];

  return {
    game: {
      title: "Knicks vs Cavaliers",
      gameStatus: "live",
      quarter: "Q3",
      gameClock: "10:58",
      possession: "NYK",
      homeTeam: {
        id: "NYK",
        city: "New York",
        name: "Knicks",
        shortName: "NYK",
        score: 82
      },
      awayTeam: {
        id: "CLE",
        city: "Cleveland",
        name: "Cavaliers",
        shortName: "CLE",
        score: 77
      }
    },
    positions,
    playerProps,
    updatedAt: new Date().toISOString()
  };
}

export function applyLiveStatsToState(
  state: DemoState,
  gameStats: LiveGameStatsResponse,
  playerStats: PlayerStatsResponse
): DemoState {
  const playerMap = new Map(playerStats.players.map((player) => [player.playerName, player]));

  const nextState: DemoState = {
    ...state,
    game: {
      ...state.game,
      title: "Knicks vs Cavaliers",
      gameStatus: gameStats.gameStatus,
      quarter: gameStats.quarter,
      gameClock: gameStats.gameClock,
      possession: gameStats.possessionTeam,
      homeTeam: {
        ...state.game.homeTeam,
        score: gameStats.homeTeam.score
      },
      awayTeam: {
        ...state.game.awayTeam,
        score: gameStats.awayTeam.score
      }
    },
    playerProps: state.playerProps.map((prop) => {
      const player = playerMap.get(prop.player);

      if (!player) {
        return prop;
      }

      if (prop.statLabel === "Points" && typeof player.stats.points === "number") {
        return {
          ...prop,
          current: player.stats.points
        };
      }

      if (prop.statLabel === "Rebounds" && typeof player.stats.rebounds === "number") {
        return {
          ...prop,
          current: player.stats.rebounds
        };
      }

      return prop;
    }),
    updatedAt: gameStats.updatedAt
  };

  return recalculateState(nextState);
}

export function recalculateState(state: DemoState): DemoState {
  const brunson = state.playerProps.find((prop) => prop.id === "brunson-points");
  const mitchell = state.playerProps.find((prop) => prop.id === "mitchell-points");
  const positions: Position[] = state.positions.map((position) => {
    if (position.id === "knicks-moneyline") {
      const margin = state.game.homeTeam.score - state.game.awayTeam.score;
      const progress = clampProgress(((margin + 12) / 24) * 100);
      const status: PositionStatus =
        margin > 0 ? (margin >= 8 ? "won" : margin >= 4 ? "on-track" : "sweating") : "danger";

      return {
        ...position,
        progress,
        status,
        currentPriceCents: margin >= 8 ? 76 : margin >= 4 ? 62 : margin > 0 ? 55 : 34,
        whatNeedsToHappen:
          margin > 0
            ? "The Knicks need to stay in front until the final buzzer."
            : `The Knicks need to erase a ${Math.abs(margin)}-point deficit and win.`
      };
    }

    if (position.id === "brunson-25" && brunson) {
      const target = 25;
      const remaining = Math.max(0, target - brunson.current);

      return {
        ...position,
        progress: propProgress(brunson.current, target),
        status: derivePositionStatus(propProgress(brunson.current, target)),
        currentPriceCents: remaining === 0 ? 91 : brunson.current >= 24 ? 67 : brunson.current >= 20 ? 59 : 44,
        whatNeedsToHappen:
          remaining === 0
            ? "Brunson has already cleared 25 points."
            : `${remaining} more point${remaining === 1 ? "" : "s"} from Brunson to cash.`
      };
    }

    return position;
  });

  const playerProps: PlayerProp[] = state.playerProps.map((prop) => {
    const progress = propProgress(prop.current, prop.target);

    if (prop.direction === "over") {
      const remaining = Math.max(0, prop.target - prop.current);

      return {
        ...prop,
        progress,
        status: deriveLegStatus("over", prop.current, prop.target),
        whatIsNeeded: remaining === 0 ? "Cashed" : `Needs ${remaining} more`
      };
    }

    const remaining = Math.max(0, prop.target - prop.current);

    return {
      ...prop,
      progress,
      status: deriveLegStatus("under", prop.current, prop.target),
      whatIsNeeded: prop.current > prop.target ? "Dead" : `Can allow ${remaining} more`
    };
  });

  return {
    ...state,
    positions,
    playerProps,
    updatedAt: new Date().toISOString()
  };
}
