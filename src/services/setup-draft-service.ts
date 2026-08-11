import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WorkPatternKind } from '@/utils/work-pattern';

export const SETUP_DRAFT_STORAGE_KEY = 'alarmpyo:setup-draft:v1';
export const SETUP_DRAFT_VERSION = 2 as const;

export type SetupStep = 1 | 2 | 3;

export type SetupDraft = {
  version: typeof SETUP_DRAFT_VERSION;
  step: SetupStep;
  patternKind: WorkPatternKind | null;
  position: number | null;
  referenceDate: string;
  dayStart: string;
  dayEnd: string;
  nightStart: string;
  nightEnd: string;
  alarmsWanted: boolean;
};

type SetupDraftStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
>;

function isSetupStep(value: unknown): value is SetupStep {
  return value === 1 || value === 2 || value === 3;
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

export function parseSetupDraft(value: unknown): SetupDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const patternKind = item.patternKind;
  const position = item.position;

  if (
    (item.version !== 1 && item.version !== SETUP_DRAFT_VERSION) ||
    !isSetupStep(item.step) ||
    (patternKind !== null && patternKind !== 'rotation' && patternKind !== 'weekday') ||
    (position !== null &&
      (!Number.isInteger(position) || Number(position) < 0 || Number(position) > 5)) ||
    !isShortString(item.referenceDate, 20) ||
    !isShortString(item.dayStart, 8) ||
    !isShortString(item.dayEnd, 8) ||
    !isShortString(item.nightStart, 8) ||
    !isShortString(item.nightEnd, 8) ||
    typeof item.alarmsWanted !== 'boolean'
  ) {
    return null;
  }

  return {
    version: SETUP_DRAFT_VERSION,
    step: item.step,
    patternKind,
    position: position === null ? null : Number(position),
    referenceDate: item.referenceDate,
    dayStart: item.dayStart,
    dayEnd: item.dayEnd,
    nightStart: item.nightStart,
    nightEnd: item.nightEnd,
    // v1 화면은 Android에서 알람을 기본으로 켰기 때문에 true여도
    // 사용자가 직접 선택했다고 볼 수 없어요. 새 명시적 선택 화면에서 다시 확인해요.
    alarmsWanted:
      item.version === SETUP_DRAFT_VERSION ? item.alarmsWanted : false,
  };
}

export async function readSetupDraft(
  storage: SetupDraftStorage = AsyncStorage,
): Promise<SetupDraft | null> {
  try {
    const raw = await storage.getItem(SETUP_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return parseSetupDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeSetupDraft(
  draft: SetupDraft,
  storage: SetupDraftStorage = AsyncStorage,
): Promise<void> {
  await storage.setItem(SETUP_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export async function clearSetupDraft(
  storage: SetupDraftStorage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(SETUP_DRAFT_STORAGE_KEY);
}
