export type TeamId = "NYK" | "CLE";

export type PositionStatus = "on-track" | "sweating" | "danger" | "won" | "lost";

export interface GameTeam {
  id: TeamId;
  city: string;
  name: string;
  shortName: string;
  score: number;
}

export interface PlayerStat {
  id: string;
  playerName: string;
  team: TeamId;
  statType: "points" | "rebounds";
  direction: "over" | "under";
  current: number;
  target: number;
  unit: string;
  progress: number;
  status: PositionStatus;
  whatIsNeeded: string;
}

export interface MarketLeg {
  id: string;
  playerName: string;
  statType: "points" | "rebounds";
  direction: "over" | "under";
  current: number;
  target: number;
  unit: string;
  progress: number;
  status: PositionStatus;
  whatNeedsToHappen: string;
}

export interface KalshiPosition {
  id: string;
  marketTitle: string;
  platform: string;
  side: "YES" | "NO";
  contracts: number;
  entryPriceCents: number;
  currentPriceCents: number;
  currentValueCents: number;
  costBasisCents: number;
  unrealizedPnLCents: number;
  status: PositionStatus;
  progress: number;
  whatNeedsToHappen: string;
  leg?: MarketLeg;
}

export interface GameState {
  title: string;
  gameStatus: "upcoming" | "live" | "final";
  quarter: string;
  gameClock: string;
  possession: TeamId;
  homeTeam: GameTeam;
  awayTeam: GameTeam;
  playerStats: PlayerStat[];
  updatedAt: string;
}

export interface OverlayStatus {
  state: "loading" | "ready" | "error";
  message?: string;
  lastUpdated?: string;
}

export interface OverlayData {
  gameState: GameState;
  positions: KalshiPosition[];
}
