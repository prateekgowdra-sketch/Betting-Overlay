export interface LiveGameStatsResponse {
  gameId: string;
  gameStatus: "upcoming" | "live" | "final";
  quarter: string;
  gameClock: string;
  possessionTeam: "NYK" | "CLE";
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
  updatedAt: string;
}

export interface LivePlayerStatLine {
  playerName: string;
  team: "NYK" | "CLE";
  stats: {
    points?: number;
    rebounds?: number;
  };
}

export interface PlayerStatsResponse {
  gameId: string;
  updatedAt: string;
  players: LivePlayerStatLine[];
}

export interface SupportedGame {
  id: string;
  label: string;
}

const API_BASE_URL = "http://localhost:3001/api/live";

const SUPPORTED_GAMES: SupportedGame[] = [
  {
    id: "knicks-cavs-demo",
    label: "Knicks vs Cavaliers Demo"
  }
];

class LiveStatsService {
  private demoMode = true;

  setDemoMode(enabled: boolean): void {
    this.demoMode = enabled;
  }

  getSupportedGames(): SupportedGame[] {
    return SUPPORTED_GAMES;
  }

  async getLiveGameStats(gameId: string): Promise<LiveGameStatsResponse> {
    const response = await fetch(this.buildUrl(`/game/${gameId}`));

    if (!response.ok) {
      throw new Error(`Failed to fetch live game stats for ${gameId}`);
    }

    return (await response.json()) as LiveGameStatsResponse;
  }

  async getPlayerStats(
    gameId: string,
    playerNames: string[]
  ): Promise<PlayerStatsResponse> {
    const url = this.buildUrl(`/players/${gameId}`, {
      names: playerNames.join(",")
    });
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch player stats for ${gameId}`);
    }

    return (await response.json()) as PlayerStatsResponse;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${API_BASE_URL}${path}`);
    url.searchParams.set("demoMode", String(this.demoMode));

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }
}

export const liveStatsService = new LiveStatsService();
