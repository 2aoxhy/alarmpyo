import type { QuickSetupDraftV1 } from './quick-setup-model';

export const QUICK_SETUP_DRAFT_KEY = 'alarmpyo:quick-setup-draft:v1';

export type QuickSetupDraftStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

const SOURCES = ['received-file', 'direct'] as const;
const STEPS = ['schedule-source', 'schedule-anchor', 'alarm-readiness'] as const;
const PRESETS = [
  'weekday',
  'two-team-two-shift',
  'three-team-two-shift',
  'three-team-three-shift',
  'four-team-two-shift',
  'four-team-three-shift',
  'custom',
] as const;
const SHIFT_IDS = ['day', 'evening', 'night', 'off'] as const;

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isValidDraftDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function parseQuickSetupDraft(value: unknown): QuickSetupDraftV1 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const draft = value as Partial<QuickSetupDraftV1>;
  if (
    draft.version !== 1 ||
    (draft.source !== null && !includes(SOURCES, draft.source)) ||
    !includes(STEPS, draft.step) ||
    !includes(PRESETS, draft.presetId) ||
    !Array.isArray(draft.sequence) ||
    draft.sequence.length < 1 ||
    draft.sequence.length > 42 ||
    draft.sequence.some((id) => !includes(SHIFT_IDS, id)) ||
    typeof draft.referenceDate !== 'string' ||
    !isValidDraftDateKey(draft.referenceDate) ||
    !(
      draft.position === null ||
      (Number.isInteger(draft.position) &&
        (draft.position as number) >= 0 &&
        (draft.position as number) < draft.sequence.length)
    ) ||
    !(
      draft.receivedPreview === null ||
      (typeof draft.receivedPreview === 'object' && draft.receivedPreview !== null)
    )
  ) {
    return null;
  }
  if (draft.source === 'received-file' && draft.receivedPreview === null) return null;
  return draft as QuickSetupDraftV1;
}

export async function readQuickSetupDraft(
  storage: QuickSetupDraftStorage,
): Promise<QuickSetupDraftV1 | null> {
  try {
    const raw = await storage.getItem(QUICK_SETUP_DRAFT_KEY);
    if (!raw) return null;
    return parseQuickSetupDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeQuickSetupDraft(
  draft: QuickSetupDraftV1,
  storage: QuickSetupDraftStorage,
): Promise<void> {
  await storage.setItem(QUICK_SETUP_DRAFT_KEY, JSON.stringify(draft));
}

export async function clearQuickSetupDraft(
  storage: QuickSetupDraftStorage,
): Promise<void> {
  await storage.removeItem(QUICK_SETUP_DRAFT_KEY);
}

export async function hasQuickSetupDraft(
  storage: QuickSetupDraftStorage,
): Promise<boolean> {
  return (await readQuickSetupDraft(storage)) !== null;
}
