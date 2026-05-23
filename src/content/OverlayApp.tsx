import { useEffect, useMemo, useRef, useState } from "react";
import { backendApi } from "../services/backendApi";
import { buildInitialOverlayData, mapBackendResponsesToOverlayData } from "../shared/overlayState";
import {
  APP_SETTINGS_KEY,
  AppSettings,
  getAppSettings,
  getOverlayUiState,
  OVERLAY_UI_KEY,
  OverlayUiState,
  saveOverlayUiState
} from "../shared/storage";
import { GameState, KalshiPosition, OverlayData, OverlayStatus, PlayerStat, PositionStatus } from "../shared/types";

function formatUpdatedTime(timestamp?: string): string {
  if (!timestamp) {
    return "--:--";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getPlayerShortName(playerName: string): string {
  if (playerName === "Karl-Anthony Towns") {
    return "KAT";
  }

  return playerName.split(" ").slice(-1)[0];
}

function getStatAbbrev(unit: string): string {
  return unit;
}

function getChipStatusColor(status: PositionStatus): string {
  switch (status) {
    case "won":
    case "on-track":
      return "#61ebae";
    case "lost":
    case "danger":
      return "#f15b5b";
    default:
      return "#f7c948";
  }
}

function getChipTone(status: PositionStatus): string {
  switch (status) {
    case "won":
    case "on-track":
      return "is-good";
    case "lost":
    case "danger":
      return "is-bad";
    default:
      return "is-live";
  }
}

function getStatusBadgeLabel(status: PositionStatus): string {
  switch (status) {
    case "won":
      return "Cashed";
    case "on-track":
      return "Alive";
    case "lost":
      return "Dead";
    case "danger":
      return "Sweating";
    default:
      return "Alive";
  }
}

function formatPlayerChipLabel(playerStat: PlayerStat): string {
  const shortName = getPlayerShortName(playerStat.playerName);
  const statAbbrev = getStatAbbrev(playerStat.unit);

  if (playerStat.direction === "over") {
    const remaining = Math.max(0, playerStat.target - playerStat.current);
    return `${shortName} ${playerStat.current}/${playerStat.target} ${statAbbrev} · ${remaining === 0 ? "cashed" : `needs ${remaining}`}`;
  }

  const allowance = Math.max(0, playerStat.target - playerStat.current);
  return `${shortName} U${playerStat.target} ${statAbbrev} · ${playerStat.current}/${playerStat.target} · ${playerStat.current > playerStat.target ? "dead" : `allow ${allowance}`}`;
}

function formatMoneylineChipLabel(position: KalshiPosition, gameState: GameState): string {
  const currentProbability = position.currentPriceCents;
  const margin = gameState.homeTeam.score - gameState.awayTeam.score;
  const gameContext = margin > 0 ? `up ${margin}` : margin < 0 ? `down ${Math.abs(margin)}` : "tied";
  return `Knicks ${position.side} ${currentProbability}% · ${gameContext}`;
}

function formatMoneylineCardLabel(position: KalshiPosition, gameState: GameState): string {
  const move = position.currentPriceCents - position.entryPriceCents;
  const moveText = move >= 0 ? `+${move}` : `${move}`;
  const margin = gameState.homeTeam.score - gameState.awayTeam.score;
  const context = margin > 0 ? `Knicks up ${margin}` : margin < 0 ? `Knicks down ${Math.abs(margin)}` : "Tied";
  return `Knicks ${position.side} ${position.currentPriceCents}% · entry ${position.entryPriceCents}% · ${moveText} · ${context}`;
}

function getChipProgress(item: KalshiPosition | PlayerStat): number {
  if ("marketTitle" in item) {
    return Math.max(0, Math.min(100, item.currentPriceCents));
  }

  return Math.max(0, Math.min(100, Math.round((item.current / item.target) * 100)));
}

function renderPositionLabel(position: KalshiPosition, gameState: GameState): string {
  if (position.id === "knicks-moneyline") {
    return formatMoneylineChipLabel(position, gameState);
  }

  if (position.leg) {
    return formatPlayerChipLabel({
      id: position.leg.id,
      playerName: position.leg.playerName,
      team: "NYK",
      statType: position.leg.statType,
      direction: position.leg.direction,
      current: position.leg.current,
      target: position.leg.target,
      unit: position.leg.unit,
      progress: position.leg.progress,
      status: position.leg.status,
      whatIsNeeded: position.leg.whatNeedsToHappen
    });
  }

  return position.marketTitle;
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="klo-progress-track">
      <div className="klo-progress-fill" style={{ width: `${progress}%`, backgroundColor: color }} />
    </div>
  );
}

export function OverlayApp() {
  const [overlayData, setOverlayData] = useState<OverlayData>(() => buildInitialOverlayData());
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>({
    state: "loading",
    message: "Connecting to backend..."
  });
  const [uiState, setUiState] = useState<OverlayUiState | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    void getOverlayUiState().then(setUiState);
    void getAppSettings().then(setSettings);

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === "local" && changes[OVERLAY_UI_KEY]?.newValue) {
        setUiState(changes[OVERLAY_UI_KEY].newValue as OverlayUiState);
      }

      if (areaName === "local" && changes[APP_SETTINGS_KEY]?.newValue) {
        setSettings(changes[APP_SETTINGS_KEY].newValue as AppSettings);
      }
    };

    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    backendApi.setDemoMode(settings.demoMode);

    const syncOverlayData = async () => {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;

      setOverlayStatus((current) =>
        current.state === "ready" ? current : { state: "loading", message: "Loading overlay data..." }
      );

      try {
        const [gameStateResponse, kalshiPositionsResponse] = await Promise.all([
          backendApi.getGameState(settings.selectedGameId),
          backendApi.getKalshiPositions(settings.selectedGameId)
        ]);

        const nextOverlayData = mapBackendResponsesToOverlayData(
          gameStateResponse,
          kalshiPositionsResponse
        );

        setOverlayData(nextOverlayData);
        setOverlayStatus({
          state: "ready",
          lastUpdated: nextOverlayData.gameState.updatedAt
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to reach the backend. Make sure localhost:3001 is running.";

        setOverlayStatus({
          state: "error",
          message,
          lastUpdated: overlayData.gameState.updatedAt
        });
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void syncOverlayData();
    const interval = window.setInterval(() => {
      void syncOverlayData();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [settings, overlayData.gameState.updatedAt]);

  const gameState = overlayData.gameState;
  const positionChips = useMemo(() => overlayData.positions.slice(0, 2), [overlayData.positions]);
  const playerChips = useMemo(() => overlayData.gameState.playerStats.slice(0, 3), [overlayData.gameState.playerStats]);
  const activePositions = useMemo(
    () => overlayData.positions.filter((position) => position.status !== "lost").length,
    [overlayData.positions]
  );

  async function updateUiState(next: OverlayUiState) {
    setUiState(next);
    await saveOverlayUiState(next);
  }

  if (!uiState) {
    return null;
  }

  const scoreline = `${gameState.awayTeam.shortName} ${gameState.awayTeam.score} - ${gameState.homeTeam.shortName} ${gameState.homeTeam.score}`;
  const clock =
    gameState.gameStatus === "live"
      ? `${gameState.quarter} ${gameState.gameClock}`
      : gameState.gameStatus === "final"
        ? "Final"
        : "Not started";
  const fullGameTitle = `${gameState.homeTeam.name} vs ${gameState.awayTeam.name}`;
  const lastUpdated = formatUpdatedTime(overlayStatus.lastUpdated ?? gameState.updatedAt);
  const spread = gameState.homeTeam.score - gameState.awayTeam.score;
  const minimizedLabel = `Kalshi | ${activePositions} active | NYK ${spread >= 0 ? "+" : ""}${spread}`;

  if (uiState.closed) {
    return (
      <button
        className="klo-pill"
        onClick={() =>
          void updateUiState({
            ...uiState,
            closed: false,
            minimized: false
          })
        }
      >
        Open Kalshi Overlay
      </button>
    );
  }

  if (uiState.minimized) {
    return (
      <button
        className="klo-pill"
        onClick={() =>
          void updateUiState({
            ...uiState,
            minimized: false
          })
        }
      >
        {minimizedLabel}
      </button>
    );
  }

  const toggleLabel = uiState.viewMode === "ticker" ? "Cards" : "Ticker";

  return (
    <>
      {uiState.viewMode === "ticker" ? (
        <aside className="klo-top-ticker">
          <div className="klo-ticker-left">
            <span className="klo-info-chip klo-brand-chip">Kalshi</span>
            <span className="klo-info-chip">{scoreline}</span>
            <span className="klo-info-chip">{clock}</span>
          </div>

          <div className="klo-ticker-center">
            {positionChips.map((position) => {
              const chipColor = getChipStatusColor(position.status);

              return (
                <div
                  className={`klo-bet-chip ${getChipTone(position.status)}`}
                  key={position.id}
                  title={position.marketTitle}
                >
                  <span className="klo-chip-label">{renderPositionLabel(position, gameState)}</span>
                  <span
                    className="klo-chip-progress"
                    style={{
                      width: `${getChipProgress(position)}%`,
                      backgroundColor: chipColor
                    }}
                  />
                </div>
              );
            })}

            {playerChips.map((playerStat) => {
              const chipColor = getChipStatusColor(playerStat.status);

              return (
                <div
                  className={`klo-bet-chip ${getChipTone(playerStat.status)}`}
                  key={playerStat.id}
                  title={playerStat.whatIsNeeded}
                >
                  <span className="klo-chip-label">{formatPlayerChipLabel(playerStat)}</span>
                  <span
                    className="klo-chip-progress"
                    style={{
                      width: `${getChipProgress(playerStat)}%`,
                      backgroundColor: chipColor
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="klo-ticker-right">
            <button
              className="klo-view-toggle"
              onClick={() =>
                void updateUiState({
                  ...uiState,
                  viewMode: "cards"
                })
              }
            >
              {toggleLabel}
            </button>
            <span className="klo-info-chip klo-status-chip">{activePositions} active</span>
            <span className="klo-info-chip klo-updated-chip">Updated {lastUpdated}</span>
            <button
              className="klo-min-button"
              onClick={() =>
                void updateUiState({
                  ...uiState,
                  minimized: true
                })
              }
            >
              Min
            </button>
          </div>
        </aside>
      ) : (
        <aside className="klo-card-view">
          <div className="klo-card-header">
            <div>
              <div className="klo-card-brand">Kalshi Live Overlay</div>
              <div className="klo-card-subtitle">{fullGameTitle}</div>
            </div>
            <div className="klo-card-actions">
              <button
                className="klo-view-toggle"
                onClick={() =>
                  void updateUiState({
                    ...uiState,
                    viewMode: "ticker"
                  })
                }
              >
                {toggleLabel}
              </button>
              <button
                className="klo-min-button"
                onClick={() =>
                  void updateUiState({
                    ...uiState,
                    minimized: true
                  })
                }
              >
                Min
              </button>
              <button
                className="klo-min-button"
                onClick={() =>
                  void updateUiState({
                    ...uiState,
                    closed: true
                  })
                }
              >
                Close
              </button>
            </div>
          </div>

          <section className="klo-scoreboard-card">
            <div className="klo-scoreboard-row">
              <span>{gameState.awayTeam.shortName}</span>
              <strong>{gameState.awayTeam.score}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>{gameState.homeTeam.shortName}</span>
              <strong>{gameState.homeTeam.score}</strong>
            </div>
            <div className="klo-scoreboard-meta">{clock}</div>
          </section>

          <section className="klo-card-section">
            <div className="klo-section-title">Kalshi Positions</div>
            {overlayData.positions.map((position) => {
              const pnl = position.unrealizedPnLCents >= 0 ? `+${position.unrealizedPnLCents}` : `${position.unrealizedPnLCents}`;
              const move = position.currentPriceCents - position.entryPriceCents;
              const moveText = move >= 0 ? `+${move}` : `${move}`;

              return (
                <article className="klo-position-card" key={position.id}>
                  <div className="klo-card-title">{position.marketTitle}</div>
                  <div className="klo-card-meta">
                    <span>{position.side}</span>
                    <span>{position.contracts} contracts</span>
                  </div>
                  <div className="klo-card-meta">
                    <span>
                      {position.id === "knicks-moneyline"
                        ? formatMoneylineCardLabel(position, gameState)
                        : `${position.currentPriceCents}% · entry ${position.entryPriceCents}% · ${moveText}`}
                    </span>
                  </div>
                  <div className="klo-card-meta">
                    <span>P/L {pnl}</span>
                    <span>{position.whatNeedsToHappen}</span>
                  </div>
                  <ProgressBar progress={getChipProgress(position)} color={getChipStatusColor(position.status)} />
                </article>
              );
            })}
          </section>

          <section className="klo-card-section">
            <div className="klo-section-title">Player Stat Tracker</div>
            {gameState.playerStats.map((playerStat) => (
              <article className="klo-player-card" key={playerStat.id}>
                <div className="klo-card-meta klo-card-meta-top">
                  <div className="klo-card-title">{playerStat.playerName}</div>
                  <span className={`klo-status-badge ${getChipTone(playerStat.status)}`}>
                    {getStatusBadgeLabel(playerStat.status)}
                  </span>
                </div>
                <div className="klo-card-meta">
                  <span>{playerStat.statType}</span>
                  <span>{formatPlayerChipLabel(playerStat)}</span>
                </div>
                <ProgressBar progress={getChipProgress(playerStat)} color={getChipStatusColor(playerStat.status)} />
              </article>
            ))}
          </section>
        </aside>
      )}

      {overlayStatus.state !== "ready" ? (
        <div className={`klo-status-banner ${overlayStatus.state}`}>
          {overlayStatus.message ?? (overlayStatus.state === "loading" ? "Loading overlay data..." : "Backend error")}
        </div>
      ) : null}
    </>
  );
}
