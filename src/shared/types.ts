export type TeamId = "NYK" | "CLE";
export type StatType =
  | "points"
  | "rebounds"
  | "assists"
  | "threes_made"
  | "steals"
  | "blocks"
  | "turnovers"
  | "three_pointers"
  | "passing_yards"
  | "rushing_yards"
  | "receiving_yards"
  | "touchdowns"
  | "goals"
  | "strikeouts";

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
  statType: StatType;
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
  statType: StatType;
  direction: "over" | "under";
  current: number;
  target: number;
  unit: string;
  progress: number;
  status: PositionStatus;
  whatNeedsToHappen: string;
}

export interface ParsedMarket {
  marketType: "team" | "player" | "unknown";
  isTeamMarket: boolean;
  isPlayerMarket: boolean;
  teamMarketTitle?: string;
  playerName?: string;
  target?: number;
  direction?: "over" | "under";
  statType?: StatType;
  whatNeedsToHappen: string;
  marketLeg?: MarketLeg;
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

export type OverlayDataMode = "demo" | "manual";
export type OddsFormat = "american";
export type ManualLegType =
  | "player_prop"
  | "team_moneyline"
  | "spread"
  | "game_total"
  | "prediction_market";
export type ManualDirection = "over" | "under";
export type ManualPredictionSide = "YES" | "NO";
export type SpreadSide = "plus" | "minus";

export interface ManualParlayLegBase {
  id: string;
  type: ManualLegType;
}

export interface ManualPlayerPropLeg extends ManualParlayLegBase {
  type: "player_prop";
  playerName: string;
  team: string;
  statType: "points" | "rebounds" | "assists" | "threes_made" | "steals" | "blocks" | "turnovers";
  direction: ManualDirection;
  line: number;
}

export interface ManualTeamMoneylineLeg extends ManualParlayLegBase {
  type: "team_moneyline";
  team: string;
  opponent?: string;
}

export interface ManualSpreadLeg extends ManualParlayLegBase {
  type: "spread";
  team: string;
  side: SpreadSide;
  line: number;
}

export interface ManualGameTotalLeg extends ManualParlayLegBase {
  type: "game_total";
  matchup: string;
  direction: ManualDirection;
  line: number;
}

export interface ManualPredictionMarketLeg extends ManualParlayLegBase {
  type: "prediction_market";
  marketTitle: string;
  side: ManualPredictionSide;
  originalPrice?: number;
  currentPrice?: number;
  whatNeedsToHappen: string;
}

export type ManualParlayLeg =
  | ManualPlayerPropLeg
  | ManualTeamMoneylineLeg
  | ManualSpreadLeg
  | ManualGameTotalLeg
  | ManualPredictionMarketLeg;

export interface ManualParlay {
  id: string;
  parlayName: string;
  amountWagered: number;
  estimatedPayout: number;
  originalOdds: number;
  currentOdds: number;
  oddsFormat: OddsFormat;
  legs: ManualParlayLeg[];
  updatedAt: string;
}
