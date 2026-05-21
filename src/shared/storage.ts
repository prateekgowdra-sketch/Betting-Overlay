export const OVERLAY_UI_KEY = "kalshi-live-overlay-ui";
export const APP_SETTINGS_KEY = "kalshi-live-overlay-settings";

export interface OverlayUiState {
  minimized: boolean;
  closed: boolean;
  position: {
    x: number;
    y: number;
  };
}

export interface AppSettings {
  selectedGameId: string;
  demoMode: boolean;
}

const DEFAULT_OVERLAY_UI_STATE: OverlayUiState = {
  minimized: false,
  closed: false,
  position: {
    x: 18,
    y: 18
  }
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  selectedGameId: "knicks-cavs-demo",
  demoMode: true
};

export async function getOverlayUiState(): Promise<OverlayUiState> {
  const stored = await chrome.storage.local.get(OVERLAY_UI_KEY);
  const existing = stored[OVERLAY_UI_KEY] as OverlayUiState | undefined;

  if (existing) {
    return {
      ...DEFAULT_OVERLAY_UI_STATE,
      ...existing,
      position: {
        ...DEFAULT_OVERLAY_UI_STATE.position,
        ...existing.position
      }
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
