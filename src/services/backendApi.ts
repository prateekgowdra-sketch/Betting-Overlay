import {
  BackendGameResponse,
  BackendKalshiMarketResponse,
  BackendKalshiPositionResponse,
  BackendPlayersResponse
} from "../shared/overlayState";

export interface SupportedGame {
  id: string;
  label: string;
}

const API_BASE_URL = "http://localhost:3001/api";

const SUPPORTED_GAMES: SupportedGame[] = [
  {
    id: "knicks-cavs-demo",
    label: "Knicks vs Cavaliers Demo"
  }
];

class BackendApi {
  private demoMode = true;

  setDemoMode(enabled: boolean): void {
    this.demoMode = enabled;
  }

  getSupportedGames(): SupportedGame[] {
    return SUPPORTED_GAMES;
  }

  async getGameState(gameId: string): Promise<BackendGameResponse> {
    const response = await fetch(this.buildUrl(`/live/game/${gameId}`));

    if (!response.ok) {
      throw new Error(`Failed to fetch game state for ${gameId}`);
    }

    return (await response.json()) as BackendGameResponse;
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
