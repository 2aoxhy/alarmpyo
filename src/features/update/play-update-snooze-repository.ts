export const PLAY_UPDATE_PROMPT_STORAGE_KEY = 'alarmpyo:update-prompt:v1';
export const PLAY_UPDATE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1_000;

export type PlayUpdatePromptSnooze = {
  versionCode: number;
  snoozedUntil: number;
};

export type PlayUpdatePromptStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePlayUpdatePromptSnooze(
  raw: string | null,
): PlayUpdatePromptSnooze | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      !Number.isSafeInteger(value.versionCode) ||
      (value.versionCode as number) <= 0 ||
      typeof value.snoozedUntil !== 'number' ||
      !Number.isSafeInteger(value.snoozedUntil) ||
      (value.snoozedUntil as number) <= 0
    ) {
      return null;
    }
    return {
      versionCode: value.versionCode as number,
      snoozedUntil: value.snoozedUntil as number,
    };
  } catch {
    return null;
  }
}

export function createPlayUpdatePromptSnooze(
  versionCode: number,
  now = Date.now(),
): PlayUpdatePromptSnooze | null {
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) return null;
  return {
    versionCode,
    snoozedUntil: now + PLAY_UPDATE_SNOOZE_DURATION_MS,
  };
}

export function isPlayUpdatePromptSnoozed(
  snooze: PlayUpdatePromptSnooze | null,
  versionCode: number,
  now = Date.now(),
): boolean {
  return (
    snooze !== null &&
    snooze.versionCode === versionCode &&
    snooze.snoozedUntil > now
  );
}

export async function readPlayUpdatePromptSnooze(
  storage: PlayUpdatePromptStorage,
): Promise<PlayUpdatePromptSnooze | null> {
  try {
    return parsePlayUpdatePromptSnooze(
      await storage.getItem(PLAY_UPDATE_PROMPT_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export async function writePlayUpdatePromptSnooze(
  snooze: PlayUpdatePromptSnooze,
  storage: PlayUpdatePromptStorage,
): Promise<boolean> {
  try {
    await storage.setItem(
      PLAY_UPDATE_PROMPT_STORAGE_KEY,
      JSON.stringify(snooze),
    );
    return true;
  } catch {
    return false;
  }
}

export async function clearPlayUpdatePromptSnooze(
  storage: PlayUpdatePromptStorage,
): Promise<void> {
  await storage.removeItem(PLAY_UPDATE_PROMPT_STORAGE_KEY);
}
