import {
  BackendGameResponse,
  BackendKalshiMarketResponse,
  BackendKalshiPositionResponse,
  BackendPlayersResponse
} from "../shared/overlayState";

export interface SupportedGame {
  id: string;
  label: string;
  providerGameId?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeAbbr?: string;
  awayAbbr?: string;
  scheduledTime?: string;
  status?: string;
  period?: string;
  clock?: string;
  homeScore?: number;
  awayScore?: number;
  source?: string;
}

export interface BackendStatusResponse {
  status: string;
  message: string;
  sportsDataProvider?: string;
  kalshiMode?: string;
  kalshiEnvironment?: string;
}

const API_BASE_URL = "http://localhost:3001/api";
const FALLBACK_GAMES: SupportedGame[] = [
  {
    id: "knicks-cavs-demo",
    label: "CLE @ NYK",
    homeTeam: "New York Knicks",
    awayTeam: "Cleveland Cavaliers",
    homeAbbr: "NYK",
    awayAbbr: "CLE",
    source: "mock"
  },
  {
    id: "thunder-spurs-demo",
    label: "SAS @ OKC",
    homeTeam: "Oklahoma City Thunder",
    awayTeam: "San Antonio Spurs",
    homeAbbr: "OKC",
    awayAbbr: "SAS",
    source: "mock"
  }
];

class BackendApi {
  private demoMode = true;
  private supportedGames: SupportedGame[] = FALLBACK_GAMES;

  setDemoMode(enabled: boolean): void {
    this.demoMode = enabled;
  }

  getSupportedGames(): SupportedGame[] {
    return this.supportedGames;
  }

  async getTodayGames(): Promise<SupportedGame[]> {
    const response = await fetch(this.buildUrl("/live/games/today"));

    if (!response.ok) {
      throw new Error("Failed to fetch available games");
    }

    const games = (await response.json()) as Array<{
      gameId: string;
      providerGameId?: string;
      homeTeam: string;
      awayTeam: string;
      homeAbbr: string;
      awayAbbr: string;
      scheduledTime: string;
      status: string;
      period: string;
      clock: string;
      homeScore: number;
      awayScore: number;
      source: string;
    }>;

    this.supportedGames = games.map((game) => ({
      id: game.gameId,
      label: `${game.awayAbbr} @ ${game.homeAbbr}`,
      providerGameId: game.providerGameId,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeAbbr: game.homeAbbr,
      awayAbbr: game.awayAbbr,
      scheduledTime: game.scheduledTime,
      status: game.status,
      period: game.period,
      clock: game.clock,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      source: game.source
    }));

    return this.supportedGames;
  }

  async getGameState(gameId: string): Promise<BackendGameResponse> {
    const response = await fetch(this.buildUrl(`/live/game/${gameId}`));

    if (!response.ok) {
      throw new Error(`Failed to fetch game state for ${gameId}`);
    }

    return (await response.json()) as BackendGameResponse;
  }

  async getBackendStatus(): Promise<BackendStatusResponse> {
    const response = await fetch("http://localhost:3001/health");

    if (!response.ok) {
      throw new Error("Failed to fetch backend status");
    }

    return (await response.json()) as BackendStatusResponse;
  }

  async getKalshiPositions(gameId: string): Promise<BackendKalshiPositionResponse> {
    const response = await fetch(this.buildUrl(`/kalshi/positions/${gameId}`));

    if (!response.ok) {
      throw new Error(`Failed to fetch Kalshi positions for ${gameId}`);
    }

    return (await response.json()) as BackendKalshiPositionResponse;
  }

  async getPlayerStats(gameId: string): Promise<BackendPlayersResponse> {
    const response = await fetch(this.buildUrl(`/live/players/${gameId}`));

    if (!response.ok) {
      throw new Error(`Failed to fetch player stats for ${gameId}`);
    }

    return (await response.json()) as BackendPlayersResponse;
  }

  async getKalshiMarket(ticker: string): Promise<BackendKalshiMarketResponse> {
    const response = await fetch(this.buildUrl(`/kalshi/market/${encodeURIComponent(ticker)}`));

    if (!response.ok) {
      throw new Error(`Failed to fetch Kalshi market ${ticker}`);
    }

    return (await response.json()) as BackendKalshiMarketResponse;
  }

  private buildUrl(path: string): string {
    const url = new URL(`${API_BASE_URL}${path}`);
    url.searchParams.set("demoMode", String(this.demoMode));
    return url.toString();
  }
}

export const backendApi = new BackendApi();
