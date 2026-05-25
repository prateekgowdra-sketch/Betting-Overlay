import { ManualParlay, OverlayDataMode } from "./types";

export const OVERLAY_UI_KEY = "kalshi-live-overlay-ui";
export const APP_SETTINGS_KEY = "kalshi-live-overlay-settings";
export const MANUAL_PARLAY_KEY = "kalshi-live-overlay-manual-parlay";
const PARLAY_API_URL = "http://localhost:3001/api/parlays";
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

async function safeStorageGet<T>(key: string): Promise<T | undefined> {
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
  const response = await fetch(PARLAY_API_URL);

  if (!response.ok) {
    throw new Error("Backend parlay list unavailable");
  }

  return (await response.json()) as ManualParlay[];
}

async function createBackendParlay(parlay: ManualParlay): Promise<ManualParlay> {
  const response = await fetch(PARLAY_API_URL, {
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
  const response = await fetch(`${PARLAY_API_URL}/${encodeURIComponent(parlay.id)}`, {
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
