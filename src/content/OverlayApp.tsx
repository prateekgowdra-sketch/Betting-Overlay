import { useEffect, useMemo, useRef, useState } from "react";
import { backendApi } from "../services/backendApi";
import { buildInitialOverlayData, mapBackendResponsesToOverlayData } from "../shared/overlayState";
import {
  APP_SETTINGS_KEY,
  AppSettings,
  getAppSettings,
  getManualParlay,
  getOverlayUiState,
  MANUAL_PARLAY_KEY,
  OVERLAY_UI_KEY,
  OverlayUiState,
  saveOverlayUiState
} from "../shared/storage";
import {
  GameState,
  KalshiPosition,
  ManualLegOverlayChip,
  ManualParlay,
  ManualParlayLeg,
  OverlayData,
  OverlayStatus,
  PlayerStat,
  PositionStatus
} from "../shared/types";
import {
  americanOddsToImpliedProbability,
  formatAmericanOdds,
  formatCurrency,
  getOddsMovement
} from "../shared/odds";
import { BackendPlayersResponse } from "../shared/overlayState";
import { buildManualLegOverlayChips } from "../shared/manualLegMatcher";

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

function getStatAbbrev(unitOrType: string): string {
  switch (unitOrType) {
    case "points":
      return "pts";
    case "rebounds":
      return "reb";
    case "assists":
      return "ast";
    case "threes_made":
      return "3PM";
    case "steals":
      return "stl";
    case "blocks":
      return "blk";
    case "turnovers":
      return "to";
    default:
      return unitOrType;
  }
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

function getManualChipTone(status: ManualLegOverlayChip["status"]): "is-good" | "is-live" | "is-bad" | "is-unavailable" {
  switch (status) {
    case "hit":
      return "is-good";
    case "behind":
      return "is-bad";
    case "unavailable":
      return "is-unavailable";
    default:
      return "is-live";
  }
}

function getManualChipColor(status: ManualLegOverlayChip["status"]): string {
  switch (status) {
    case "hit":
      return "#61ebae";
    case "behind":
      return "#f15b5b";
    case "unavailable":
      return "#95a7bb";
    default:
      return "#f7c948";
  }
}

function getManualChipBadgeLabel(status: ManualLegOverlayChip["status"]): string {
  switch (status) {
    case "hit":
      return "Hit";
    case "behind":
      return "Watch";
    case "unavailable":
      return "Unavailable";
    default:
      return "Live";
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

function getManualLegStatus(leg: ManualParlayLeg): PositionStatus {
  if (leg.type === "prediction_market") {
    if (typeof leg.currentPrice === "number" && typeof leg.originalPrice === "number") {
      if (leg.currentPrice >= 75) {
        return "on-track";
      }

      if (leg.currentPrice <= 35) {
        return "danger";
      }

      return leg.currentPrice >= leg.originalPrice ? "sweating" : "danger";
    }
  }

  return "sweating";
}

function getManualLegProgress(leg: ManualParlayLeg): number {
  if (leg.type === "prediction_market" && typeof leg.currentPrice === "number") {
    return Math.max(0, Math.min(100, leg.currentPrice));
  }

  return 50;
}

function formatManualLegChipLabel(leg: ManualParlayLeg): string {
  const oddsText =
    typeof leg.originalOdds === "number" && typeof leg.currentOdds === "number"
      ? ` | Odds ${formatAmericanOdds(leg.originalOdds)} -> ${formatAmericanOdds(leg.currentOdds)}`
      : "";

  switch (leg.type) {
    case "player_prop":
      return `${getPlayerShortName(leg.playerName)} ${leg.direction === "over" ? "O" : "U"}${leg.line} ${getStatAbbrev(leg.statType)}${oddsText}`;
    case "team_moneyline":
      return `${leg.team} ML${leg.opponent ? ` vs ${leg.opponent}` : ""}${oddsText}`;
    case "spread":
      return `${leg.team} ${leg.side === "plus" ? "+" : "-"}${leg.line}${oddsText}`;
    case "game_total":
      return `${leg.matchup} ${leg.direction === "over" ? "O" : "U"}${leg.line}${oddsText}`;
    case "prediction_market":
      return `${leg.side} ${leg.marketTitle}${oddsText}`;
  }
}

function formatManualLegDetail(leg: ManualParlayLeg): string {
  switch (leg.type) {
    case "player_prop":
      return `${leg.playerName} ${leg.direction === "over" ? "over" : "under"} ${leg.line} ${getStatAbbrev(leg.statType)}`;
    case "team_moneyline":
      return `${leg.team} moneyline${leg.opponent ? ` vs ${leg.opponent}` : ""}`;
    case "spread":
      return `${leg.team} ${leg.side === "plus" ? "+" : "-"}${leg.line}`;
    case "game_total":
      return `${leg.matchup} ${leg.direction} ${leg.line}`;
    case "prediction_market":
      return `${leg.side} · ${leg.marketTitle}`;
  }
}

function formatManualLegNeed(leg: ManualParlayLeg): string {
  switch (leg.type) {
    case "player_prop":
      return `Needs ${leg.direction} ${leg.line} ${getStatAbbrev(leg.statType)}`;
    case "team_moneyline":
      return `Needs ${leg.team} to win`;
    case "spread":
      return `Needs ${leg.team} ${leg.side === "plus" ? "to stay within" : "to cover"} ${leg.line}`;
    case "game_total":
      return `Needs the game total to go ${leg.direction} ${leg.line}`;
    case "prediction_market":
      return leg.whatNeedsToHappen;
  }
}

function directionArrow(direction: "up" | "down" | "same"): string {
  switch (direction) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return "→";
  }
}

function formatParlayOddsTicker(manualParlay: ManualParlay): string {
  const movement = getOddsMovement(manualParlay.originalOdds, manualParlay.currentOdds);
  return `Parlay: ${formatCurrency(manualParlay.amountWagered)} -> ${formatCurrency(manualParlay.estimatedPayout)} | Odds ${formatAmericanOdds(manualParlay.originalOdds)} -> ${formatAmericanOdds(manualParlay.currentOdds)}`;
}

function formatParlayOddsTickerDetail(manualParlay: ManualParlay): string {
  const movement = getOddsMovement(manualParlay.originalOdds, manualParlay.currentOdds);
  return `Chance ${directionArrow(movement.probabilityDirection)} | Payout ${movement.payoutDirection}`;
}

function formatManualLegOddsTicker(leg: ManualParlayLeg): string | null {
  if (typeof leg.originalOdds !== "number" || typeof leg.currentOdds !== "number") {
    return null;
  }

  const movement = getOddsMovement(leg.originalOdds, leg.currentOdds);
  return `Odds ${formatAmericanOdds(leg.originalOdds)} -> ${formatAmericanOdds(leg.currentOdds)} | Chance ${directionArrow(movement.probabilityDirection)}`;
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
  const [manualParlay, setManualParlay] = useState<ManualParlay | null>(null);
  const [livePlayers, setLivePlayers] = useState<BackendPlayersResponse["players"]>([]);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    void Promise.all([getOverlayUiState(), getAppSettings(), getManualParlay()]).then(
      ([nextUiState, nextSettings, nextManualParlay]) => {
        setUiState(nextUiState);
        setSettings(nextSettings);
        setManualParlay(nextManualParlay);
      }
    );

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") {
        return;
      }

      if (changes[OVERLAY_UI_KEY]?.newValue) {
        setUiState(changes[OVERLAY_UI_KEY].newValue as OverlayUiState);
      }

      if (changes[APP_SETTINGS_KEY]?.newValue) {
        setSettings(changes[APP_SETTINGS_KEY].newValue as AppSettings);
      }

      if (changes[MANUAL_PARLAY_KEY]?.newValue) {
        setManualParlay(changes[MANUAL_PARLAY_KEY].newValue as ManualParlay);
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
        const [gameStateResponse, kalshiPositionsResponse, playerStatsResponse] = await Promise.all([
          backendApi.getGameState(settings.selectedGameId),
          backendApi.getKalshiPositions(settings.selectedGameId),
          backendApi.getPlayerStats(settings.selectedGameId)
        ]);

        const nextOverlayData = mapBackendResponsesToOverlayData(
          gameStateResponse,
          kalshiPositionsResponse
        );

        setOverlayData(nextOverlayData);
        setLivePlayers(playerStatsResponse.players);
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
  const fallbackPlayers = useMemo<BackendPlayersResponse["players"]>(
    () =>
      overlayData.gameState.playerStats.map((playerStat) => ({
        playerName: playerStat.playerName,
        team: playerStat.team,
        stats: {
          points: playerStat.statType === "points" ? playerStat.current : undefined,
          rebounds: playerStat.statType === "rebounds" ? playerStat.current : undefined,
          assists: playerStat.statType === "assists" ? playerStat.current : undefined,
          threes_made: playerStat.statType === "threes_made" ? playerStat.current : undefined,
          steals: playerStat.statType === "steals" ? playerStat.current : undefined,
          blocks: playerStat.statType === "blocks" ? playerStat.current : undefined,
          turnovers: playerStat.statType === "turnovers" ? playerStat.current : undefined
        }
      })),
    [overlayData.gameState.playerStats]
  );
  const manualOverlayChips = useMemo<ManualLegOverlayChip[]>(
    () => {
      if (!manualParlay) {
        return [];
      }

      return buildManualLegOverlayChips({
        manualLegs: manualParlay.legs,
        gameState: overlayData.gameState,
        playerStats: livePlayers.length > 0 ? livePlayers : fallbackPlayers,
        kalshiPositions: overlayData.positions
      });
    },
    [manualParlay, overlayData.gameState, livePlayers, fallbackPlayers, overlayData.positions]
  );
  const manualStatusCounts = useMemo(
    () =>
      manualOverlayChips.reduce(
        (accumulator, chip) => {
          accumulator[chip.status] += 1;
          return accumulator;
        },
        {
          hit: 0,
          live: 0,
          behind: 0,
          unavailable: 0
        } satisfies Record<ManualLegOverlayChip["status"], number>
      ),
    [manualOverlayChips]
  );

  async function updateUiState(next: OverlayUiState) {
    setUiState(next);
    await saveOverlayUiState(next);
  }

  if (!uiState || !settings || !manualParlay) {
    return null;
  }

  const isManualMode = settings.dataMode === "manual";
  const scoreline = `${gameState.awayTeam.shortName} ${gameState.awayTeam.score} - ${gameState.homeTeam.shortName} ${gameState.homeTeam.score}`;
  const clock =
    gameState.gameStatus === "live"
      ? `${gameState.quarter} ${gameState.gameClock}`
      : gameState.gameStatus === "final"
        ? "Final"
        : "Not started";
  const fullGameTitle = `${gameState.homeTeam.name} vs ${gameState.awayTeam.name}`;
  const lastUpdated = formatUpdatedTime(
    isManualMode ? manualParlay.updatedAt : overlayStatus.lastUpdated ?? gameState.updatedAt
  );
  const spread = gameState.homeTeam.score - gameState.awayTeam.score;
  const minimizedLabel = isManualMode
    ? `Kalshi | ${manualParlay.legs.length} legs | ${formatAmericanOdds(manualParlay.currentOdds)}`
    : `Kalshi | ${activePositions} active | NYK ${spread >= 0 ? "+" : ""}${spread}`;
  const parlayOddsMovement = getOddsMovement(manualParlay.originalOdds, manualParlay.currentOdds);
  const compactParlaySummary = formatParlayOddsTicker(manualParlay);
  const compactParlayDetail = formatParlayOddsTickerDetail(manualParlay);
  const trackedManualLegsCount = manualParlay.legs.length - manualStatusCounts.unavailable;
  const watchManualLegsCount = manualStatusCounts.live + manualStatusCounts.behind;
  const compactManualStatusSummary = `${trackedManualLegsCount} tracked · ${manualStatusCounts.hit} hit${watchManualLegsCount ? ` · ${watchManualLegsCount} watch` : ""}${manualStatusCounts.unavailable ? ` · ${manualStatusCounts.unavailable} unavailable` : ""}`;

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
            {isManualMode ? (
              <span className="klo-info-chip klo-title-chip">{manualParlay.parlayName}</span>
            ) : (
              <>
                <span className="klo-info-chip">{scoreline}</span>
                <span className="klo-info-chip">{clock}</span>
              </>
            )}
          </div>

          <div className="klo-ticker-center">
            {isManualMode
              ? (
                <>
                  <div
                    className="klo-info-chip klo-parlay-summary-chip"
                    title={`${compactParlaySummary} | ${compactParlayDetail} | ${compactManualStatusSummary}`}
                  >
                    {compactParlaySummary} | {compactManualStatusSummary}
                  </div>

                  {manualOverlayChips.map((chip) => {
                    const chipColor = getManualChipColor(chip.status);

                    return (
                      <div
                        className={`klo-bet-chip ${getManualChipTone(chip.status)}`}
                        key={chip.id}
                        title={chip.oddsText ? `${chip.needsText} | ${chip.oddsText}` : chip.needsText}
                      >
                        <span className="klo-chip-label">{chip.oddsText ? `${chip.label} | ${chip.oddsText}` : chip.label}</span>
                        <span
                          className="klo-chip-progress"
                          style={{
                            width: `${chip.progressPercent}%`,
                            backgroundColor: chipColor
                          }}
                        />
                      </div>
                    );
                  })}
                </>
              )
              : (
                <>
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
                </>
              )}
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
            <span className="klo-info-chip klo-status-chip">
              {isManualMode ? `${manualParlay.legs.length} legs · ${trackedManualLegsCount} tracked` : `${activePositions} active`}
            </span>
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
      ) : isManualMode ? (
        <aside className="klo-card-view">
          <div className="klo-card-header">
            <div>
              <div className="klo-card-brand">Kalshi Live Overlay</div>
              <div className="klo-card-subtitle">{manualParlay.parlayName}</div>
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
            <div className="klo-summary-eyebrow">Parlay Summary</div>
            <div className="klo-scoreboard-row">
              <span>Amount wagered</span>
              <strong>{formatCurrency(manualParlay.amountWagered)}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Estimated payout</span>
              <strong>{formatCurrency(manualParlay.estimatedPayout)}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Odds</span>
              <strong>
                {formatAmericanOdds(manualParlay.originalOdds)} {"->"} {formatAmericanOdds(manualParlay.currentOdds)}
              </strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Implied chance</span>
              <strong>
                {(americanOddsToImpliedProbability(manualParlay.originalOdds) * 100).toFixed(1)}% {"->"} {(americanOddsToImpliedProbability(manualParlay.currentOdds) * 100).toFixed(1)}%
              </strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Movement</span>
              <strong>
                Chance {directionArrow(parlayOddsMovement.probabilityDirection)} · Payout {parlayOddsMovement.payoutDirection}
              </strong>
            </div>
            <div className="klo-summary-chips">
              <span className="klo-summary-chip is-live">{trackedManualLegsCount} tracked</span>
              <span className="klo-summary-chip is-good">{manualStatusCounts.hit} hit</span>
              <span className="klo-summary-chip is-bad">{watchManualLegsCount} watch</span>
              <span className="klo-summary-chip is-unavailable">{manualStatusCounts.unavailable} unavailable</span>
            </div>
            <div className="klo-scoreboard-meta">Manual parlay mode · updated {lastUpdated}</div>
          </section>

          <section className="klo-card-section">
            <div className="klo-section-title">Manual Parlay Legs</div>
            {manualParlay.legs.length === 0 ? (
              <article className="klo-position-card">
                <div className="klo-card-title">No legs entered yet</div>
                <div className="klo-card-meta">
                  <span>Open the popup to add player props, moneylines, spreads, totals, or manual Kalshi-style markets.</span>
                </div>
              </article>
            ) : (
              manualOverlayChips.map((chip, index) => {
                const leg = manualParlay.legs[index];
                const legOddsMovement =
                  typeof leg?.originalOdds === "number" && typeof leg.currentOdds === "number"
                    ? getOddsMovement(leg.originalOdds, leg.currentOdds)
                    : null;

                return (
                  <article className={`klo-position-card klo-manual-leg-card ${getManualChipTone(chip.status)}`} key={chip.id}>
                    <div className="klo-card-meta klo-card-meta-top">
                      <div className="klo-card-title">{chip.label}</div>
                      <span className={`klo-status-badge ${getManualChipTone(chip.status)}`}>
                        {getManualChipBadgeLabel(chip.status)}
                      </span>
                    </div>
                    {(typeof chip.current === "number" || typeof chip.target === "number") ? (
                      <div className="klo-card-meta">
                        <span>
                          Live progress
                        </span>
                        <span>
                          {typeof chip.current === "number" ? chip.current : "--"}
                          {typeof chip.target === "number" ? ` / ${chip.target}` : ""}
                        </span>
                      </div>
                    ) : null}
                    <div className="klo-card-meta">
                      <span>{chip.needsText}</span>
                    </div>
                    {legOddsMovement ? (
                      <div className="klo-card-meta">
                        <span>
                          Odds {formatAmericanOdds(leg.originalOdds!)} {"->"} {formatAmericanOdds(leg.currentOdds!)}
                        </span>
                        <span>Chance {directionArrow(legOddsMovement.probabilityDirection)}</span>
                      </div>
                    ) : null}
                    {legOddsMovement ? (
                      <div className="klo-card-meta">
                        <span>
                          {(legOddsMovement.originalImpliedProbability * 100).toFixed(1)}% {"->"} {(legOddsMovement.currentImpliedProbability * 100).toFixed(1)}%
                        </span>
                        <span>Payout {legOddsMovement.payoutDirection}</span>
                      </div>
                    ) : null}
                    {leg?.type === "prediction_market" && (typeof leg.originalPrice === "number" || typeof leg.currentPrice === "number") ? (
                      <div className="klo-card-meta">
                        <span>Market price</span>
                        <span>
                          {typeof leg.originalPrice === "number" ? `${leg.originalPrice}%` : "--"} {"->"} {typeof leg.currentPrice === "number" ? `${leg.currentPrice}%` : "--"}
                        </span>
                      </div>
                    ) : null}
                    {leg?.type === "prediction_market" ? (
                      <div className="klo-card-meta">
                        <span>
                          {leg.side} {typeof leg.currentPrice === "number" ? `${leg.currentPrice}%` : "pending"}
                        </span>
                        <span>
                          entry {typeof leg.originalPrice === "number" ? `${leg.originalPrice}%` : "--"}
                        </span>
                      </div>
                    ) : null}
                    <ProgressBar progress={chip.progressPercent} color={getManualChipColor(chip.status)} />
                  </article>
                );
              })
            )}
          </section>
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

      {overlayStatus.state !== "ready" && !isManualMode ? (
        <div className={`klo-status-banner ${overlayStatus.state}`}>
          {overlayStatus.message ?? (overlayStatus.state === "loading" ? "Loading overlay data..." : "Backend error")}
        </div>
      ) : null}
    </>
  );
}
