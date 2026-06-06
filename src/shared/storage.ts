import {
  KalshiComboTracker,
  KalshiWatchlistItem,
  ManualParlay,
  OverlayDataMode,
  ResearchPaperTrade,
  ResearchSettings
} from "./types";
import { buildApiUrl } from "../services/apiBase";
import { getDefaultResearchSettings } from "./research";

export const OVERLAY_UI_KEY = "kalshi-live-overlay-ui";
export const APP_SETTINGS_KEY = "kalshi-live-overlay-settings";
export const MANUAL_PARLAY_KEY = "kalshi-live-overlay-manual-parlay";
export const KALSHI_WATCHLIST_KEY = "kalshi-live-overlay-watchlist";
export const KALSHI_COMBO_TRACKERS_KEY = "kalshi-live-overlay-combo-trackers";
export const RESEARCH_SETTINGS_KEY = "kalshi-live-overlay-research-settings";
export const RESEARCH_PAPER_TRADES_KEY = "kalshi-live-overlay-paper-trades";
const PARLAY_API_PATH = "/parlays";
const OVERLAY_UI_VERSION = 4;

export interface OverlayUiState {
  version: number;
  minimized: boolean;
  layoutMode: "top-ticker";
  viewMode: "ticker" | "cards";
  closed: boolean;
}

export interface AppSettings {
  selectedGameId: string;
  demoMode: boolean;
  dataMode: OverlayDataMode;
}

const DEFAULT_OVERLAY_UI_STATE: OverlayUiState = {
  version: OVERLAY_UI_VERSION,
  minimized: false,
  layoutMode: "top-ticker",
  viewMode: "ticker",
  closed: false
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  selectedGameId: "knicks-cavs-demo",
  demoMode: true,
  dataMode: "markets"
};

const DEFAULT_KALSHI_WATCHLIST: KalshiWatchlistItem[] = [];
const DEFAULT_KALSHI_COMBO_TRACKERS: KalshiComboTracker[] = [];
const DEFAULT_RESEARCH_PAPER_TRADES: ResearchPaperTrade[] = [];

const DEFAULT_MANUAL_PARLAY: ManualParlay = {
  id: "manual-parlay-default",
  parlayName: "My Manual Parlay",
  amountWagered: 25,
  estimatedPayout: 112,
  originalOdds: 350,
  currentOdds: 410,
  oddsFormat: "american",
  legs: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.storage?.local?.get) &&
    Boolean(chrome.storage?.local?.set)
  );
}

async function safeStorageGet<T>(key: string): Promise<T | undefined> {
  if (!hasChromeStorage()) {
    const rawValue = globalThis.localStorage?.getItem(key);

    if (!rawValue) {
      return undefined;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch {
      return undefined;
    }
  }

  try {
    const stored = await chrome.storage.local.get(key);
    return stored[key] as T | undefined;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return undefined;
    }

    throw error;
  }
}

async function safeStorageSet(value: Record<string, unknown>): Promise<void> {
  if (!hasChromeStorage()) {
    for (const [key, nextValue] of Object.entries(value)) {
      globalThis.localStorage?.setItem(key, JSON.stringify(nextValue));
    }

    return;
  }

  try {
    await chrome.storage.local.set(value);
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return;
    }

    throw error;
  }
}

async function getLocalManualParlay(): Promise<ManualParlay> {
  const existing = await safeStorageGet<ManualParlay>(MANUAL_PARLAY_KEY);

  if (existing) {
    return {
      ...DEFAULT_MANUAL_PARLAY,
      ...existing,
      legs: existing.legs ?? DEFAULT_MANUAL_PARLAY.legs
    };
  }

  await safeStorageSet({ [MANUAL_PARLAY_KEY]: DEFAULT_MANUAL_PARLAY });
  return DEFAULT_MANUAL_PARLAY;
}

async function saveLocalManualParlay(parlay: ManualParlay): Promise<ManualParlay> {
  const nextParlay: ManualParlay = {
    ...DEFAULT_MANUAL_PARLAY,
    ...parlay,
    legs: parlay.legs ?? DEFAULT_MANUAL_PARLAY.legs,
    createdAt: parlay.createdAt ?? DEFAULT_MANUAL_PARLAY.createdAt,
    updatedAt: new Date().toISOString()
  };

  await safeStorageSet({
    [MANUAL_PARLAY_KEY]: nextParlay
  });

  return nextParlay;
}

async function listBackendParlays(): Promise<ManualParlay[]> {
  const response = await fetch(buildApiUrl(PARLAY_API_PATH));

  if (!response.ok) {
    throw new Error("Backend parlay list unavailable");
  }

  return (await response.json()) as ManualParlay[];
}

async function createBackendParlay(parlay: ManualParlay): Promise<ManualParlay> {
  const response = await fetch(buildApiUrl(PARLAY_API_PATH), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parlay)
  });

  if (!response.ok) {
    throw new Error("Failed to create backend parlay");
  }

  return (await response.json()) as ManualParlay;
}

async function updateBackendParlay(parlay: ManualParlay): Promise<ManualParlay> {
  const response = await fetch(buildApiUrl(`${PARLAY_API_PATH}/${encodeURIComponent(parlay.id)}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parlay)
  });

  if (response.status === 404) {
    return createBackendParlay(parlay);
  }

  if (!response.ok) {
    throw new Error("Failed to update backend parlay");
  }

  return (await response.json()) as ManualParlay;
}

export async function getOverlayUiState(): Promise<OverlayUiState> {
  const existing = await safeStorageGet<OverlayUiState>(OVERLAY_UI_KEY);

  if (existing && existing.version === OVERLAY_UI_VERSION) {
    return {
      ...DEFAULT_OVERLAY_UI_STATE,
      ...existing
    };
  }

  await safeStorageSet({ [OVERLAY_UI_KEY]: DEFAULT_OVERLAY_UI_STATE });
  return DEFAULT_OVERLAY_UI_STATE;
}

export async function saveOverlayUiState(state: OverlayUiState): Promise<void> {
  await safeStorageSet({ [OVERLAY_UI_KEY]: state });
}

export async function getAppSettings(): Promise<AppSettings> {
  const existing = await safeStorageGet<AppSettings>(APP_SETTINGS_KEY);

  if (existing) {
    return {
      ...DEFAULT_APP_SETTINGS,
      ...existing
    };
  }

  await safeStorageSet({ [APP_SETTINGS_KEY]: DEFAULT_APP_SETTINGS });
  return DEFAULT_APP_SETTINGS;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await safeStorageSet({ [APP_SETTINGS_KEY]: settings });
}

export async function getKalshiWatchlist(): Promise<KalshiWatchlistItem[]> {
  const existing = await safeStorageGet<KalshiWatchlistItem[]>(KALSHI_WATCHLIST_KEY);

  if (Array.isArray(existing)) {
    return existing
      .filter((item) => item && typeof item.ticker === "string" && typeof item.title === "string")
      .map((item) => ({
        id:
          typeof item.id === "string" && item.id
            ? item.id
            : `watch-${item.ticker}-${
                item.createdAt ??
                (item as KalshiWatchlistItem & { addedAt?: string }).addedAt ??
                new Date().toISOString()
              }`,
        ticker: item.ticker,
        eventTicker:
          typeof item.eventTicker === "string" && item.eventTicker ? item.eventTicker : null,
        title: item.title,
        displayTitle:
          typeof item.displayTitle === "string" && item.displayTitle ? item.displayTitle : null,
        sport: typeof item.sport === "string" && item.sport ? item.sport : null,
        competition:
          typeof item.competition === "string" && item.competition ? item.competition : null,
        scope: typeof item.scope === "string" && item.scope ? item.scope : null,
        userSide: item.userSide === "NO" ? "NO" : "YES",
        entryPriceCents: typeof item.entryPriceCents === "number" ? item.entryPriceCents : 50,
        contracts:
          typeof item.contracts === "number" && Number.isFinite(item.contracts)
            ? Math.max(0, item.contracts)
            : 0,
        amountRisked:
          typeof item.amountRisked === "number" && Number.isFinite(item.amountRisked)
            ? Math.max(0, item.amountRisked)
            : typeof item.contracts === "number" && Number.isFinite(item.contracts)
              ? Math.max(0, (item.contracts * item.entryPriceCents) / 100)
              : 0,
        notes: typeof item.notes === "string" ? item.notes : "",
        hidden: Boolean(item.hidden),
        hiddenAt: typeof item.hiddenAt === "string" ? item.hiddenAt : null,
        removedAt: typeof item.removedAt === "string" ? item.removedAt : null,
        archived: Boolean(item.archived),
        createdAt:
          typeof item.createdAt === "string"
            ? item.createdAt
            : typeof (item as KalshiWatchlistItem & { addedAt?: string }).addedAt === "string"
              ? (item as KalshiWatchlistItem & { addedAt?: string }).addedAt!
              : new Date().toISOString(),
        updatedAt:
          typeof item.updatedAt === "string"
            ? item.updatedAt
            : typeof item.createdAt === "string"
              ? item.createdAt
              : typeof (item as KalshiWatchlistItem & { addedAt?: string }).addedAt === "string"
                ? (item as KalshiWatchlistItem & { addedAt?: string }).addedAt!
                : new Date().toISOString()
      }));
  }

  await safeStorageSet({ [KALSHI_WATCHLIST_KEY]: DEFAULT_KALSHI_WATCHLIST });
  return DEFAULT_KALSHI_WATCHLIST;
}

export async function saveKalshiWatchlist(watchlist: KalshiWatchlistItem[]): Promise<void> {
  await safeStorageSet({
    [KALSHI_WATCHLIST_KEY]: watchlist
  });
}

export async function getKalshiComboTrackers(): Promise<KalshiComboTracker[]> {
  const existing = await safeStorageGet<KalshiComboTracker[]>(KALSHI_COMBO_TRACKERS_KEY);

  if (Array.isArray(existing)) {
    return existing
      .filter((combo) => combo && typeof combo.id === "string" && typeof combo.name === "string")
      .map((combo) => {
        const oldLegRisk = Array.isArray(combo.legs)
          ? combo.legs.reduce(
              (sum, leg) =>
                sum +
                (typeof leg.amountRisked === "number" && Number.isFinite(leg.amountRisked)
                  ? Math.max(0, leg.amountRisked)
                  : 0),
              0
            )
          : 0;

        return {
          id: combo.id,
          name: combo.name.trim() || "Untitled combo",
          amountRisked:
            typeof combo.amountRisked === "number" && Number.isFinite(combo.amountRisked)
              ? Math.max(0, combo.amountRisked)
              : oldLegRisk,
          legs: Array.isArray(combo.legs)
            ? combo.legs
                .filter((leg) => leg && typeof leg.ticker === "string" && typeof leg.title === "string")
                .map((leg) => ({
                id: typeof leg.id === "string" && leg.id ? leg.id : `leg-${leg.ticker}-${Date.now()}`,
                ticker: leg.ticker,
                eventTicker:
                  typeof leg.eventTicker === "string" && leg.eventTicker ? leg.eventTicker : null,
                title: leg.title,
                displayTitle:
                  typeof leg.displayTitle === "string" && leg.displayTitle ? leg.displayTitle : null,
                subtitle: typeof leg.subtitle === "string" && leg.subtitle ? leg.subtitle : null,
                sport: typeof leg.sport === "string" && leg.sport ? leg.sport : null,
                competition:
                  typeof leg.competition === "string" && leg.competition ? leg.competition : null,
                status: typeof leg.status === "string" && leg.status ? leg.status : null,
                lifecycleStatus: leg.lifecycleStatus,
                isResolved: Boolean(leg.isResolved),
                closeTime: typeof leg.closeTime === "string" && leg.closeTime ? leg.closeTime : null,
                userSide: leg.userSide === "NO" ? "NO" : "YES",
                entryPriceCents:
                  typeof leg.entryPriceCents === "number" && Number.isFinite(leg.entryPriceCents)
                    ? Math.max(0, Math.min(100, leg.entryPriceCents))
                    : 50,
                notes: typeof leg.notes === "string" ? leg.notes : "",
                addedAt: typeof leg.addedAt === "string" ? leg.addedAt : new Date().toISOString()
              }))
            : [],
          archived: Boolean(combo.archived),
          createdAt: typeof combo.createdAt === "string" ? combo.createdAt : new Date().toISOString(),
          updatedAt: typeof combo.updatedAt === "string" ? combo.updatedAt : new Date().toISOString()
        };
      });
  }

  await safeStorageSet({ [KALSHI_COMBO_TRACKERS_KEY]: DEFAULT_KALSHI_COMBO_TRACKERS });
  return DEFAULT_KALSHI_COMBO_TRACKERS;
}

export async function saveKalshiComboTrackers(combos: KalshiComboTracker[]): Promise<void> {
  await safeStorageSet({
    [KALSHI_COMBO_TRACKERS_KEY]: combos
  });
}

export async function getResearchSettings(): Promise<ResearchSettings> {
  const defaults = getDefaultResearchSettings();
  const existing = await safeStorageGet<ResearchSettings>(RESEARCH_SETTINGS_KEY);

  if (existing) {
    return {
      ...defaults,
      ...existing,
      enableRealTrading: false,
      maxPaperTradeDollars:
        typeof existing.maxPaperTradeDollars === "number" && Number.isFinite(existing.maxPaperTradeDollars)
          ? Math.max(0, existing.maxPaperTradeDollars)
          : defaults.maxPaperTradeDollars,
      maxDailyRiskDollars:
        typeof existing.maxDailyRiskDollars === "number" && Number.isFinite(existing.maxDailyRiskDollars)
          ? Math.max(0, existing.maxDailyRiskDollars)
          : defaults.maxDailyRiskDollars,
      minimumEdgePercent:
        typeof existing.minimumEdgePercent === "number" && Number.isFinite(existing.minimumEdgePercent)
          ? Math.max(0, existing.minimumEdgePercent)
          : defaults.minimumEdgePercent,
      feeSlippageBufferPercent:
        typeof existing.feeSlippageBufferPercent === "number" && Number.isFinite(existing.feeSlippageBufferPercent)
          ? Math.max(0, existing.feeSlippageBufferPercent)
          : defaults.feeSlippageBufferPercent,
      manualModelProbability:
        typeof existing.manualModelProbability === "number" && Number.isFinite(existing.manualModelProbability)
          ? Math.max(1, Math.min(99, existing.manualModelProbability))
          : defaults.manualModelProbability
    };
  }

  await safeStorageSet({ [RESEARCH_SETTINGS_KEY]: defaults });
  return defaults;
}

export async function saveResearchSettings(settings: ResearchSettings): Promise<void> {
  await safeStorageSet({
    [RESEARCH_SETTINGS_KEY]: {
      ...settings,
      enableRealTrading: false
    }
  });
}

export async function getResearchPaperTrades(): Promise<ResearchPaperTrade[]> {
  const existing = await safeStorageGet<ResearchPaperTrade[]>(RESEARCH_PAPER_TRADES_KEY);

  if (Array.isArray(existing)) {
    return existing
      .filter((trade) => trade && typeof trade.id === "string" && typeof trade.marketTicker === "string")
      .map((trade) => {
        const entryPriceCents =
          typeof trade.entryPriceCents === "number" && Number.isFinite(trade.entryPriceCents)
            ? Math.max(0, Math.min(100, trade.entryPriceCents))
            : 50;
        const suggestedRiskDollars =
          typeof trade.suggestedRiskDollars === "number" && Number.isFinite(trade.suggestedRiskDollars)
            ? Math.max(0, trade.suggestedRiskDollars)
            : 0;
        const riskInputDollars =
          typeof trade.riskInputDollars === "number" && Number.isFinite(trade.riskInputDollars)
            ? Math.max(0, trade.riskInputDollars)
            : suggestedRiskDollars;
        const contracts =
          typeof trade.contracts === "number" && Number.isFinite(trade.contracts)
            ? Math.max(0, Math.floor(trade.contracts))
            : entryPriceCents > 0
              ? Math.floor(riskInputDollars / (entryPriceCents / 100))
              : 0;
        const actualCostDollars =
          typeof trade.actualCostDollars === "number" && Number.isFinite(trade.actualCostDollars)
            ? Math.max(0, trade.actualCostDollars)
            : Math.round(contracts * (entryPriceCents / 100) * 100) / 100;
        const exitPriceCents =
          typeof trade.exitPriceCents === "number" && Number.isFinite(trade.exitPriceCents)
            ? Math.max(0, Math.min(100, trade.exitPriceCents))
            : typeof trade.exitValueCents === "number" && Number.isFinite(trade.exitValueCents)
              ? Math.max(0, Math.min(100, trade.exitValueCents))
              : null;

        return {
          id: trade.id,
          timestamp: typeof trade.timestamp === "string" ? trade.timestamp : new Date().toISOString(),
          marketTicker: trade.marketTicker,
          marketTitle: typeof trade.marketTitle === "string" ? trade.marketTitle : trade.marketTicker,
          side: trade.side === "NO" ? "NO" : "YES",
          entryPriceCents,
          modelProbabilityPercent:
            typeof trade.modelProbabilityPercent === "number" && Number.isFinite(trade.modelProbabilityPercent)
              ? Math.max(1, Math.min(99, trade.modelProbabilityPercent))
              : 50,
          winProbabilityPercent:
            typeof trade.winProbabilityPercent === "number" && Number.isFinite(trade.winProbabilityPercent)
              ? Math.max(1, Math.min(99, trade.winProbabilityPercent))
              : null,
          edgePercent:
            typeof trade.edgePercent === "number" && Number.isFinite(trade.edgePercent)
              ? trade.edgePercent
              : 0,
          netEdgePercent:
            typeof trade.netEdgePercent === "number" && Number.isFinite(trade.netEdgePercent)
              ? trade.netEdgePercent
              : null,
          suggestedRiskDollars,
          riskInputDollars,
          contracts,
          actualCostDollars,
          maxProfitDollars:
            typeof trade.maxProfitDollars === "number" && Number.isFinite(trade.maxProfitDollars)
              ? trade.maxProfitDollars
              : Math.round((contracts - actualCostDollars) * 100) / 100,
          maxLossDollars:
            typeof trade.maxLossDollars === "number" && Number.isFinite(trade.maxLossDollars)
              ? trade.maxLossDollars
              : actualCostDollars,
          expectedValueDollars:
            typeof trade.expectedValueDollars === "number" && Number.isFinite(trade.expectedValueDollars)
              ? trade.expectedValueDollars
              : null,
          expectedRoiPercent:
            typeof trade.expectedRoiPercent === "number" && Number.isFinite(trade.expectedRoiPercent)
              ? trade.expectedRoiPercent
              : null,
          status: trade.status === "settled" || trade.status === "exited" ? trade.status : "open",
          marketCategory: typeof trade.marketCategory === "string" ? trade.marketCategory : "other",
          modelReason: typeof trade.modelReason === "string" ? trade.modelReason : null,
          positiveSignal: typeof trade.positiveSignal === "string" ? trade.positiveSignal : null,
          negativeSignal: typeof trade.negativeSignal === "string" ? trade.negativeSignal : null,
          source:
            trade.source === "manual" || trade.source === "heuristic" || trade.source === "arb_scanner"
              ? trade.source
              : "manual",
          exitValueCents: exitPriceCents,
          exitPriceCents,
          exitValueDollars:
            typeof trade.exitValueDollars === "number" && Number.isFinite(trade.exitValueDollars)
              ? trade.exitValueDollars
              : null,
          profitLossDollars:
            typeof trade.profitLossDollars === "number" && Number.isFinite(trade.profitLossDollars)
              ? trade.profitLossDollars
              : null,
          realizedPnlDollars:
            typeof trade.realizedPnlDollars === "number" && Number.isFinite(trade.realizedPnlDollars)
              ? trade.realizedPnlDollars
              : typeof trade.profitLossDollars === "number" && Number.isFinite(trade.profitLossDollars)
                ? trade.profitLossDollars
                : null,
          settlementResult:
            trade.settlementResult === "WIN" ||
            trade.settlementResult === "LOSS" ||
            trade.settlementResult === "EXIT"
              ? trade.settlementResult
              : null,
          modelVersion: typeof trade.modelVersion === "string" ? trade.modelVersion : null,
          settledAt: typeof trade.settledAt === "string" ? trade.settledAt : null
        };
      });
  }

  await safeStorageSet({ [RESEARCH_PAPER_TRADES_KEY]: DEFAULT_RESEARCH_PAPER_TRADES });
  return DEFAULT_RESEARCH_PAPER_TRADES;
}

export async function saveResearchPaperTrades(trades: ResearchPaperTrade[]): Promise<void> {
  await safeStorageSet({
    [RESEARCH_PAPER_TRADES_KEY]: trades
  });
}

export async function getManualParlay(): Promise<ManualParlay> {
  const localParlay = await getLocalManualParlay();

  try {
    const backendParlays = await listBackendParlays();

    if (backendParlays.length > 0) {
      const backendParlay: ManualParlay = {
        ...DEFAULT_MANUAL_PARLAY,
        ...backendParlays[0],
        legs: backendParlays[0].legs ?? DEFAULT_MANUAL_PARLAY.legs
      };

      await saveLocalManualParlay(backendParlay);
      return backendParlay;
    }

    if (localParlay.id !== DEFAULT_MANUAL_PARLAY.id || localParlay.legs.length > 0) {
      const created = await createBackendParlay(localParlay);
      await saveLocalManualParlay(created);
      return created;
    }
  } catch {
    return localParlay;
  }

  return localParlay;
}

export async function saveManualParlay(parlay: ManualParlay): Promise<void> {
  const localParlay = await saveLocalManualParlay(parlay);

  try {
    const backendParlay = await updateBackendParlay(localParlay);
    await saveLocalManualParlay(backendParlay);
  } catch {
    return;
  }
}
