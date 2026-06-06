export type TeamId = string;
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

export type KalshiMarketSide = "YES" | "NO";
export type KalshiMarketLifecycleStatus =
  | "open"
  | "closed"
  | "finalized"
  | "settled"
  | "unavailable";
export type KalshiMarketDataStatus =
  | "live"
  | "stale"
  | "unavailable"
  | "finalized"
  | "settled";

export interface KalshiWatchlistItem {
  id: string;
  ticker: string;
  eventTicker?: string | null;
  title: string;
  displayTitle?: string | null;
  sport?: string | null;
  competition?: string | null;
  scope?: string | null;
  userSide: KalshiMarketSide;
  entryPriceCents: number;
  contracts: number;
  amountRisked: number;
  notes: string;
  hidden?: boolean;
  hiddenAt?: string | null;
  removedAt?: string | null;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KalshiComboLeg {
  id: string;
  ticker: string;
  eventTicker?: string | null;
  title: string;
  displayTitle?: string | null;
  subtitle?: string | null;
  sport?: string | null;
  competition?: string | null;
  status?: string | null;
  lifecycleStatus?: KalshiMarketLifecycleStatus;
  isResolved?: boolean;
  closeTime?: string | null;
  userSide: KalshiMarketSide;
  entryPriceCents: number;
  amountRisked?: number;
  notes: string;
  addedAt?: string;
}

export interface KalshiComboTracker {
  id: string;
  name: string;
  amountRisked: number;
  legs: KalshiComboLeg[];
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KalshiTrackedPosition {
  ticker?: string;
  title?: string;
  side: KalshiMarketSide;
  contracts: number;
  entryPriceCents: number;
  currentPriceCents?: number | null;
  currentValueCents?: number | null;
  costBasisCents?: number | null;
  unrealizedPnLCents?: number | null;
}

export type KalshiBetMovementStatus =
  | "favorable"
  | "unfavorable"
  | "unchanged"
  | "unavailable";

export interface KalshiBetPerformance {
  currentSidePriceCents: number | null;
  movementCents: number | null;
  movementStatus: KalshiBetMovementStatus;
  estimatedCurrentValue: number | null;
  estimatedProfitLoss: number | null;
  estimatedPayout: number | null;
  estimatedMaxProfit: number | null;
  amountRisked: number;
  isUsingEntryFallback?: boolean;
}

export interface KalshiLiveContext {
  available: boolean;
  source: "kalshi_live_data" | "unavailable";
  sport?: string | null;
  status?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  period?: string | null;
  clock?: string | null;
  updatedAt?: string | null;
  unavailableReason?: string;
}

export interface KalshiMarketDataQuality {
  marketDataStatus: KalshiMarketDataStatus;
  positionStatus: "matched" | "none" | "unavailable";
  liveContextStatus: "available" | "unavailable";
  lastUpdated: string;
  message?: string;
}

export interface KalshiMarketSnapshot {
  ticker: string;
  eventTicker?: string | null;
  title: string;
  displayTitle?: string | null;
  subtitle?: string;
  sport?: string | null;
  competition?: string | null;
  scope?: string | null;
  eventTitle?: string | null;
  status: string;
  lifecycleStatus?: KalshiMarketLifecycleStatus;
  isActive?: boolean;
  isResolved?: boolean;
  winningSide?: KalshiMarketSide | null;
  resultKnown?: boolean;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  lastPriceCents: number | null;
  previousPriceCents: number | null;
  volume: number | null;
  openInterest: number | null;
  liquidityCents: number | null;
  closeTime?: string | null;
  updatedAt?: string | null;
  position?: KalshiTrackedPosition | null;
  liveContext?: KalshiLiveContext;
  dataQuality?: KalshiMarketDataQuality;
}

export interface KalshiSportFilterOption {
  sportKey: string;
  sportName: string;
  competitions: string[];
  scopes: string[];
}

export interface KalshiOverlayState {
  mode: "kalshi-only";
  watchedMarkets: KalshiMarketSnapshot[];
  positions: KalshiTrackedPosition[];
  manualBets: [];
  comboTrackers?: KalshiComboTracker[];
  alerts?: string[];
  portfolioSummary?: {
    totalRisk?: number | null;
    estimatedValue?: number | null;
    profitLoss?: number | null;
  } | null;
  groups?: {
    active: KalshiMarketSnapshot[];
    settled: KalshiMarketSnapshot[];
    archived: KalshiMarketSnapshot[];
  };
  dataQuality: {
    marketDataStatus: KalshiMarketDataStatus;
    positionsStatus: "available" | "unavailable";
    positionStatus?: "available" | "unavailable";
    lastUpdated: string;
    message?: string;
  };
  updatedAt: string;
}

export interface KalshiOrderbookLevel {
  priceCents: number;
  count: string;
}

export interface KalshiMarketOrderbook {
  ticker: string;
  yes: KalshiOrderbookLevel[];
  no: KalshiOrderbookLevel[];
 }

export interface ResearchSettings {
  enableRealTrading: false;
  maxPaperTradeDollars: number;
  maxDailyRiskDollars: number;
  minimumEdgePercent: number;
  feeSlippageBufferPercent: number;
  manualModelProbability: number;
}

export type ResearchPaperTradeStatus = "open" | "settled" | "exited";
export type ResearchPaperTradeSettlementResult = "WIN" | "LOSS" | "EXIT";

export interface ResearchPaperTrade {
  id: string;
  timestamp: string;
  marketTicker: string;
  marketTitle: string;
  side: KalshiMarketSide;
  entryPriceCents: number;
  modelProbabilityPercent: number;
  winProbabilityPercent?: number | null;
  hitRating?: number | null;
  edgePercent: number;
  netEdgePercent?: number | null;
  suggestedRiskDollars: number;
  riskInputDollars?: number | null;
  contracts?: number | null;
  actualCostDollars?: number | null;
  maxProfitDollars?: number | null;
  maxLossDollars?: number | null;
  expectedValueDollars?: number | null;
  expectedRoiPercent?: number | null;
  status: ResearchPaperTradeStatus;
  marketCategory?: string | null;
  modelReason?: string | null;
  positiveSignal?: string | null;
  negativeSignal?: string | null;
  source?: "manual" | "heuristic" | "arb_scanner";
  exitValueCents?: number | null;
  exitPriceCents?: number | null;
  exitValueDollars?: number | null;
  profitLossDollars?: number | null;
  realizedPnlDollars?: number | null;
  settlementResult?: ResearchPaperTradeSettlementResult | null;
  modelVersion?: string | null;
  settledAt?: string | null;
}

export type ManualLegLiveStatus = "hit" | "live" | "behind" | "unavailable";

export type OverlayDataMode = "markets" | "demo" | "manual";
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
