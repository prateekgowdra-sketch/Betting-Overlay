import {
  BackendGameResponse,
  BackendKalshiMarketResponse,
  BackendKalshiPositionResponse,
  BackendPlayersResponse
} from "../shared/overlayState";
import {
  KalshiMarketOrderbook,
  KalshiMarketSnapshot,
  KalshiOverlayState,
  KalshiSportFilterOption
} from "../shared/types";
import { buildApiUrl } from "./apiBase";

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
  kalshiEnv?: string;
  kalshiEnvironment?: string;
  usingKalshiAsPrimaryProvider?: boolean;
  kalshiPublicEnv?: string;
}

export interface KalshiMarketsResponse {
  mode: "mock" | "real";
  environment: "demo" | "production";
  markets: KalshiMarketSnapshot[];
  cursor: string | null;
  queryInfo?: {
    originalQuery: string;
    expandedTerms: string[];
    detectedTeams: Array<{
      sport: string;
      team: string;
      abbreviation: string;
      matchedAliases: string[];
    }>;
    detectedSports: string[];
    resultCount: number;
  };
}

export interface KalshiSportsFiltersResponse {
  source: "kalshi";
  sports: KalshiSportFilterOption[];
}

export interface KalshiOrderbookResponse {
  mode: "mock" | "real";
  environment: "demo" | "production";
  orderbook: KalshiMarketOrderbook;
}

export interface KalshiAuthHealthResponse {
  mode: "mock" | "real";
  environment: "demo" | "production";
  publicEnvironment: "demo" | "production";
  configured: boolean;
  hasApiKeyId: boolean;
  hasPrivateKeyPath: boolean;
  readOnly: boolean;
  message: string;
}

export interface KalshiAccountPositionsResponse {
  mode: "mock" | "real";
  environment: "demo" | "production";
  updatedAt: string;
  positions: NonNullable<KalshiMarketSnapshot["position"]>[];
}

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
    const response = await fetch(buildApiUrl("/health"));

    if (!response.ok) {
      throw new Error("Failed to fetch backend status");
    }

    return (await response.json()) as BackendStatusResponse;
  }

  async getOverlayState(tickers: string[] = []): Promise<KalshiOverlayState> {
    const url = new URL(buildApiUrl("/overlay/state"), globalThis.location?.origin);

    if (tickers.length > 0) {
      url.searchParams.set("tickers", tickers.join(","));
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error("Failed to fetch overlay state");
    }

    return (await response.json()) as KalshiOverlayState;
  }

  async getKalshiAuthHealth(): Promise<KalshiAuthHealthResponse> {
    const response = await fetch(buildApiUrl("/kalshi/auth/health"));

    if (!response.ok) {
      throw new Error("Failed to fetch Kalshi auth health");
    }

    return (await response.json()) as KalshiAuthHealthResponse;
  }

  async getKalshiAccountPositions(): Promise<KalshiAccountPositionsResponse> {
    const response = await fetch(buildApiUrl("/kalshi/positions"));

    if (!response.ok) {
      throw new Error("Failed to fetch Kalshi account positions");
    }

    return (await response.json()) as KalshiAccountPositionsResponse;
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

  async getKalshiMarkets(params: {
    limit?: number;
    cursor?: string;
    status?: string;
    tickers?: string[];
    query?: string;
  } = {}): Promise<KalshiMarketsResponse> {
    const url = new URL(buildApiUrl("/kalshi/markets"), globalThis.location?.origin);

    if (typeof params.limit === "number") {
      url.searchParams.set("limit", String(params.limit));
    }

    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }

    if (params.status) {
      url.searchParams.set("status", params.status);
    }

    if (params.query) {
      url.searchParams.set("q", params.query);
    }

    if (params.tickers && params.tickers.length > 0) {
      url.searchParams.set("tickers", params.tickers.join(","));
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error("Failed to fetch Kalshi markets");
    }

    return (await response.json()) as KalshiMarketsResponse;
  }

  async getKalshiSportsFilters(): Promise<KalshiSportsFiltersResponse> {
    const response = await fetch(buildApiUrl("/kalshi/sports/filters"));

    if (!response.ok) {
      throw new Error("Failed to fetch Kalshi sports filters");
    }

    return (await response.json()) as KalshiSportsFiltersResponse;
  }

  async getKalshiSportsMarkets(params: {
    sport?: string;
    competition?: string;
    scope?: string;
    status?: string;
    search?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<KalshiMarketsResponse> {
    const url = new URL(buildApiUrl("/kalshi/sports/markets"), globalThis.location?.origin);

    if (params.sport) {
      url.searchParams.set("sport", params.sport);
    }

    if (params.competition) {
      url.searchParams.set("competition", params.competition);
    }

    if (params.scope) {
      url.searchParams.set("scope", params.scope);
    }

    if (params.status) {
      url.searchParams.set("status", params.status);
    }

    if (params.search) {
      url.searchParams.set("search", params.search);
    }

    if (typeof params.limit === "number") {
      url.searchParams.set("limit", String(params.limit));
    }

    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      let message = "Failed to fetch Kalshi sports markets";

      try {
        const payload = (await response.json()) as { details?: string; error?: string };
        message = payload.details || payload.error || message;
      } catch {
        message = response.status === 429 ? "Kalshi rate limited the market search." : message;
      }

      throw new Error(message);
    }

    return (await response.json()) as KalshiMarketsResponse;
  }

  async getKalshiMarketOrderbook(ticker: string): Promise<KalshiOrderbookResponse> {
    const response = await fetch(
      buildApiUrl(`/kalshi/market/${encodeURIComponent(ticker)}/orderbook`)
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Kalshi orderbook ${ticker}`);
    }

    return (await response.json()) as KalshiOrderbookResponse;
  }

  private buildUrl(path: string): string {
    const url = new URL(buildApiUrl(path), globalThis.location?.origin);
    url.searchParams.set("demoMode", String(this.demoMode));
    return url.toString();
  }
}

export const backendApi = new BackendApi();
