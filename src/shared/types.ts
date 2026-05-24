export type TeamId = "NYK" | "CLE" | "OKC" | "SAS";
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

export type ManualLegLiveStatus = "hit" | "live" | "behind" | "unavailable";

export type OverlayDataMode = "demo" | "manual";
export type OddsFormat = "american";
export interface OddsMovement {
  originalImpliedProbability: number;
  currentImpliedProbability: number;
  probabilityDirection: "up" | "down" | "same";
  payoutDirection: "better" | "worse" | "same";
}
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
  originalOdds?: number;
  currentOdds?: number;
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
  marketTicker?: string;
  userSide: ManualPredictionSide;
  originalPrice?: number;
  currentPrice?: number;
  contractsOwned?: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface ManualLegOverlayChip {
  id: string;
  label: string;
  type: ManualLegType;
  current?: number;
  target?: number;
  progressPercent: number;
  status: ManualLegLiveStatus;
  needsText: string;
  oddsText?: string;
  marketTitle?: string;
  marketTicker?: string;
  userSide?: ManualPredictionSide;
  yesPrice?: number;
  noPrice?: number;
  originalPrice?: number;
  currentPrice?: number;
  contractsOwned?: number;
  chanceText?: string;
}
