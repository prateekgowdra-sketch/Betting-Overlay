import { useEffect, useMemo, useRef, useState } from "react";
import { applyLiveStatsToState, buildInitialState } from "../shared/mockState";
import {
  APP_SETTINGS_KEY,
  AppSettings,
  getAppSettings,
  getOverlayUiState,
  OVERLAY_UI_KEY,
  OverlayUiState,
  saveOverlayUiState
} from "../shared/storage";
import { DemoState, PlayerProp, Position } from "../shared/types";
import { liveStatsService } from "../services/liveStatsService";
import { statusColor, statusLabel } from "../shared/ui";

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="klo-progress-track">
      <div className="klo-progress-fill" style={{ width: `${progress}%`, backgroundColor: color }} />
    </div>
  );
}

function PositionCard({ position }: { position: Position }) {
  const color = statusColor(position.status);
  const currentValue = position.currentPriceCents * position.contracts;
  const costBasis = position.entryPriceCents * position.contracts;
  const unrealizedPnL = currentValue - costBasis;
  const isPositive = unrealizedPnL >= 0;

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
        <span>Value {currentValue}c</span>
        <span>Cost {costBasis}c</span>
        <span className={isPositive ? "klo-pnl-positive" : "klo-pnl-negative"}>
          P/L {isPositive ? "+" : ""}
          {unrealizedPnL}c
        </span>
      </div>
      <div className="klo-card-note">
        <span>{position.whatNeedsToHappen}</span>
      </div>
    </article>
  );
}

function PropCard({ prop }: { prop: PlayerProp }) {
  const color = statusColor(prop.status);
  const targetLabel = `${prop.direction} ${prop.target}`;
  const cardStatusLabel =
    prop.direction === "over"
      ? prop.current >= prop.target
        ? "Cashed"
        : "Alive"
      : prop.current > prop.target
        ? "Dead"
        : "Alive";

  return (
    <article className="klo-card">
      <div className="klo-row klo-space-between">
        <div>
          <div className="klo-card-label">
            {prop.team} • {prop.statLabel}
          </div>
          <div className="klo-card-title">{prop.player}</div>
        </div>
        <div className="klo-stack-end">
          <span className="klo-card-target">{targetLabel}</span>
          <span className="klo-chip" style={{ backgroundColor: `${color}1e`, color }}>
            {cardStatusLabel}
          </span>
        </div>
      </div>

      <div className="klo-prop-metric">
        <span className="klo-prop-value">
          {prop.current} {prop.unit}
        </span>
        <span className="klo-prop-trend">Target {prop.target}</span>
      </div>

      <ProgressBar progress={prop.progress} color={color} />
      <div className="klo-card-note">{prop.whatIsNeeded}</div>
    </article>
  );
}

export function OverlayApp() {
  const [state, setState] = useState<DemoState>(() => buildInitialState());
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

    liveStatsService.setDemoMode(settings.demoMode);

    const syncLiveStats = async () => {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;

      try {
        const [gameStats, playerStats] = await Promise.all([
          liveStatsService.getLiveGameStats(settings.selectedGameId),
          liveStatsService.getPlayerStats(settings.selectedGameId, [
            "Jalen Brunson",
            "Karl-Anthony Towns",
            "Donovan Mitchell"
          ])
        ]);
        setState((currentState) =>
          applyLiveStatsToState(currentState, gameStats, playerStats)
        );
      } catch (error) {
        console.error("Failed to sync live stats", error);
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void syncLiveStats();
    const interval = window.setInterval(() => {
      void syncLiveStats();
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
    () => state?.positions.filter((position) => position.status !== "lost").length ?? 0,
    [state]
  );

  async function updateUiState(next: OverlayUiState) {
    setUiState(next);
    await saveOverlayUiState(next);
  }

  if (!uiState) {
    return null;
  }

  const home = state.game.homeTeam;
  const away = state.game.awayTeam;
  const minimizedLabel = `Kalshi Overlay | Knicks vs Cavs | ${activePositions} active positions`;
  const isLive = state.game.gameStatus === "live";
  const isUpcoming = state.game.gameStatus === "upcoming";
  const isFinal = state.game.gameStatus === "final";

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
          <div className="klo-matchup">{uiState.minimized ? minimizedLabel : state.game.title}</div>
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
                      {state.game.quarter} • {state.game.gameClock}
                    </div>
                    <div className="klo-possession">
                      Possession: {state.game.possession === "NYK" ? "Knicks" : "Cavaliers"}
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

          <section className="klo-section">
            <div className="klo-section-title">Active Positions</div>
            <div className="klo-list">
              {state.positions.map((position) => (
                <PositionCard position={position} key={position.id} />
              ))}
            </div>
          </section>

          <section className="klo-section">
            <div className="klo-section-title">Player Prop Progress</div>
            <div className="klo-list">
              {state.playerProps.map((prop) => (
                <PropCard prop={prop} key={prop.id} />
              ))}
            </div>
          </section>

          <footer className="klo-footer">
            <span>Manual demo mode</span>
            <span>Updated {new Date(state.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </footer>
        </div>
      )}
    </aside>
  );
}
