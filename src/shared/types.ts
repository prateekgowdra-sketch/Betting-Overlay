export type TeamId = "NYK" | "CLE";

export type PositionStatus = "on-track" | "sweating" | "danger" | "won" | "lost";

export interface GameTeam {
  id: TeamId;
  city: string;
  name: string;
  shortName: string;
  score: number;
}

export interface GameState {
  title: string;
  gameStatus: "upcoming" | "live" | "final";
  quarter: string;
  gameClock: string;
  possession: TeamId;
  homeTeam: GameTeam;
  awayTeam: GameTeam;
}

export interface Position {
  id: string;
  marketTitle: string;
  platform: string;
  side: "YES" | "NO";
  contracts: number;
  entryPriceCents: number;
  currentPriceCents: number;
  status: PositionStatus;
  progress: number;
  whatNeedsToHappen: string;
}

export interface PlayerProp {
  id: string;
  player: string;
  team: TeamId;
  statLabel: string;
  direction: "over" | "under";
  current: number;
  target: number;
  unit: string;
  progress: number;
  status: PositionStatus;
  whatIsNeeded: string;
}

export interface DemoState {
  game: GameState;
  positions: Position[];
  playerProps: PlayerProp[];
  updatedAt: string;
}
