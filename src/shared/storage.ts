import { ManualParlay, OverlayDataMode } from "./types";

export const OVERLAY_UI_KEY = "kalshi-live-overlay-ui";
export const APP_SETTINGS_KEY = "kalshi-live-overlay-settings";
export const MANUAL_PARLAY_KEY = "kalshi-live-overlay-manual-parlay";
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
  dataMode: "demo"
};

const DEFAULT_MANUAL_PARLAY: ManualParlay = {
  id: "manual-parlay-default",
  parlayName: "My Manual Parlay",
  amountWagered: 25,
  estimatedPayout: 112,
  originalOdds: 350,
  currentOdds: 410,
  oddsFormat: "american",
  legs: [],
  updatedAt: new Date().toISOString()
};

export async function getOverlayUiState(): Promise<OverlayUiState> {
  const stored = await chrome.storage.local.get(OVERLAY_UI_KEY);
  const existing = stored[OVERLAY_UI_KEY] as OverlayUiState | undefined;

  if (existing && existing.version === OVERLAY_UI_VERSION) {
    return {
      ...DEFAULT_OVERLAY_UI_STATE,
      ...existing
    };
  }

  await chrome.storage.local.set({ [OVERLAY_UI_KEY]: DEFAULT_OVERLAY_UI_STATE });
  return DEFAULT_OVERLAY_UI_STATE;
}

export async function saveOverlayUiState(state: OverlayUiState): Promise<void> {
  await chrome.storage.local.set({ [OVERLAY_UI_KEY]: state });
}

export async function getAppSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get(APP_SETTINGS_KEY);
  const existing = stored[APP_SETTINGS_KEY] as AppSettings | undefined;

  if (existing) {
    return {
      ...DEFAULT_APP_SETTINGS,
      ...existing
    };
  }

  await chrome.storage.local.set({ [APP_SETTINGS_KEY]: DEFAULT_APP_SETTINGS });
  return DEFAULT_APP_SETTINGS;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [APP_SETTINGS_KEY]: settings });
}

export async function getManualParlay(): Promise<ManualParlay> {
  const stored = await chrome.storage.local.get(MANUAL_PARLAY_KEY);
  const existing = stored[MANUAL_PARLAY_KEY] as ManualParlay | undefined;

  if (existing) {
    return {
      ...DEFAULT_MANUAL_PARLAY,
      ...existing,
      legs: existing.legs ?? DEFAULT_MANUAL_PARLAY.legs
    };
  }

  await chrome.storage.local.set({ [MANUAL_PARLAY_KEY]: DEFAULT_MANUAL_PARLAY });
  return DEFAULT_MANUAL_PARLAY;
}

export async function saveManualParlay(parlay: ManualParlay): Promise<void> {
  await chrome.storage.local.set({
    [MANUAL_PARLAY_KEY]: {
      ...parlay,
      updatedAt: new Date().toISOString()
    }
  });
}
