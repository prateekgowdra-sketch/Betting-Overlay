import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "backend", "data");
const PARLAYS_PATH = join(DATA_DIR, "manualParlays.json");

function ensureStorageFile() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(PARLAYS_PATH)) {
    writeFileSync(PARLAYS_PATH, "[]\n", "utf8");
  }
}

function readParlays() {
  ensureStorageFile();

  try {
    const raw = readFileSync(PARLAYS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeParlays(parlays) {
  ensureStorageFile();
  writeFileSync(PARLAYS_PATH, `${JSON.stringify(parlays, null, 2)}\n`, "utf8");
}

function normalizeParlay(parlay) {
  const now = new Date().toISOString();

  return {
    id: parlay.id,
    parlayName: parlay.parlayName,
    amountWagered: parlay.amountWagered,
    estimatedPayout: parlay.estimatedPayout,
    originalOdds: parlay.originalOdds,
    currentOdds: parlay.currentOdds,
    oddsFormat: parlay.oddsFormat ?? "american",
    legs: Array.isArray(parlay.legs) ? parlay.legs : [],
    createdAt: parlay.createdAt ?? now,
    updatedAt: now
  };
}

class ManualParlayStorageService {
  listParlays() {
    return readParlays();
  }

  createParlay(parlay) {
    const parlays = readParlays();
    const normalized = normalizeParlay(parlay);
    parlays.push(normalized);
    writeParlays(parlays);
    return normalized;
  }

  updateParlay(id, parlay) {
    const parlays = readParlays();
    const existingIndex = parlays.findIndex((item) => item.id === id);

    if (existingIndex === -1) {
      return null;
    }

    const normalized = normalizeParlay({
      ...parlays[existingIndex],
      ...parlay,
      id
    });

    parlays[existingIndex] = normalized;
    writeParlays(parlays);
    return normalized;
  }

  deleteParlay(id) {
    const parlays = readParlays();
    const existingIndex = parlays.findIndex((item) => item.id === id);

    if (existingIndex === -1) {
      return false;
    }

    parlays.splice(existingIndex, 1);
    writeParlays(parlays);
    return true;
  }
}

export const manualParlayStorageService = new ManualParlayStorageService();
