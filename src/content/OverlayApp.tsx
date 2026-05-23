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
  const probabilityMove = position.currentPriceCents - position.entryPriceCents;
  const margin = gameState.homeTeam.score - gameState.awayTeam.score;
  const gameContext = margin > 0 ? `up ${margin}` : margin < 0 ? `down ${Math.abs(margin)}` : "tied";

  if (position.id === "knicks-moneyline") {
    return `Knicks ${position.side} ${currentProbability}% · ${gameContext}`;
  }

  const moveText = probabilityMove >= 0 ? `+${probabilityMove}` : `${probabilityMove}`;
  return `Knicks ${position.side} ${currentProbability}% · ${moveText}`;
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
  }, [settings]);

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
  const lastUpdated = formatUpdatedTime(overlayStatus.lastUpdated ?? gameState.updatedAt);
  const spread = gameState.homeTeam.score - gameState.awayTeam.score;
  const minimizedLabel = `Kalshi | ${activePositions} active | NYK ${spread >= 0 ? "+" : ""}${spread}`;

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

  return (
    <>
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

      {overlayStatus.state !== "ready" ? (
        <div className={`klo-status-banner ${overlayStatus.state}`}>
          {overlayStatus.message ?? (overlayStatus.state === "loading" ? "Loading overlay data..." : "Backend error")}
        </div>
      ) : null}
    </>
  );
}
