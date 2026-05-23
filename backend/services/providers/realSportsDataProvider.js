export class RealSportsDataProvider {
  getName() {
    return "real";
  }

  getSupportedGames() {
    return [];
  }

  async getLiveGame() {
    return null;
  }

  async getPlayerStats() {
    return null;
  }
}
