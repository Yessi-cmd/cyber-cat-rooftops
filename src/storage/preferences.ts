const STORAGE_KEY = "cyber-cat-rooftops:save";
const SCHEMA_VERSION = 2;

export interface SaveData {
  version: typeof SCHEMA_VERSION;
  bestScore: number;
  muted: boolean;
}

const DEFAULT_SAVE: SaveData = { version: SCHEMA_VERSION, bestScore: 0, muted: false };

function validBestScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function decodeSave(raw: string | null): SaveData {
  if (raw === null) {
    return { ...DEFAULT_SAVE };
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("version" in value)) {
      return { ...DEFAULT_SAVE };
    }

    if (
      value.version === SCHEMA_VERSION &&
      "bestScore" in value &&
      validBestScore(value.bestScore) &&
      "muted" in value &&
      typeof value.muted === "boolean"
    ) {
      return {
        version: SCHEMA_VERSION,
        bestScore: Math.floor(value.bestScore),
        muted: value.muted,
      };
    }

    if (value.version === 1 && "bestScore" in value && validBestScore(value.bestScore)) {
      return { version: SCHEMA_VERSION, bestScore: Math.floor(value.bestScore), muted: false };
    }
  } catch {
    return { ...DEFAULT_SAVE };
  }

  return { ...DEFAULT_SAVE };
}

export function loadSave(): SaveData {
  try {
    return decodeSave(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function saveBestScore(bestScore: number): void {
  if (!validBestScore(bestScore)) {
    return;
  }

  saveData({ ...loadSave(), bestScore: Math.floor(bestScore) });
}

export function saveMuted(muted: boolean): void {
  saveData({ ...loadSave(), muted });
}

function saveData(save: SaveData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be unavailable in private browsing or restricted frames.
  }
}
