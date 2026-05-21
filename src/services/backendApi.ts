import {
  BackendGameResponse,
  BackendKalshiPositionResponse
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

  private buildUrl(path: string): string {
    const url = new URL(`${API_BASE_URL}${path}`);
    url.searchParams.set("demoMode", String(this.demoMode));
    return url.toString();
  }
}

export const backendApi = new BackendApi();
