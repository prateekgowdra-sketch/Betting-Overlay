import { useEffect, useState } from "react";
import {
  AppSettings,
  getAppSettings,
  getManualParlay,
  saveAppSettings,
  saveManualParlay
} from "../shared/storage";
import {
  ManualLegType,
  ManualParlay,
  ManualParlayLeg,
  ManualPredictionSide,
  ManualDirection,
  SpreadSide
} from "../shared/types";
import { backendApi } from "../services/backendApi";
import type { SupportedGame } from "../services/backendApi";
import { formatAmericanOdds } from "../shared/odds";

type LegDraft = {
  type: ManualLegType;
  playerName: string;
  team: string;
  statType: "points" | "rebounds" | "assists" | "threes_made" | "steals" | "blocks" | "turnovers";
  direction: ManualDirection;
  line: string;
  opponent: string;
  spreadSide: SpreadSide;
  matchup: string;
  marketTitle: string;
  marketTicker: string;
  predictionSide: ManualPredictionSide;
  originalOdds: string;
  currentOdds: string;
  originalPrice: string;
  currentPrice: string;
  contractsOwned: string;
  whatNeedsToHappen: string;
};

const DEFAULT_DRAFT: LegDraft = {
  type: "player_prop",
  playerName: "",
  team: "",
  statType: "points",
  direction: "over",
  line: "",
  opponent: "",
  spreadSide: "plus",
  matchup: "",
  marketTitle: "",
  marketTicker: "",
  predictionSide: "YES",
  originalOdds: "",
  currentOdds: "",
  originalPrice: "",
  currentPrice: "",
  contractsOwned: "",
  whatNeedsToHappen: ""
};

function createLegId(): string {
  return `manual-leg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statTypeLabel(statType: LegDraft["statType"]): string {
  switch (statType) {
    case "threes_made":
      return "threes made";
    default:
      return statType;
  }
}

function legSummary(leg: ManualParlayLeg): string {
  switch (leg.type) {
    case "player_prop":
      return `${leg.playerName} ${leg.direction} ${leg.line} ${statTypeLabel(leg.statType)}`;
    case "team_moneyline":
      return `${leg.team} ML${leg.opponent ? ` vs ${leg.opponent}` : ""}`;
    case "spread":
      return `${leg.team} ${leg.side === "plus" ? "+" : "-"}${leg.line}`;
    case "game_total":
      return `${leg.matchup} ${leg.direction} ${leg.line}`;
    case "prediction_market":
      return `${leg.userSide} ${leg.marketTitle}${leg.marketTicker ? ` · ${leg.marketTicker}` : ""}${typeof leg.currentOdds === "number" ? ` · ${formatAmericanOdds(leg.currentOdds)}` : ""}`;
  }
}

function buildLegFromDraft(draft: LegDraft): ManualParlayLeg | null {
  const line = Number(draft.line);
  const originalOdds = draft.originalOdds === "" ? undefined : Number(draft.originalOdds);
  const currentOdds = draft.currentOdds === "" ? undefined : Number(draft.currentOdds);
  const originalPrice = draft.originalPrice === "" ? undefined : Number(draft.originalPrice);
  const currentPrice = draft.currentPrice === "" ? undefined : Number(draft.currentPrice);
  const contractsOwned = draft.contractsOwned === "" ? undefined : Number(draft.contractsOwned);

  switch (draft.type) {
    case "player_prop":
      if (!draft.playerName || !draft.team || Number.isNaN(line)) {
        return null;
      }

      return {
        id: createLegId(),
        type: "player_prop",
        playerName: draft.playerName.trim(),
        team: draft.team.trim(),
        statType: draft.statType,
        direction: draft.direction,
        line,
        originalOdds: Number.isNaN(originalOdds ?? Number.NaN) ? undefined : originalOdds,
        currentOdds: Number.isNaN(currentOdds ?? Number.NaN) ? undefined : currentOdds
      };
    case "team_moneyline":
      if (!draft.team) {
        return null;
      }

      return {
        id: createLegId(),
        type: "team_moneyline",
        team: draft.team.trim(),
        opponent: draft.opponent.trim() || undefined,
        originalOdds: Number.isNaN(originalOdds ?? Number.NaN) ? undefined : originalOdds,
        currentOdds: Number.isNaN(currentOdds ?? Number.NaN) ? undefined : currentOdds
      };
    case "spread":
      if (!draft.team || Number.isNaN(line)) {
        return null;
      }

      return {
        id: createLegId(),
        type: "spread",
        team: draft.team.trim(),
        side: draft.spreadSide,
        line,
        originalOdds: Number.isNaN(originalOdds ?? Number.NaN) ? undefined : originalOdds,
        currentOdds: Number.isNaN(currentOdds ?? Number.NaN) ? undefined : currentOdds
      };
    case "game_total":
      if (!draft.matchup || Number.isNaN(line)) {
        return null;
      }

      return {
        id: createLegId(),
        type: "game_total",
        matchup: draft.matchup.trim(),
        direction: draft.direction,
        line,
        originalOdds: Number.isNaN(originalOdds ?? Number.NaN) ? undefined : originalOdds,
        currentOdds: Number.isNaN(currentOdds ?? Number.NaN) ? undefined : currentOdds
      };
    case "prediction_market":
      if (!draft.marketTitle || !draft.whatNeedsToHappen) {
        return null;
      }

      return {
        id: createLegId(),
        type: "prediction_market",
        marketTitle: draft.marketTitle.trim(),
        marketTicker: draft.marketTicker.trim() || undefined,
        userSide: draft.predictionSide,
        originalOdds: Number.isNaN(originalOdds ?? Number.NaN) ? undefined : originalOdds,
        currentOdds: Number.isNaN(currentOdds ?? Number.NaN) ? undefined : currentOdds,
        originalPrice: Number.isNaN(originalPrice ?? Number.NaN) ? undefined : originalPrice,
        currentPrice: Number.isNaN(currentPrice ?? Number.NaN) ? undefined : currentPrice,
        contractsOwned: Number.isNaN(contractsOwned ?? Number.NaN) ? undefined : contractsOwned,
        whatNeedsToHappen: draft.whatNeedsToHappen.trim()
      };
  }
}

export function PopupApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [manualParlay, setManualParlay] = useState<ManualParlay | null>(null);
  const [gameTitle, setGameTitle] = useState("Loading...");
  const [availableGames, setAvailableGames] = useState<SupportedGame[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<LegDraft>(DEFAULT_DRAFT);
  const [draftError, setDraftError] = useState("");

  useEffect(() => {
    void Promise.all([getAppSettings(), getManualParlay(), backendApi.getTodayGames().catch(() => [])]).then(([nextSettings, nextParlay, games]) => {
      setSettings(nextSettings);
      setManualParlay(nextParlay);
      const safeGames = games.length > 0 ? games : backendApi.getSupportedGames();
      setAvailableGames(safeGames);
      const selectedGame = safeGames.find((game) => game.id === nextSettings.selectedGameId) ?? safeGames[0];
      setGameTitle(selectedGame?.label ?? "Game feed unavailable");

      if (selectedGame && selectedGame.id !== nextSettings.selectedGameId) {
        void saveAppSettings({
          ...nextSettings,
          selectedGameId: selectedGame.id
        }).then(() => setSettings({
          ...nextSettings,
          selectedGameId: selectedGame.id
        }));
      }
    });
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const games = availableGames.length > 0 ? availableGames : backendApi.getSupportedGames();
    const selectedGame = games.find((game) => game.id === settings.selectedGameId) ?? games[0];
    setGameTitle(selectedGame?.label ?? "Game feed unavailable");
  }, [settings, availableGames]);

  async function persistSettings(next: AppSettings) {
    setSettings(next);
    setIsSaving(true);
    await saveAppSettings(next);
    setIsSaving(false);
  }

  async function persistParlay(next: ManualParlay) {
    setManualParlay(next);
    setIsSaving(true);
    await saveManualParlay(next);
    setIsSaving(false);
  }

  if (!settings || !manualParlay) {
    return <div className="popup-shell loading">Loading settings...</div>;
  }

  const currentParlay = manualParlay;
  const games = availableGames.length > 0 ? availableGames : backendApi.getSupportedGames();

  async function addLeg() {
    const nextLeg = buildLegFromDraft(draft);

    if (!nextLeg) {
      setDraftError("Fill in the required fields for this leg type.");
      return;
    }

    setDraftError("");
    await persistParlay({
      ...currentParlay,
      legs: [...currentParlay.legs, nextLeg]
    });
    setDraft(DEFAULT_DRAFT);
  }

  async function removeLeg(legId: string) {
    await persistParlay({
      ...currentParlay,
      legs: currentParlay.legs.filter((leg) => leg.id !== legId)
    });
  }

  return (
    <div className="popup-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">Live Stats MVP</div>
          <h1>Kalshi Live Overlay</h1>
          <p>Switch between the live demo feed and a manually entered parlay without changing the extension build.</p>
          <p>The overlay keeps demo mode and manual parlay mode side by side, both persisted locally.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Overlay Data Source</h2>
          <span className={`saving-pill ${isSaving ? "active" : ""}`}>{isSaving ? "Saving" : "Ready"}</span>
        </div>

        <div className="field-grid single-column">
          <label>
            Overlay mode
            <select
              value={settings.dataMode}
              onChange={(event) =>
                void persistSettings({
                  ...settings,
                  dataMode: event.target.value as AppSettings["dataMode"]
                })
              }
            >
              <option value="demo">Demo mode</option>
              <option value="manual">Manual parlay mode</option>
            </select>
          </label>

          <label>
            Selected game
            <select
              value={settings.selectedGameId}
              onChange={(event) =>
                void persistSettings({
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
            <span>Demo mode sequence</span>
            <input
              type="checkbox"
              checked={settings.demoMode}
              onChange={(event) =>
                void persistSettings({
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
          <h2>Manual Parlay</h2>
          <span className="small-copy">{currentParlay.legs.length} legs saved</span>
        </div>

        <div className="field-grid">
          <label>
            Parlay name
            <input
              value={currentParlay.parlayName}
              onChange={(event) =>
                void persistParlay({
                  ...currentParlay,
                  parlayName: event.target.value
                })
              }
            />
          </label>

          <label>
            Amount wagered
            <input
              type="number"
              value={currentParlay.amountWagered}
              onChange={(event) =>
                void persistParlay({
                  ...currentParlay,
                  amountWagered: Number(event.target.value)
                })
              }
            />
          </label>

          <label>
            Estimated payout
            <input
              type="number"
              value={currentParlay.estimatedPayout}
              onChange={(event) =>
                void persistParlay({
                  ...currentParlay,
                  estimatedPayout: Number(event.target.value)
                })
              }
            />
          </label>

          <label>
            Original odds
            <input
              type="number"
              value={currentParlay.originalOdds}
              onChange={(event) =>
                void persistParlay({
                  ...currentParlay,
                  originalOdds: Number(event.target.value)
                })
              }
            />
          </label>

          <label>
            Current odds
            <input
              type="number"
              value={currentParlay.currentOdds}
              onChange={(event) =>
                void persistParlay({
                  ...currentParlay,
                  currentOdds: Number(event.target.value)
                })
              }
            />
          </label>

          <label>
            Odds format
            <select
              value={currentParlay.oddsFormat}
              onChange={(event) =>
                void persistParlay({
                  ...currentParlay,
                  oddsFormat: event.target.value as ManualParlay["oddsFormat"]
                })
              }
            >
              <option value="american">American</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Add Parlay Leg</h2>
          <span className="small-copy">Manual only</span>
        </div>

        <div className="field-grid">
          <label>
            Leg type
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft({
                  ...DEFAULT_DRAFT,
                  type: event.target.value as ManualLegType
                })
              }
            >
              <option value="player_prop">Player prop</option>
              <option value="team_moneyline">Team moneyline</option>
              <option value="spread">Spread</option>
              <option value="game_total">Game total</option>
              <option value="prediction_market">Kalshi/manual market</option>
            </select>
          </label>

          {draft.type === "player_prop" ? (
            <>
              <label>
                Player name
                <input value={draft.playerName} onChange={(event) => setDraft({ ...draft, playerName: event.target.value })} />
              </label>
              <label>
                Team
                <input value={draft.team} onChange={(event) => setDraft({ ...draft, team: event.target.value })} />
              </label>
              <label>
                Stat type
                <select value={draft.statType} onChange={(event) => setDraft({ ...draft, statType: event.target.value as LegDraft["statType"] })}>
                  <option value="points">Points</option>
                  <option value="rebounds">Rebounds</option>
                  <option value="assists">Assists</option>
                  <option value="threes_made">Threes made</option>
                  <option value="steals">Steals</option>
                  <option value="blocks">Blocks</option>
                  <option value="turnovers">Turnovers</option>
                </select>
              </label>
              <label>
                Over/under
                <select value={draft.direction} onChange={(event) => setDraft({ ...draft, direction: event.target.value as ManualDirection })}>
                  <option value="over">Over</option>
                  <option value="under">Under</option>
                </select>
              </label>
              <label>
                Line
                <input type="number" value={draft.line} onChange={(event) => setDraft({ ...draft, line: event.target.value })} />
              </label>
            </>
          ) : null}

          {draft.type === "team_moneyline" ? (
            <>
              <label>
                Team
                <input value={draft.team} onChange={(event) => setDraft({ ...draft, team: event.target.value })} />
              </label>
              <label>
                Opponent
                <input value={draft.opponent} onChange={(event) => setDraft({ ...draft, opponent: event.target.value })} />
              </label>
            </>
          ) : null}

          {draft.type === "spread" ? (
            <>
              <label>
                Team
                <input value={draft.team} onChange={(event) => setDraft({ ...draft, team: event.target.value })} />
              </label>
              <label>
                Plus/minus side
                <select value={draft.spreadSide} onChange={(event) => setDraft({ ...draft, spreadSide: event.target.value as SpreadSide })}>
                  <option value="plus">Plus</option>
                  <option value="minus">Minus</option>
                </select>
              </label>
              <label>
                Line
                <input type="number" value={draft.line} onChange={(event) => setDraft({ ...draft, line: event.target.value })} />
              </label>
            </>
          ) : null}

          {draft.type === "game_total" ? (
            <>
              <label>
                Matchup / game
                <input value={draft.matchup} onChange={(event) => setDraft({ ...draft, matchup: event.target.value })} />
              </label>
              <label>
                Over/under
                <select value={draft.direction} onChange={(event) => setDraft({ ...draft, direction: event.target.value as ManualDirection })}>
                  <option value="over">Over</option>
                  <option value="under">Under</option>
                </select>
              </label>
              <label>
                Line
                <input type="number" value={draft.line} onChange={(event) => setDraft({ ...draft, line: event.target.value })} />
              </label>
            </>
          ) : null}

          {draft.type === "prediction_market" ? (
            <>
              <label>
                Market title
                <input value={draft.marketTitle} onChange={(event) => setDraft({ ...draft, marketTitle: event.target.value })} />
              </label>
              <label>
                Market ticker
                <input value={draft.marketTicker} onChange={(event) => setDraft({ ...draft, marketTicker: event.target.value })} />
              </label>
              <label>
                User side
                <select value={draft.predictionSide} onChange={(event) => setDraft({ ...draft, predictionSide: event.target.value as ManualPredictionSide })}>
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
              </label>
              <label>
                Original price
                <input type="number" value={draft.originalPrice} onChange={(event) => setDraft({ ...draft, originalPrice: event.target.value })} />
              </label>
              <label>
                Current price
                <input type="number" value={draft.currentPrice} onChange={(event) => setDraft({ ...draft, currentPrice: event.target.value })} />
              </label>
              <label>
                Contracts owned
                <input type="number" value={draft.contractsOwned} onChange={(event) => setDraft({ ...draft, contractsOwned: event.target.value })} />
              </label>
              <label className="field-span-2">
                What needs to happen
                <input value={draft.whatNeedsToHappen} onChange={(event) => setDraft({ ...draft, whatNeedsToHappen: event.target.value })} />
              </label>
            </>
          ) : null}

          <label>
            Original odds
            <input type="number" value={draft.originalOdds} onChange={(event) => setDraft({ ...draft, originalOdds: event.target.value })} />
          </label>
          <label>
            Current odds
            <input type="number" value={draft.currentOdds} onChange={(event) => setDraft({ ...draft, currentOdds: event.target.value })} />
          </label>
        </div>

        {draftError ? <div className="error-copy">{draftError}</div> : null}

        <div className="panel-actions">
          <button className="primary-button" onClick={() => void addLeg()}>
            Add leg
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Saved Manual Legs</h2>
          <span className="small-copy">{settings.dataMode === "manual" ? "Overlay uses these now" : "Ready for manual mode"}</span>
        </div>

        <div className="positions-list">
          {currentParlay.legs.length === 0 ? (
            <article className="position-card">
              <div className="position-note">No manual legs saved yet. Add a leg above, then switch the overlay mode to Manual parlay mode.</div>
            </article>
          ) : (
            currentParlay.legs.map((leg) => (
              <article className="position-card" key={leg.id}>
                <div className="position-topline">
                  <span className="market">{legSummary(leg)}</span>
                  <button className="inline-button" onClick={() => void removeLeg(leg.id)}>
                    Remove
                  </button>
                </div>
                <div className="position-note">
                  {leg.type === "prediction_market"
                    ? `${leg.marketTicker ? `Ticker ${leg.marketTicker} · ` : ""}${leg.whatNeedsToHappen}`
                    : "Manual parlay leg saved locally for overlay rendering."}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Current Feed</h2>
          <span className="small-copy">{settings.dataMode === "demo" ? "Mock live sequence" : "Manual parlay overlay"}</span>
        </div>

        <div className="positions-list">
          <article className="position-card">
            <div className="position-topline">
              <span className="market">{settings.dataMode === "demo" ? gameTitle : currentParlay.parlayName}</span>
            </div>
            <div className="position-note">
              {settings.dataMode === "demo"
                ? "The overlay auto-syncs score, clock, and tracked player stats from the local backend API routes."
                : "The overlay renders your locally saved manual parlay and legs instead of the demo Knicks vs Cavaliers feed."}
            </div>
            <div className="small-copy">
              {settings.dataMode === "demo"
                ? `Backend target http://localhost:3001/api/live/game/${settings.selectedGameId}`
                : `Odds ${currentParlay.originalOdds > 0 ? "+" : ""}${currentParlay.originalOdds} -> ${currentParlay.currentOdds > 0 ? "+" : ""}${currentParlay.currentOdds}`}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
