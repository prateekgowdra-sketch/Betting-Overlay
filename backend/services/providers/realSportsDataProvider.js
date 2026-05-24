export class RealSportsDataProvider {
  getName() {
    return "real";
  }

  getSupportedGames() {
    return [];
  }

  getTodayGames() {
    return [];
  }

  async getLiveGame() {
    return null;
  }

  async getPlayerStats() {
    return null;
  }
}
