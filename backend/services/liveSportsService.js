import { BalldontlieProvider } from "./providers/balldontlieProvider.js";
import { MockSportsProvider } from "./providers/mockSportsProvider.js";
import { SportsDataIoProvider } from "./providers/sportsDataIoProvider.js";
import { TheOddsApiProvider } from "./providers/theOddsApiProvider.js";

const mockProvider = new MockSportsProvider();
const PROVIDERS = {
  mock: mockProvider,
  balldontlie: new BalldontlieProvider({ fallbackProvider: mockProvider }),
  the_odds_api: new TheOddsApiProvider({ fallbackProvider: mockProvider }),
  sportsdataio: new SportsDataIoProvider({ fallbackProvider: mockProvider })
};

function resolveProvider() {
  const requestedProvider = (process.env.SPORTS_DATA_PROVIDER || "mock").toLowerCase();

  if (!PROVIDERS[requestedProvider]) {
    console.warn(
      `[liveSports] Unknown SPORTS_DATA_PROVIDER "${requestedProvider}". Falling back to mock provider.`
    );
  }

  return PROVIDERS[requestedProvider] ?? PROVIDERS.mock;
}

class LiveSportsService {
  getProvider() {
    return resolveProvider();
  }

  getProviderName() {
    return this.getProvider().getName();
  }

  getSupportedGames() {
    return this.getProvider().getSupportedGames();
  }

  async getTodayGames() {
    const provider = this.getProvider();

    if (typeof provider.getTodayGames === "function") {
      return provider.getTodayGames();
    }

    return provider.getSupportedGames();
  }

  async getLiveGame(gameId, demoMode) {
    return this.getProvider().getLiveGame(gameId, demoMode);
  }

  async getPlayerStats(gameId, demoMode) {
    return this.getProvider().getPlayerStats(gameId, demoMode);
  }
}

export const liveSportsService = new LiveSportsService();
