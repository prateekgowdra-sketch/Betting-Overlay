import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackendStatusResponse,
  backendApi
} from "../services/backendApi";
import {
  APP_SETTINGS_KEY,
  AppSettings,
  getAppSettings,
  getKalshiWatchlist,
  getOverlayUiState,
  KALSHI_WATCHLIST_KEY,
  OVERLAY_UI_KEY,
  OverlayUiState,
  saveOverlayUiState
} from "../shared/storage";
import {
  KalshiBetMovementStatus,
  KalshiBetPerformance,
  KalshiLiveContext,
  KalshiMarketSide,
  KalshiMarketSnapshot,
  KalshiOverlayState,
  KalshiWatchlistItem,
  OverlayStatus
} from "../shared/types";

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

function formatUpdatedTime(timestamp?: string | null): string {
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

function formatUpdatedLabel(timestamp?: string | null): string {
  if (!timestamp) {
    return "--";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));

  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }

  if (ageSeconds < 3600) {
    return `${Math.round(ageSeconds / 60)}m ago`;
  }

  return formatUpdatedTime(timestamp);
}

function formatPrice(value: number | null | undefined): string {
  return typeof value === "number" ? `${value}c` : "--";
}

function formatVolume(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDollars(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function truncateTitle(title: string): string {
  return title.length > 40 ? `${title.slice(0, 37)}...` : title;
}

function getDisplayTitle(item: { displayTitle?: string | null; title: string }): string {
  return item.displayTitle || item.title;
}

function getCurrentSidePrice(
  side: KalshiMarketSide,
  market?: KalshiMarketSnapshot
): number | null {
  if (!market) {
    return null;
  }

  if (side === "YES") {
    return market.yesAskCents ?? market.yesBidCents ?? market.lastPriceCents;
  }

  if (typeof market.noAskCents === "number") {
    return market.noAskCents;
  }

  if (typeof market.noBidCents === "number") {
    return market.noBidCents;
  }

  if (typeof market.lastPriceCents === "number") {
    return Math.max(0, Math.min(100, 100 - market.lastPriceCents));
  }

  return null;
}

function getEffectiveContracts(item: KalshiWatchlistItem): number {
  if (item.contracts > 0) {
    return item.contracts;
  }

  if (item.amountRisked > 0 && item.entryPriceCents > 0) {
    return item.amountRisked / (item.entryPriceCents / 100);
  }

  return 0;
}

function getBetPerformance(
  item: KalshiWatchlistItem,
  market?: KalshiMarketSnapshot
): KalshiBetPerformance {
  const currentSidePriceCents = getCurrentSidePrice(item.userSide, market);
  const effectiveContracts = getEffectiveContracts(item);
  const liveQuotePayout =
    item.amountRisked > 0 && typeof currentSidePriceCents === "number" && currentSidePriceCents > 0
      ? item.amountRisked / (currentSidePriceCents / 100)
      : null;
  const movementCents =
    typeof currentSidePriceCents === "number"
      ? currentSidePriceCents - item.entryPriceCents
      : null;
  const movementStatus: KalshiBetMovementStatus =
    typeof movementCents !== "number"
      ? "unavailable"
      : movementCents > 0
        ? "favorable"
        : movementCents < 0
          ? "unfavorable"
          : "unchanged";

  return {
    currentSidePriceCents,
    movementCents,
    movementStatus,
    estimatedCurrentValue:
      typeof currentSidePriceCents === "number"
        ? (effectiveContracts * currentSidePriceCents) / 100
        : null,
    estimatedProfitLoss:
      typeof movementCents === "number" ? (effectiveContracts * movementCents) / 100 : null,
    estimatedPayout: liveQuotePayout,
    estimatedMaxProfit:
      typeof liveQuotePayout === "number" ? liveQuotePayout - item.amountRisked : null,
    amountRisked: item.amountRisked
  };
}

function getMovementTone(
  movement: number | null
): "is-good" | "is-live" | "is-bad" | "is-unavailable" {
  if (typeof movement !== "number") {
    return "is-unavailable";
  }

  if (movement > 0) {
    return "is-good";
  }

  if (movement < 0) {
    return "is-bad";
  }

  return "is-live";
}

function formatMovement(movement: number | null): string {
  if (typeof movement !== "number") {
    return "--";
  }

  if (movement === 0) {
    return "0c";
  }

  return `${movement > 0 ? "+" : ""}${movement}c`;
}

function formatMovementStatus(status: KalshiBetMovementStatus): string {
  switch (status) {
    case "favorable":
      return "Favorable";
    case "unfavorable":
      return "Unfavorable";
    case "unchanged":
      return "Unchanged";
    case "unavailable":
    default:
      return "Unavailable";
  }
}

function getProgressValue(item: KalshiWatchlistItem, market?: KalshiMarketSnapshot): number {
  const current = getCurrentSidePrice(item.userSide, market);
  return typeof current === "number" ? Math.max(0, Math.min(100, current)) : 0;
}

function renderTickerLabel(item: KalshiWatchlistItem, market?: KalshiMarketSnapshot): string {
  const performance = getBetPerformance(item, market);
  const liveSnippet = formatLiveContextSnippet(market?.liveContext);

  return `${truncateTitle(getDisplayTitle(item))} | ${item.userSide} ${formatPrice(item.entryPriceCents)} -> ${formatPrice(performance.currentSidePriceCents)} | ${formatMovement(performance.movementCents)} | ${getEffectiveContracts(item).toFixed(2)}x | Live payout ${formatDollars(performance.estimatedPayout)} | ${formatMovementStatus(performance.movementStatus)}${liveSnippet ? ` | ${liveSnippet}` : ""}`;
}

function formatLiveContextSnippet(liveContext?: KalshiLiveContext): string {
  if (!liveContext?.available) {
    return "";
  }

  const teams =
    liveContext.awayTeam || liveContext.homeTeam
      ? `${liveContext.awayTeam ?? "Away"} ${typeof liveContext.awayScore === "number" ? liveContext.awayScore : ""} @ ${liveContext.homeTeam ?? "Home"} ${typeof liveContext.homeScore === "number" ? liveContext.homeScore : ""}`.replace(/\s+/g, " ").trim()
      : "";
  const gameState = [liveContext.period, liveContext.clock, liveContext.status]
    .filter(Boolean)
    .join(" ");

  return [teams, gameState].filter(Boolean).join(" | ");
}

function formatLiveContextCardText(liveContext?: KalshiLiveContext): string {
  if (!liveContext?.available) {
    return liveContext?.unavailableReason ?? "Live game data unavailable for this market";
  }

  const score = formatLiveContextSnippet(liveContext);
  return score || "Live context available from Kalshi";
}

function statusTone(status?: string): "is-good" | "is-live" | "is-bad" | "is-unavailable" {
  switch (status) {
    case "active":
    case "open":
      return "is-good";
    case "inactive":
    case "paused":
      return "is-live";
    case "closed":
    case "settled":
      return "is-bad";
    default:
      return "is-unavailable";
  }
}

function getDataQualityLabel(overlayState: KalshiOverlayState | null): string {
  if (!overlayState) {
    return "Market data loading";
  }

  const marketStatus = overlayState.dataQuality.marketDataStatus;
  const positionStatus =
    overlayState.dataQuality.positionsStatus ?? overlayState.dataQuality.positionStatus;

  return `Market data ${marketStatus} | Positions ${positionStatus}`;
}

export function OverlayApp() {
  const [uiState, setUiState] = useState<OverlayUiState | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [watchlist, setWatchlist] = useState<KalshiWatchlistItem[]>([]);
  const [marketsByTicker, setMarketsByTicker] = useState<Record<string, KalshiMarketSnapshot>>({});
  const [backendStatus, setBackendStatus] = useState<BackendStatusResponse | null>(null);
  const [overlayState, setOverlayState] = useState<KalshiOverlayState | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>({
    state: "loading",
    message: "Connecting to Kalshi market tracker..."
  });
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    void Promise.all([
      getOverlayUiState(),
      getAppSettings(),
      getKalshiWatchlist(),
      backendApi.getBackendStatus().catch(() => null)
    ])
      .then(([nextUiState, nextSettings, nextWatchlist, nextBackendStatus]) => {
        setUiState(nextUiState);
        setSettings(nextSettings);
        setWatchlist(nextWatchlist);
        setBackendStatus(nextBackendStatus);
      })
      .catch((error) => {
        if (isExtensionContextInvalidated(error)) {
          return;
        }

        throw error;
      });

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

      if (changes[KALSHI_WATCHLIST_KEY]?.newValue) {
        setWatchlist(changes[KALSHI_WATCHLIST_KEY].newValue as KalshiWatchlistItem[]);
      }
    };

    try {
      chrome.storage.onChanged.addListener(listener);
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        throw error;
      }
    }

    return () => {
      try {
        chrome.storage.onChanged.removeListener(listener);
      } catch (error) {
        if (!isExtensionContextInvalidated(error)) {
          throw error;
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const syncWatchedMarkets = async () => {
      if (syncInFlightRef.current) {
        return;
      }

      if (settings.dataMode !== "markets") {
        setOverlayStatus({
          state: "ready",
          message: "Switch the popup back to Kalshi market tracker mode.",
          lastUpdated: new Date().toISOString()
        });
        return;
      }

      if (watchlist.length === 0) {
        setMarketsByTicker({});
        setOverlayStatus({
          state: "ready",
          message: "Add a market to your watchlist in the popup.",
          lastUpdated: new Date().toISOString()
        });
        return;
      }

      syncInFlightRef.current = true;
      setOverlayStatus((current) =>
        current.state === "ready"
          ? current
          : { state: "loading", message: "Refreshing watched Kalshi markets..." }
      );

      try {
        const [nextOverlayState, nextBackendStatus] = await Promise.all([
          backendApi.getOverlayState(watchlist.map((item) => item.ticker)),
          backendApi.getBackendStatus().catch(() => null)
        ]);
        const nextMarketsByTicker = Object.fromEntries(
          nextOverlayState.watchedMarkets.map((market) => [market.ticker, market])
        );
        const updatedTimes = nextOverlayState.watchedMarkets
          .map((market) => market.dataQuality?.lastUpdated ?? market.updatedAt)
          .filter((value): value is string => Boolean(value));

        setMarketsByTicker(nextMarketsByTicker);
        setBackendStatus(nextBackendStatus);
        setOverlayState(nextOverlayState);
        setOverlayStatus({
          state: "ready",
          message: nextOverlayState.dataQuality.message,
          lastUpdated:
            updatedTimes.sort().at(-1) ?? nextOverlayState.updatedAt
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to reach the backend. Make sure localhost:3001 is running.";

        setOverlayState((current) =>
          current
            ? {
                ...current,
                dataQuality: {
                  ...current.dataQuality,
                  marketDataStatus: "stale",
                  message: "Market data stale - showing last known price"
                },
                updatedAt: new Date().toISOString()
              }
            : current
        );
        setOverlayStatus({
          state: "error",
          message: marketsByTicker ? `Market data stale - ${message}` : message,
          lastUpdated: new Date().toISOString()
        });
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void syncWatchedMarkets();
    const interval = window.setInterval(() => {
      void syncWatchedMarkets();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [settings, watchlist]);

  async function updateUiState(next: OverlayUiState) {
    setUiState(next);
    await saveOverlayUiState(next);
  }

  const watchedMarkets = useMemo(
    () =>
      watchlist.map((item) => ({
        item,
        market: marketsByTicker[item.ticker]
      })),
    [watchlist, marketsByTicker]
  );
  const watchCount = watchedMarkets.length;
  const totalPositionCount =
    overlayState?.positions.filter((position) => position.contracts > 0).length ??
    watchedMarkets.filter(({ market }) => market?.position && market.position.contracts > 0).length;
  const lastUpdated = formatUpdatedLabel(overlayStatus.lastUpdated);
  const dataQualityLabel = getDataQualityLabel(overlayState);

  if (!uiState || !settings) {
    return null;
  }

  if (uiState.closed) {
    return (
      <button
        type="button"
        className="klo-pill"
        onClick={() =>
          void updateUiState({
            ...uiState,
            closed: false,
            minimized: false
          })
        }
      >
        Open Kalshi Market Tracker
      </button>
    );
  }

  const minimizedLabel = `Kalshi | ${watchCount} watched${watchCount ? ` | Updated ${lastUpdated}` : ""}`;

  if (uiState.minimized) {
    return (
      <button
        type="button"
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
            <span className="klo-info-chip klo-title-chip">Market Tracker</span>
            <span className="klo-info-chip">{watchCount} watched</span>
          </div>

          <div className="klo-ticker-center">
            {watchedMarkets.length === 0 ? (
              <div className="klo-info-chip">Add a watched market in the popup to begin tracking.</div>
            ) : (
              watchedMarkets.map(({ item, market }) => {
                const performance = getBetPerformance(item, market);
                const tone = getMovementTone(performance.movementCents);

                return (
                  <div className={`klo-bet-chip ${tone}`} key={item.ticker} title={item.ticker}>
                    <span className="klo-chip-label">{renderTickerLabel(item, market)}</span>
                    <span
                      className="klo-chip-progress"
                      style={{ width: `${getProgressValue(item, market)}%` }}
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="klo-ticker-right">
            <button
              type="button"
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
              {totalPositionCount} read-only position{totalPositionCount === 1 ? "" : "s"}
            </span>
            {overlayStatus.message ? (
              <span className="klo-info-chip klo-status-chip">{overlayStatus.message}</span>
            ) : null}
            <span className="klo-info-chip klo-status-chip">{dataQualityLabel}</span>
            <span className="klo-info-chip klo-updated-chip">Updated {lastUpdated}</span>
            <button
              type="button"
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
              <div className="klo-card-brand">Kalshi Market Tracker</div>
              <div className="klo-card-subtitle">
                {watchCount} watched market{watchCount === 1 ? "" : "s"} · Public env {backendStatus?.kalshiPublicEnv ?? "production"}
              </div>
            </div>
            <div className="klo-card-actions">
              <button
                type="button"
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
                type="button"
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
                type="button"
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
            <div className="klo-summary-eyebrow">Tracker Summary</div>
            <div className="klo-scoreboard-row">
              <span>Watched markets</span>
              <strong>{watchCount}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Read-only positions</span>
              <strong>{totalPositionCount}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Data quality</span>
              <strong>{overlayState?.dataQuality.marketDataStatus ?? "loading"}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Last sync</span>
              <strong>{lastUpdated}</strong>
            </div>
            <div className="klo-scoreboard-meta">
              Market prices are tracked from Kalshi public market data. Game or player stats may be unavailable from Kalshi for many markets.
            </div>
            {overlayStatus.message ? (
              <div className="klo-scoreboard-meta">{overlayStatus.message}</div>
            ) : null}
          </section>

          <section className="klo-card-section">
            <div className="klo-section-title">Watched Kalshi Markets</div>
            {watchedMarkets.length === 0 ? (
              <article className="klo-position-card">
                <div className="klo-card-title">No watched markets yet</div>
                <div className="klo-card-meta">
                  <span>Open the popup and add a Kalshi market to your watchlist.</span>
                </div>
              </article>
            ) : (
              watchedMarkets.map(({ item, market }) => {
                const performance = getBetPerformance(item, market);
                const tone = getMovementTone(performance.movementCents);
                const trackedPosition = market?.position ?? null;

                return (
                  <article className={`klo-position-card klo-manual-leg-card ${tone}`} key={item.ticker}>
                    <div className="klo-card-meta klo-card-meta-top">
                      <div className="klo-card-title">{getDisplayTitle(item)}</div>
                      <span className={`klo-status-badge ${statusTone(market?.status)}`}>
                        {market?.status ?? "unavailable"}
                      </span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Ticker</span>
                      <span>{item.ticker}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>YES bid / ask</span>
                      <span>{formatPrice(market?.yesBidCents)} / {formatPrice(market?.yesAskCents)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>NO bid / ask</span>
                      <span>{formatPrice(market?.noBidCents)} / {formatPrice(market?.noAskCents)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Last price</span>
                      <span>{formatPrice(market?.lastPriceCents)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Your tracked side</span>
                      <span>{item.userSide}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Entry price</span>
                      <span>{formatPrice(item.entryPriceCents)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Current side price</span>
                      <span>{formatPrice(performance.currentSidePriceCents)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Contracts</span>
                      <span>{item.contracts}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Amount risked</span>
                      <span>{formatDollars(performance.amountRisked)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Movement</span>
                      <span>{formatMovement(performance.movementCents)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Approx value</span>
                      <span>{formatDollars(performance.estimatedCurrentValue)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Approx P/L</span>
                      <span>{formatDollars(performance.estimatedProfitLoss)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Live quote payout</span>
                      <span>{formatDollars(performance.estimatedPayout)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Live quote profit</span>
                      <span>{formatDollars(performance.estimatedMaxProfit)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Status</span>
                      <span>{formatMovementStatus(performance.movementStatus)}</span>
                    </div>
                    {trackedPosition ? (
                      <div className="klo-card-meta">
                        <span>Read-only position</span>
                        <span>
                          {trackedPosition.side} · {trackedPosition.contracts} @ {formatPrice(trackedPosition.entryPriceCents)}
                        </span>
                      </div>
                    ) : null}
                    <div className="klo-card-meta">
                      <span>Volume</span>
                      <span>{formatVolume(market?.volume)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Updated</span>
                      <span>{formatUpdatedLabel(market?.dataQuality?.lastUpdated ?? market?.updatedAt)}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Market data</span>
                      <span>{market?.dataQuality?.marketDataStatus ?? "unavailable"}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Position match</span>
                      <span>{market?.dataQuality?.positionStatus ?? "unavailable"}</span>
                    </div>
                    <div className="klo-card-meta">
                      <span>Live context</span>
                      <span>{formatLiveContextCardText(market?.liveContext)}</span>
                    </div>
                    {item.notes ? (
                      <div className="klo-card-meta">
                        <span>Notes</span>
                        <span>{item.notes}</span>
                      </div>
                    ) : null}
                    <div className="klo-progress-track">
                      <div className="klo-progress-fill" style={{ width: `${getProgressValue(item, market)}%` }} />
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </aside>
      )}
    </>
  );
}
