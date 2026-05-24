export class SportsDataIoProvider {
  constructor({ fallbackProvider }) {
    this.fallbackProvider = fallbackProvider;
    this.loggedMissingKey = false;
  }

  getName() {
    return "sportsdataio";
  }

  getApiKey() {
    return process.env.SPORTSDATAIO_API_KEY?.trim() || "";
  }

  logWarningOnce() {
    if (this.loggedMissingKey) {
      return;
    }

    console.warn(
      "[liveSports] SPORTSDATAIO_API_KEY is missing or provider is not implemented yet. Falling back to mock provider."
    );
    this.loggedMissingKey = true;
  }

  getSupportedGames() {
    return this.fallbackProvider.getSupportedGames();
  }

  getTodayGames() {
    if (!this.getApiKey()) {
      this.logWarningOnce();
    }

    return this.fallbackProvider.getTodayGames();
  }

  async getLiveGame(gameId, demoMode) {
    if (!this.getApiKey()) {
      this.logWarningOnce();
    }

    return this.fallbackProvider.getLiveGame(gameId, demoMode);
  }

  async getPlayerStats(gameId, demoMode) {
    if (!this.getApiKey()) {
      this.logWarningOnce();
    }

    return this.fallbackProvider.getPlayerStats(gameId, demoMode);
  }
}
