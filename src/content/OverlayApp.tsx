import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackendStatusResponse,
  backendApi
} from "../services/backendApi";
import {
  APP_SETTINGS_KEY,
  AppSettings,
  getAppSettings,
  getKalshiComboTrackers,
  getKalshiWatchlist,
  getOverlayUiState,
  KALSHI_COMBO_TRACKERS_KEY,
  KALSHI_WATCHLIST_KEY,
  OVERLAY_UI_KEY,
  OverlayUiState,
  saveKalshiWatchlist,
  saveOverlayUiState
} from "../shared/storage";
import {
  KalshiBetMovementStatus,
  KalshiBetPerformance,
  KalshiComboTracker,
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

function formatKalshiPriceAsPercent(value: number | null | undefined): string {
  return typeof value === "number" ? `${Math.round(value)}%` : "--";
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

function isResolvedMarket(market?: KalshiMarketSnapshot): boolean {
  return Boolean(market?.isResolved);
}

function getLifecycleLabel(market?: KalshiMarketSnapshot): string {
  if (!market) {
    return "unavailable";
  }

  return market.lifecycleStatus ?? market.status ?? "unavailable";
}

function getResultLabel(market?: KalshiMarketSnapshot): string {
  if (!market?.isResolved) {
    return "";
  }

  if (!market.resultKnown || !market.winningSide) {
    return "Result unknown";
  }

  return `${market.winningSide} won`;
}

function getCurrentSidePrice(
  side: KalshiMarketSide,
  market?: KalshiMarketSnapshot
): number | null {
  if (!market) {
    return null;
  }

  if (market.isResolved) {
    if (!market.resultKnown || !market.winningSide) {
      return null;
    }

    return market.winningSide === side ? 100 : 0;
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

function getSideProbability(
  market: KalshiMarketSnapshot | undefined,
  side: KalshiMarketSide
): number | null {
  return getCurrentSidePrice(side, market);
}

function getYesProbability(market?: KalshiMarketSnapshot): number | null {
  if (!market) {
    return null;
  }

  if (market.isResolved) {
    if (!market.resultKnown || !market.winningSide) {
      return null;
    }

    return market.winningSide === "YES" ? 100 : 0;
  }

  return market.yesAskCents ?? market.yesBidCents ?? market.lastPriceCents;
}

function getNoProbability(market?: KalshiMarketSnapshot): number | null {
  if (!market) {
    return null;
  }

  if (market.isResolved) {
    if (!market.resultKnown || !market.winningSide) {
      return null;
    }

    return market.winningSide === "NO" ? 100 : 0;
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

function getProbabilityMovement(
  entryPrice: number,
  currentSidePrice: number | null,
  _side: KalshiMarketSide
): number | null {
  return typeof currentSidePrice === "number" ? currentSidePrice - entryPrice : null;
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
  const currentSidePriceCents = getSideProbability(market, item.userSide);
  const effectiveContracts = getEffectiveContracts(item);
  const liveQuotePayout =
    item.amountRisked > 0 && typeof currentSidePriceCents === "number" && currentSidePriceCents > 0
      ? item.amountRisked / (currentSidePriceCents / 100)
      : null;
  const movementCents = getProbabilityMovement(
    item.entryPriceCents,
    currentSidePriceCents,
    item.userSide
  );
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

function formatProbabilityMovement(movement: number | null): string {
  if (typeof movement !== "number") {
    return "--";
  }

  if (movement === 0) {
    return "0%";
  }

  return `${movement > 0 ? "+" : ""}${Math.round(movement)}%`;
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

function formatMovementStatusLower(status: KalshiBetMovementStatus): string {
  return formatMovementStatus(status).toLowerCase();
}

function getProgressValue(item: KalshiWatchlistItem, market?: KalshiMarketSnapshot): number {
  const current = getCurrentSidePrice(item.userSide, market);
  return typeof current === "number" ? Math.max(0, Math.min(100, current)) : 0;
}

function renderTickerLabel(item: KalshiWatchlistItem, market?: KalshiMarketSnapshot): string {
  const performance = getBetPerformance(item, market);
  const currentProbability = formatKalshiPriceAsPercent(performance.currentSidePriceCents);
  const movement = formatProbabilityMovement(performance.movementCents);
  const status = formatMovementStatusLower(performance.movementStatus);

  return `${truncateTitle(getDisplayTitle(item))} | ${item.userSide} ${currentProbability} | You ${item.userSide} | ${movement} ${status}`;
}

type ComboStatus = "live" | "won" | "lost" | "incomplete data";

interface ComboSummary {
  estimatedProbability: number | null;
  estimatedPayout: number | null;
  estimatedProfit: number | null;
  status: ComboStatus;
  liveCount: number;
  wonCount: number;
  lostCount: number;
  unavailableCount: number;
}

function getComboSummary(
  combo: KalshiComboTracker,
  marketsByTicker: Record<string, KalshiMarketSnapshot>
): ComboSummary {
  let probabilityProduct = 1;
  let hasProbability = combo.legs.length > 0;
  let liveCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let unavailableCount = 0;

  for (const leg of combo.legs) {
    const market = marketsByTicker[leg.ticker];

    if (!market) {
      unavailableCount += 1;
      hasProbability = false;
      continue;
    }

    if (market.isResolved) {
      if (!market.resultKnown || !market.winningSide) {
        unavailableCount += 1;
        hasProbability = false;
      } else if (market.winningSide === leg.userSide) {
        wonCount += 1;
      } else {
        lostCount += 1;
        probabilityProduct = 0;
      }

      continue;
    }

    const probability = getSideProbability(market, leg.userSide);

    if (typeof probability !== "number") {
      unavailableCount += 1;
      hasProbability = false;
      continue;
    }

    liveCount += 1;
    probabilityProduct *= probability / 100;
  }

  const status: ComboStatus =
    lostCount > 0
      ? "lost"
      : unavailableCount > 0
        ? "incomplete data"
        : liveCount === 0 && combo.legs.length > 0
          ? "won"
          : "live";

  const estimatedProbability = hasProbability ? probabilityProduct * 100 : null;
  const estimatedPayout =
    typeof estimatedProbability === "number" && estimatedProbability > 0
      ? combo.amountRisked / (estimatedProbability / 100)
      : null;

  return {
    estimatedProbability,
    estimatedPayout,
    estimatedProfit:
      typeof estimatedPayout === "number" ? estimatedPayout - combo.amountRisked : null,
    status,
    liveCount,
    wonCount,
    lostCount,
    unavailableCount
  };
}

function formatComboProbability(value: number | null): string {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "--";
}

function isClosingSoon(market?: KalshiMarketSnapshot): boolean {
  if (!market?.closeTime || market.isResolved) {
    return false;
  }

  const closeTime = new Date(market.closeTime).getTime();

  if (!Number.isFinite(closeTime)) {
    return false;
  }

  const minutesUntilClose = (closeTime - Date.now()) / 60000;
  return minutesUntilClose >= 0 && minutesUntilClose <= 30;
}

function isMarketStale(market?: KalshiMarketSnapshot): boolean {
  const updatedAt = market?.dataQuality?.lastUpdated ?? market?.updatedAt;

  if (!updatedAt || market?.isResolved) {
    return false;
  }

  const updatedTime = new Date(updatedAt).getTime();
  return Number.isFinite(updatedTime) && Date.now() - updatedTime > 60000;
}

function getMarketAlerts(
  market: KalshiMarketSnapshot | undefined,
  performance: KalshiBetPerformance,
  userSide: KalshiMarketSide
): string[] {
  const alerts: string[] = [];

  if (typeof performance.movementCents === "number" && Math.abs(performance.movementCents) >= 10) {
    alerts.push(performance.movementCents > 0 ? "Big move" : "Dropping");
  }

  if (isClosingSoon(market)) {
    alerts.push("Closing soon");
  }

  if (isMarketStale(market)) {
    alerts.push("Stale");
  }

  if (market?.isResolved && market.resultKnown && market.winningSide) {
    alerts.push(market.winningSide === userSide ? "Won" : "Lost");
  }

  return alerts;
}

function getComboAlerts(combo: KalshiComboTracker, summary: ComboSummary): string[] {
  const alerts: string[] = [];

  if (summary.status === "won") alerts.push("Won");
  if (summary.status === "lost") alerts.push("Lost");
  if (summary.status === "incomplete data") alerts.push("Stale");

  const entryProduct = combo.legs.reduce((product, leg) => product * (leg.entryPriceCents / 100), 1) * 100;

  if (typeof summary.estimatedProbability === "number" && combo.legs.length > 0) {
    const movement = summary.estimatedProbability - entryProduct;

    if (Math.abs(movement) >= 10) {
      alerts.push(movement > 0 ? "Big move" : "Dropping");
    }
  }

  return alerts;
}

function comboTone(status: ComboStatus): "is-good" | "is-live" | "is-bad" | "is-unavailable" {
  switch (status) {
    case "won":
      return "is-good";
    case "live":
      return "is-live";
    case "lost":
      return "is-bad";
    case "incomplete data":
    default:
      return "is-unavailable";
  }
}

function renderComboTickerLabel(
  combo: KalshiComboTracker,
  summary: ComboSummary
): string {
  const primaryAlert = getComboAlerts(combo, summary)[0];
  return `${truncateTitle(combo.name)} | Risk ${formatDollars(combo.amountRisked)} | Est. ${formatComboProbability(summary.estimatedProbability)} | Pays ~${formatDollars(summary.estimatedPayout)} | ${primaryAlert ?? summary.status}`;
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
    case "finalized":
    case "resolved":
      return "is-bad";
    default:
      return "is-unavailable";
  }
}

export function OverlayApp() {
  const [uiState, setUiState] = useState<OverlayUiState | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [watchlist, setWatchlist] = useState<KalshiWatchlistItem[]>([]);
  const [comboTrackers, setComboTrackers] = useState<KalshiComboTracker[]>([]);
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
      getKalshiComboTrackers(),
      backendApi.getBackendStatus().catch(() => null)
    ])
      .then(([nextUiState, nextSettings, nextWatchlist, nextComboTrackers, nextBackendStatus]) => {
        setUiState(nextUiState);
        setSettings(nextSettings);
        setWatchlist(nextWatchlist);
        setComboTrackers(nextComboTrackers);
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

      if (changes[KALSHI_COMBO_TRACKERS_KEY]?.newValue) {
        setComboTrackers(changes[KALSHI_COMBO_TRACKERS_KEY].newValue as KalshiComboTracker[]);
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

      const visibleWatchlist = watchlist.filter((item) => !item.hidden && !item.archived);
      const activeCombos = comboTrackers.filter((combo) => !combo.archived);
      const watchedTickers = [
        ...visibleWatchlist.map((item) => item.ticker),
        ...activeCombos.flatMap((combo) => combo.legs.map((leg) => leg.ticker))
      ].filter((ticker, index, allTickers) => allTickers.indexOf(ticker) === index);

      if (watchedTickers.length === 0) {
        setMarketsByTicker({});
        setOverlayStatus({
          state: "ready",
          message: "Add a market or combo to track in the popup.",
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
          backendApi.getOverlayState(watchedTickers),
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
  }, [settings, watchlist, comboTrackers]);

  async function updateUiState(next: OverlayUiState) {
    setUiState(next);
    await saveOverlayUiState(next);
  }

  async function hideWatchedMarket(ticker: string) {
    const now = new Date().toISOString();
    const nextWatchlist = watchlist.map((item) =>
      item.ticker === ticker
        ? {
            ...item,
            hidden: true,
            hiddenAt: now,
            archived: true,
            updatedAt: now
          }
        : item
    );

    setWatchlist(nextWatchlist);
    await saveKalshiWatchlist(nextWatchlist);
  }

  const watchedMarkets = useMemo(
    () =>
      watchlist
        .filter((item) => !item.hidden && !item.archived)
        .map((item) => ({
          item,
          market: marketsByTicker[item.ticker]
        })),
    [watchlist, marketsByTicker]
  );
  const activeComboTrackers = useMemo(
    () => comboTrackers.filter((combo) => !combo.archived && combo.legs.length > 0),
    [comboTrackers]
  );
  const comboSummaries = useMemo(
    () =>
      activeComboTrackers.map((combo) => ({
        combo,
        summary: getComboSummary(combo, marketsByTicker)
      })),
    [activeComboTrackers, marketsByTicker]
  );
  const activeWatchedMarkets = watchedMarkets.filter(({ market }) => !isResolvedMarket(market));
  const finalizedWatchedMarkets = watchedMarkets.filter(({ market }) => isResolvedMarket(market));
  const portfolioSummary = useMemo(() => {
    const watchedPerformances = watchedMarkets.map(({ item, market }) => ({
      item,
      performance: getBetPerformance(item, market)
    }));
    const watchedRisk = watchedPerformances.reduce((sum, entry) => sum + entry.performance.amountRisked, 0);
    const watchedValue = watchedPerformances.reduce(
      (sum, entry) => sum + (entry.performance.estimatedCurrentValue ?? 0),
      0
    );
    const watchedProfitLoss = watchedPerformances.reduce(
      (sum, entry) => sum + (entry.performance.estimatedProfitLoss ?? 0),
      0
    );
    const comboRisk = comboSummaries.reduce((sum, entry) => sum + entry.combo.amountRisked, 0);
    const comboValue = comboSummaries.reduce((sum, entry) => sum + (entry.summary.estimatedPayout ?? 0), 0);
    const comboProfit = comboSummaries.reduce((sum, entry) => sum + (entry.summary.estimatedProfit ?? 0), 0);

    return {
      totalRisk: watchedRisk + comboRisk,
      estimatedValue: watchedValue + comboValue,
      profitLoss: watchedProfitLoss + comboProfit,
      activeMarkets: activeWatchedMarkets.length,
      activeCombos: comboSummaries.length,
      favorableCount: watchedPerformances.filter((entry) => entry.performance.movementStatus === "favorable").length,
      unfavorableCount: watchedPerformances.filter((entry) => entry.performance.movementStatus === "unfavorable").length,
      settledCount: finalizedWatchedMarkets.length
    };
  }, [watchedMarkets, activeWatchedMarkets.length, finalizedWatchedMarkets.length, comboSummaries]);
  const watchCount = watchedMarkets.length;
  const totalPositionCount =
    overlayState?.positions.filter((position) => position.contracts > 0).length ??
    watchedMarkets.filter(({ market }) => market?.position && market.position.contracts > 0).length;
  const lastUpdated = formatUpdatedLabel(overlayStatus.lastUpdated);

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
            <span className="klo-info-chip klo-portfolio-chip">
              Portfolio | Risk {formatDollars(portfolioSummary.totalRisk)} | Est. value {formatDollars(portfolioSummary.estimatedValue)} | P/L {formatDollars(portfolioSummary.profitLoss)}
            </span>
          </div>

          <div className="klo-ticker-center">
            {activeWatchedMarkets.length === 0 && comboSummaries.length === 0 ? (
              <div className="klo-info-chip">
                {watchedMarkets.length === 0
                  ? "Add a watched market or combo in the popup to begin tracking."
                  : "No active watched markets. Settled markets are in card view."}
              </div>
            ) : (
              <>
                {activeWatchedMarkets.map(({ item, market }) => {
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
                })}
                {comboSummaries.map(({ combo, summary }) => (
                  <div
                    className={`klo-bet-chip ${comboTone(summary.status)}`}
                    key={combo.id}
                    title={combo.name}
                  >
                    <span className="klo-chip-label">{renderComboTickerLabel(combo, summary)}</span>
                    <span
                      className="klo-chip-progress"
                      style={{
                        width: `${Math.max(0, Math.min(100, summary.estimatedProbability ?? 0))}%`
                      }}
                    />
                  </div>
                ))}
              </>
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
            <div className="klo-summary-eyebrow">Portfolio Summary</div>
            <div className="klo-scoreboard-row">
              <span>Total tracked risk</span>
              <strong>{formatDollars(portfolioSummary.totalRisk)}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Estimated value</span>
              <strong>{formatDollars(portfolioSummary.estimatedValue)}</strong>
            </div>
            <div className="klo-scoreboard-row">
              <span>Approx P/L</span>
              <strong>{formatDollars(portfolioSummary.profitLoss)}</strong>
            </div>
            <div className="klo-summary-chips">
              <span className="klo-summary-chip is-live">{portfolioSummary.activeMarkets} active markets</span>
              <span className="klo-summary-chip is-live">{portfolioSummary.activeCombos} active combos</span>
              <span className="klo-summary-chip is-good">{portfolioSummary.favorableCount} favorable</span>
              <span className="klo-summary-chip is-bad">{portfolioSummary.unfavorableCount} unfavorable</span>
              <span className="klo-summary-chip is-unavailable">{portfolioSummary.settledCount} settled</span>
            </div>
          </section>

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
            {activeWatchedMarkets.length === 0 ? (
              <article className="klo-position-card">
                <div className="klo-card-title">
                  {watchCount === 0 ? "No watched markets yet" : "No active watched markets"}
                </div>
                <div className="klo-card-meta">
                  <span>
                    {watchCount === 0
                      ? "Open the popup and add a Kalshi market to your watchlist."
                      : "Settled or finalized markets are shown in their own section below."}
                  </span>
                </div>
              </article>
            ) : (
              activeWatchedMarkets.map(({ item, market }) => {
                const performance = getBetPerformance(item, market);
                const tone = getMovementTone(performance.movementCents);
                const trackedPosition = market?.position ?? null;
                const yesProbability = getYesProbability(market);
                const noProbability = getNoProbability(market);
                const currentProbability = getSideProbability(market, item.userSide);
                const marketUpdatedAt = market?.dataQuality?.lastUpdated ?? market?.updatedAt;
                const isMarketDataUnavailable = !market;
                const isResolved = isResolvedMarket(market);
                const resultLabel = getResultLabel(market);
                const alerts = getMarketAlerts(market, performance, item.userSide);

                return (
                  <article className={`klo-position-card klo-manual-leg-card ${tone}`} key={item.ticker}>
                    <div className="klo-card-topline">
                      <div className="klo-card-title">{getDisplayTitle(item)}</div>
                      <span className={`klo-status-badge ${statusTone(getLifecycleLabel(market))}`}>
                        {getLifecycleLabel(market)}
                      </span>
                    </div>

                    {alerts.length > 0 ? (
                      <div className="klo-alert-row">
                        {alerts.map((alert) => (
                          <span className="klo-alert-badge" key={alert}>{alert}</span>
                        ))}
                      </div>
                    ) : null}

                    {isMarketDataUnavailable ? (
                      <div className="klo-simple-message">Market data unavailable</div>
                    ) : isResolved && !market.resultKnown ? (
                      <>
                        <div className="klo-simple-message">Finalized - result unknown</div>
                        <div className="klo-card-primary-grid">
                          <div className="klo-primary-row">
                            <span>Your side</span>
                            <strong>{item.userSide}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Entry</span>
                            <strong>{formatKalshiPriceAsPercent(item.entryPriceCents)}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>P/L</span>
                            <strong>--</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Last updated</span>
                            <strong>{formatUpdatedLabel(marketUpdatedAt)}</strong>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="klo-probability-row">
                          <div className="klo-probability-box">
                            <span className="klo-prob-label">YES</span>
                            <strong>{formatKalshiPriceAsPercent(yesProbability)}</strong>
                          </div>
                          <div className="klo-probability-box">
                            <span className="klo-prob-label">NO</span>
                            <strong>{formatKalshiPriceAsPercent(noProbability)}</strong>
                          </div>
                        </div>

                        <div className="klo-card-primary-grid">
                          {isResolved ? (
                            <div className="klo-primary-row">
                              <span>Result</span>
                              <strong>{resultLabel}</strong>
                            </div>
                          ) : null}
                          <div className="klo-primary-row">
                            <span>Your side</span>
                            <strong>{item.userSide}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Entry</span>
                            <strong>{formatKalshiPriceAsPercent(item.entryPriceCents)}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>{isResolved ? "Final" : "Current"}</span>
                            <strong>{formatKalshiPriceAsPercent(currentProbability)}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Move</span>
                            <strong className={`klo-move-pill ${tone}`}>
                              {formatProbabilityMovement(performance.movementCents)} {formatMovementStatusLower(performance.movementStatus)}
                            </strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Risked</span>
                            <strong>{formatDollars(performance.amountRisked)}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Est. value</span>
                            <strong>{formatDollars(performance.estimatedCurrentValue)}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Approx P/L</span>
                            <strong>{formatDollars(performance.estimatedProfitLoss)}</strong>
                          </div>
                          <div className="klo-primary-row">
                            <span>Last updated</span>
                            <strong>{formatUpdatedLabel(marketUpdatedAt)}</strong>
                          </div>
                        </div>

                        <div className="klo-card-context-line">
                          {isResolved
                            ? `Result: ${resultLabel}`
                            : market.liveContext?.available
                            ? formatLiveContextCardText(market.liveContext)
                            : "Game context unavailable"}
                        </div>
                      </>
                    )}

                    <details className="klo-details">
                      <summary>Details</summary>
                      <div className="klo-card-meta">
                        <span>Ticker</span>
                        <span>{item.ticker}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Event ticker</span>
                        <span>{item.eventTicker ?? market?.eventTicker ?? "--"}</span>
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
                        <span>Raw movement</span>
                        <span>{formatMovement(performance.movementCents)}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Contracts</span>
                        <span>{item.contracts}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Live quote payout</span>
                        <span>{formatDollars(performance.estimatedPayout)}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Live quote profit</span>
                        <span>{formatDollars(performance.estimatedMaxProfit)}</span>
                      </div>
                      {trackedPosition ? (
                        <div className="klo-card-meta">
                          <span>Position match</span>
                          <span>
                            {trackedPosition.side} · {trackedPosition.contracts} @ {formatPrice(trackedPosition.entryPriceCents)}
                          </span>
                        </div>
                      ) : (
                        <div className="klo-card-meta">
                          <span>Position match</span>
                          <span>{market?.dataQuality?.positionStatus ?? "unavailable"}</span>
                        </div>
                      )}
                      <div className="klo-card-meta">
                        <span>Market data</span>
                        <span>{market?.dataQuality?.marketDataStatus ?? "unavailable"}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Live context</span>
                        <span>{formatLiveContextCardText(market?.liveContext)}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Volume</span>
                        <span>{formatVolume(market?.volume)}</span>
                      </div>
                      {item.notes ? (
                        <div className="klo-card-meta">
                          <span>Notes</span>
                          <span>{item.notes}</span>
                        </div>
                      ) : null}
                    </details>

                    <div className="klo-progress-track">
                      <div className="klo-progress-fill" style={{ width: `${getProgressValue(item, market)}%` }} />
                    </div>
                  </article>
                );
              })
            )}
          </section>

          {comboSummaries.length > 0 ? (
            <section className="klo-card-section">
              <div className="klo-section-title">Combo Trackers</div>
              {comboSummaries.map(({ combo, summary }) => {
                const alerts = getComboAlerts(combo, summary);

                return (
                <article className={`klo-position-card klo-combo-card ${comboTone(summary.status)}`} key={combo.id}>
                  <div className="klo-card-topline">
                    <div className="klo-card-title">{combo.name}</div>
                    <span className={`klo-status-badge ${comboTone(summary.status)}`}>
                      {summary.status}
                    </span>
                  </div>
                  {alerts.length > 0 ? (
                    <div className="klo-alert-row">
                      {alerts.map((alert) => (
                        <span className="klo-alert-badge" key={alert}>{alert}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="klo-card-primary-grid">
                    <div className="klo-primary-row">
                      <span>Risk</span>
                      <strong>{formatDollars(combo.amountRisked)}</strong>
                    </div>
                    <div className="klo-primary-row">
                      <span>Est. combo chance</span>
                      <strong>{formatComboProbability(summary.estimatedProbability)}</strong>
                    </div>
                    <div className="klo-primary-row">
                      <span>Est. payout</span>
                      <strong>{formatDollars(summary.estimatedPayout)}</strong>
                    </div>
                    <div className="klo-primary-row">
                      <span>Est. profit</span>
                      <strong>{formatDollars(summary.estimatedProfit)}</strong>
                    </div>
                    <div className="klo-primary-row">
                      <span>Legs</span>
                      <strong>
                        {summary.liveCount} live / {summary.wonCount} won
                      </strong>
                    </div>
                  </div>
                  <div className="klo-card-context-line">Estimated; markets may be correlated.</div>
                  <div className="klo-combo-leg-list">
                    {combo.legs.length === 0 ? (
                      <div className="klo-simple-message">No legs added yet</div>
                    ) : (
                      combo.legs.map((leg) => {
                        const market = marketsByTicker[leg.ticker];
                        const currentProbability = getSideProbability(market, leg.userSide);
                        const movement = getProbabilityMovement(
                          leg.entryPriceCents,
                          currentProbability,
                          leg.userSide
                        );
                        const resolvedResult =
                          market?.isResolved && market.resultKnown && market.winningSide
                            ? market.winningSide === leg.userSide
                              ? "won"
                              : "lost"
                            : market?.isResolved
                              ? "result unknown"
                              : getLifecycleLabel(market);
                        const tone =
                          resolvedResult === "won"
                            ? "is-good"
                            : resolvedResult === "lost"
                              ? "is-bad"
                              : getMovementTone(movement);

                        return (
                          <div className="klo-combo-leg-row" key={leg.id}>
                            <span className={`klo-leg-dot ${tone}`} />
                            <div className="klo-combo-leg-main">
                              <strong>{leg.displayTitle || leg.title}</strong>
                              <span>
                                {leg.userSide} {formatKalshiPriceAsPercent(currentProbability)} | {formatProbabilityMovement(movement)} | {resolvedResult}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
                );
              })}
            </section>
          ) : null}

          {finalizedWatchedMarkets.length > 0 ? (
            <section className="klo-card-section">
              <div className="klo-section-title">Settled / Finalized markets</div>
              {finalizedWatchedMarkets.map(({ item, market }) => {
                const performance = getBetPerformance(item, market);
                const tone = getMovementTone(performance.movementCents);
                const yesProbability = getYesProbability(market);
                const noProbability = getNoProbability(market);
                const finalProbability = getSideProbability(market, item.userSide);
                const resultLabel = getResultLabel(market);
                const marketUpdatedAt = market?.dataQuality?.lastUpdated ?? market?.updatedAt;
                const trackedPosition = market?.position ?? null;

                return (
                  <article className={`klo-position-card klo-manual-leg-card ${tone}`} key={`finalized-${item.ticker}`}>
                    <div className="klo-card-topline">
                      <div className="klo-card-title">{getDisplayTitle(item)}</div>
                      <div className="klo-card-action-cluster">
                        <span className={`klo-status-badge ${statusTone(getLifecycleLabel(market))}`}>
                          {getLifecycleLabel(market)}
                        </span>
                        <button
                          type="button"
                          className="klo-small-action"
                          onClick={() => void hideWatchedMarket(item.ticker)}
                        >
                          Hide
                        </button>
                      </div>
                    </div>

                    {!market?.resultKnown ? (
                      <div className="klo-simple-message">Finalized - result unknown</div>
                    ) : (
                      <div className="klo-probability-row">
                        <div className="klo-probability-box">
                          <span className="klo-prob-label">YES</span>
                          <strong>{formatKalshiPriceAsPercent(yesProbability)}</strong>
                        </div>
                        <div className="klo-probability-box">
                          <span className="klo-prob-label">NO</span>
                          <strong>{formatKalshiPriceAsPercent(noProbability)}</strong>
                        </div>
                      </div>
                    )}

                    <div className="klo-card-primary-grid">
                      <div className="klo-primary-row">
                        <span>Result</span>
                        <strong>{resultLabel}</strong>
                      </div>
                      <div className="klo-primary-row">
                        <span>Your side</span>
                        <strong>{item.userSide}</strong>
                      </div>
                      <div className="klo-primary-row">
                        <span>Entry</span>
                        <strong>{formatKalshiPriceAsPercent(item.entryPriceCents)}</strong>
                      </div>
                      <div className="klo-primary-row">
                        <span>Final</span>
                        <strong>{formatKalshiPriceAsPercent(finalProbability)}</strong>
                      </div>
                      <div className="klo-primary-row">
                        <span>Move</span>
                        <strong className={`klo-move-pill ${tone}`}>
                          {formatProbabilityMovement(performance.movementCents)} {formatMovementStatusLower(performance.movementStatus)}
                        </strong>
                      </div>
                      <div className="klo-primary-row">
                        <span>Approx P/L</span>
                        <strong>{market?.resultKnown ? formatDollars(performance.estimatedProfitLoss) : "--"}</strong>
                      </div>
                      <div className="klo-primary-row">
                        <span>Risked</span>
                        <strong>{formatDollars(performance.amountRisked)}</strong>
                      </div>
                      <div className="klo-primary-row">
                        <span>Last updated</span>
                        <strong>{formatUpdatedLabel(marketUpdatedAt)}</strong>
                      </div>
                    </div>

                    <details className="klo-details">
                      <summary>Details</summary>
                      <div className="klo-card-meta">
                        <span>Ticker</span>
                        <span>{item.ticker}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Event ticker</span>
                        <span>{item.eventTicker ?? market?.eventTicker ?? "--"}</span>
                      </div>
                      <div className="klo-card-meta">
                        <span>Winning side</span>
                        <span>{market?.winningSide ?? "--"}</span>
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
                        <span>Contracts</span>
                        <span>{item.contracts}</span>
                      </div>
                      {trackedPosition ? (
                        <div className="klo-card-meta">
                          <span>Position match</span>
                          <span>
                            {trackedPosition.side} · {trackedPosition.contracts} @ {formatPrice(trackedPosition.entryPriceCents)}
                          </span>
                        </div>
                      ) : null}
                      <div className="klo-card-meta">
                        <span>Market data</span>
                        <span>{market?.dataQuality?.marketDataStatus ?? "finalized"}</span>
                      </div>
                    </details>
                  </article>
                );
              })}
            </section>
          ) : null}
        </aside>
      )}
    </>
  );
}
