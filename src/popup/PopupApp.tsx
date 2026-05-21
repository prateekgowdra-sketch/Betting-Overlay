import { useEffect, useState } from "react";
import {
  AppSettings,
  getAppSettings,
  saveAppSettings
} from "../shared/storage";
import { liveStatsService } from "../services/liveStatsService";

export function PopupApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [gameTitle, setGameTitle] = useState("Loading...");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void getAppSettings().then((nextSettings) => {
      setSettings(nextSettings);
      const selectedGame =
        liveStatsService.getSupportedGames().find((game) => game.id === nextSettings.selectedGameId) ??
        liveStatsService.getSupportedGames()[0];
      setGameTitle(selectedGame?.label ?? "Knicks vs Cavaliers Demo");
    });
  }, []);

  async function persist(next: AppSettings) {
    setSettings(next);
    setIsSaving(true);
    await saveAppSettings(next);
    setIsSaving(false);
  }

  if (!settings) {
    return <div className="popup-shell loading">Loading settings...</div>;
  }

  const games = liveStatsService.getSupportedGames();

  return (
    <div className="popup-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">Live Stats MVP</div>
          <h1>Kalshi Live Overlay</h1>
          <p>Stats refresh automatically every 15 seconds through the live stats service layer.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Feed Settings</h2>
          <span className={`saving-pill ${isSaving ? "active" : ""}`}>{isSaving ? "Saving" : "Ready"}</span>
        </div>

        <div className="field-grid single-column">
          <label>
            Selected game
            <select
              value={settings.selectedGameId}
              onChange={(event) =>
                void persist({
                  ...settings,
                  selectedGameId: event.target.value
                })
              }
            >
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.label}
                </option>
              ))}
            </select>
          </label>

          <label className="toggle-row">
            <span>Demo mode</span>
            <input
              type="checkbox"
              checked={settings.demoMode}
              onChange={(event) =>
                void persist({
                  ...settings,
                  demoMode: event.target.checked
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Current Feed</h2>
          <span className="small-copy">{settings.demoMode ? "Mock live sequence" : "Static API stub"}</span>
        </div>

        <div className="positions-list">
          <article className="position-card">
            <div className="position-topline">
              <span className="market">{gameTitle}</span>
            </div>
            <div className="position-note">
              The overlay auto-syncs score, clock, and tracked player stats from the local backend API routes.
            </div>
            <div className="small-copy">
              Backend target `http://localhost:3001/api/live/game/{settings.selectedGameId}`
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
