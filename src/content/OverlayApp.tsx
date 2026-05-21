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
import { GameState, KalshiPosition, MarketLeg, OverlayData, OverlayStatus, PlayerStat } from "../shared/types";
import { statusColor, statusLabel } from "../shared/ui";

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="klo-progress-track">
      <div className="klo-progress-fill" style={{ width: `${progress}%`, backgroundColor: color }} />
    </div>
  );
}

function PositionCard({ position }: { position: KalshiPosition }) {
  const color = statusColor(position.status);
  const isPositive = position.unrealizedPnLCents >= 0;

  return (
    <article className="klo-card">
      <div className="klo-row klo-space-between">
        <div>
          <div className="klo-card-label">Position</div>
          <div className="klo-card-title">{position.marketTitle}</div>
        </div>
        <div className="klo-stack-end">
          <span className="klo-chip" style={{ backgroundColor: `${color}1e`, color }}>
            {statusLabel(position.status)}
          </span>
          <span className="klo-side">{position.side}</span>
        </div>
      </div>

      <div className="klo-position-numbers">
        <span>{position.platform}</span>
        <span>{position.contracts} contracts</span>
      </div>

      <ProgressBar progress={position.progress} color={color} />

      <div className="klo-position-pricing">
        <span>Entry {position.entryPriceCents}c</span>
        <span>Now {position.currentPriceCents}c</span>
      </div>
      <div className="klo-position-pnl">
        <span>Value {position.currentValueCents}c</span>
        <span>Cost {position.costBasisCents}c</span>
        <span className={isPositive ? "klo-pnl-positive" : "klo-pnl-negative"}>
          P/L {isPositive ? "+" : ""}
          {position.unrealizedPnLCents}c
        </span>
      </div>
      <div className="klo-card-note">
        <span>{position.whatNeedsToHappen}</span>
        {position.leg ? (
          <span className="klo-subtle">
            {position.leg.playerName}: {position.leg.current}/{position.leg.target} {position.leg.unit}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function legStatusLabel(stat: PlayerStat | MarketLeg) {
  if (stat.direction === "over") {
    return stat.current >= stat.target ? "Cashed" : "Alive";
  }

  return stat.current > stat.target ? "Dead" : "Alive";
}

function PlayerStatCard({ playerStat }: { playerStat: PlayerStat }) {
  const color = statusColor(playerStat.status);

  return (
    <article className="klo-card">
      <div className="klo-row klo-space-between">
        <div>
          <div className="klo-card-label">
            {playerStat.team} • {playerStat.statType}
          </div>
          <div className="klo-card-title">{playerStat.playerName}</div>
        </div>
        <div className="klo-stack-end">
          <span className="klo-card-target">
            {playerStat.direction} {playerStat.target}
          </span>
          <span className="klo-chip" style={{ backgroundColor: `${color}1e`, color }}>
            {legStatusLabel(playerStat)}
          </span>
        </div>
      </div>

      <div className="klo-prop-metric">
        <span className="klo-prop-value">
          {playerStat.current} {playerStat.unit}
        </span>
        <span className="klo-prop-trend">Target {playerStat.target}</span>
      </div>

      <ProgressBar progress={playerStat.progress} color={color} />
      <div className="klo-card-note">{playerStat.whatIsNeeded}</div>
    </article>
  );
}

function LoadingOrErrorCard({
  title,
  message,
  kind
}: {
  title: string;
  message: string;
  kind: "loading" | "error";
}) {
  return (
    <article className={`klo-card klo-status-card ${kind}`}>
      <div className="klo-card-title">{title}</div>
      <div className="klo-card-note">{message}</div>
    </article>
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
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const uiStateRef = useRef<OverlayUiState | null>(null);
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
    uiStateRef.current = uiState;
  }, [uiState]);

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
        current.state === "ready"
          ? current
          : { state: "loading", message: "Loading overlay data..." }
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

  useEffect(() => {
    if (!dragging || !uiState) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const maxX = Math.max(8, window.innerWidth - 320);
      const maxY = Math.max(8, window.innerHeight - 56);
      const nextState = {
        ...uiState,
        position: {
          x: Math.min(maxX, Math.max(8, event.clientX - dragOffsetRef.current.x)),
          y: Math.min(maxY, Math.max(8, event.clientY - dragOffsetRef.current.y))
        }
      };

      setUiState(nextState);
    };

    const onUp = () => {
      setDragging(false);
      if (uiStateRef.current) {
        void saveOverlayUiState(uiStateRef.current);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, uiState]);

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

  const gameState: GameState = overlayData.gameState;
  const home = gameState.homeTeam;
  const away = gameState.awayTeam;
  const minimizedLabel = `Kalshi Overlay | Knicks vs Cavs | ${activePositions} active positions`;
  const isLive = gameState.gameStatus === "live";
  const isUpcoming = gameState.gameStatus === "upcoming";
  const isFinal = gameState.gameStatus === "final";

  if (uiState.closed) {
    return (
      <button
        className="klo-reopen"
        style={{
          top: `${uiState.position.y}px`,
          right: "18px"
        }}
        onClick={() =>
          void updateUiState({
            ...uiState,
            closed: false
          })
        }
      >
        Reopen Kalshi Overlay
      </button>
    );
  }

  return (
    <aside
      className={`klo-shell ${uiState.minimized ? "minimized" : ""} ${dragging ? "dragging" : ""}`}
      style={{
        top: `${uiState.position.y}px`,
        right: "auto",
        left: `${uiState.position.x}px`
      }}
    >
      <div
        className="klo-header"
        onMouseDown={(event) => {
          const rect = event.currentTarget.parentElement?.getBoundingClientRect();
          dragOffsetRef.current = {
            x: event.clientX - (rect?.left ?? 0),
            y: event.clientY - (rect?.top ?? 0)
          };
          setDragging(true);
        }}
      >
        <div>
          {!uiState.minimized && <div className="klo-eyebrow">Kalshi Live Overlay</div>}
          <div className="klo-matchup">{uiState.minimized ? minimizedLabel : gameState.title}</div>
        </div>
        <div className="klo-actions">
          <button
            className="klo-toggle"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() =>
              void updateUiState({
                ...uiState,
                minimized: !uiState.minimized
              })
            }
          >
            {uiState.minimized ? "Open" : "Min"}
          </button>
          <button
            className="klo-toggle klo-close"
            onMouseDown={(event) => event.stopPropagation()}
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

      {!uiState.minimized && (
        <div className="klo-body">
          <section className="klo-scoreboard">
            <div className="klo-score-row">
              <div className="klo-team">
                <span>{away.shortName}</span>
                <strong>{away.score}</strong>
              </div>
              <div className="klo-center">
                {isUpcoming && <div className="klo-live klo-live-neutral">UPCOMING</div>}
                {isLive && <div className="klo-live">LIVE</div>}
                {isFinal && <div className="klo-live klo-live-final">FINAL</div>}
                {isUpcoming && <div className="klo-clock">Game has not started</div>}
                {isLive && (
                  <>
                    <div className="klo-clock">
                      {gameState.quarter} • {gameState.gameClock}
                    </div>
                    <div className="klo-possession">
                      Possession: {gameState.possession === "NYK" ? "Knicks" : "Cavaliers"}
                    </div>
                  </>
                )}
                {isFinal && <div className="klo-clock">Final score</div>}
              </div>
              <div className="klo-team">
                <span>{home.shortName}</span>
                <strong>{home.score}</strong>
              </div>
            </div>
          </section>

          {overlayStatus.state === "loading" ? (
            <LoadingOrErrorCard
              title="Loading"
              message={overlayStatus.message ?? "Fetching game state and positions..."}
              kind="loading"
            />
          ) : null}

          {overlayStatus.state === "error" ? (
            <LoadingOrErrorCard
              title="Backend Error"
              message={overlayStatus.message ?? "Unable to load overlay data."}
              kind="error"
            />
          ) : null}

          <section className="klo-section">
            <div className="klo-section-title">Kalshi Positions</div>
            <div className="klo-list">
              {overlayData.positions.map((position) => (
                <PositionCard position={position} key={position.id} />
              ))}
            </div>
          </section>

          <section className="klo-section">
            <div className="klo-section-title">Player Stat Tracker</div>
            <div className="klo-list">
              {gameState.playerStats.map((playerStat) => (
                <PlayerStatCard playerStat={playerStat} key={playerStat.id} />
              ))}
            </div>
          </section>

          <footer className="klo-footer">
            <span>{settings?.demoMode ? "Demo backend mode" : "Backend mode"}</span>
            <span>
              {overlayStatus.lastUpdated
                ? `Updated ${new Date(overlayStatus.lastUpdated).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit"
                  })}`
                : "Waiting for data"}
            </span>
          </footer>
        </div>
      )}
    </aside>
  );
}
