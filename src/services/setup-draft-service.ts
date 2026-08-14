import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getEffectiveWorkPatternPresetId,
  getWeekdayPatternPosition,
  getWorkPatternPreset,
  getWorkPatternPresetId,
  isValidCustomPatternSequence,
  type BaseWorkShiftId,
  type WorkPatternPresetId,
} from '../utils/work-pattern';
import { isValidDateKey } from '../utils/date';

export const SETUP_DRAFT_STORAGE_KEY = 'alarmpyo:setup-draft:v1';
export const SETUP_DRAFT_VERSION = 4 as const;

export type SetupStep = 1 | 2 | 3;

export const SETUP_WORK_TIME_FIELDS = [
  'dayStart',
  'dayEnd',
  'eveningStart',
  'eveningEnd',
  'nightStart',
  'nightEnd',
] as const;

export type SetupWorkTimeField = (typeof SETUP_WORK_TIME_FIELDS)[number];

export type SetupDraft = {
  version: typeof SETUP_DRAFT_VERSION;
  step: SetupStep;
  presetId: WorkPatternPresetId | null;
  sequence: BaseWorkShiftId[];
  position: number | null;
  referenceDate: string;
  dayStart: string;
  dayEnd: string;
  eveningStart: string;
  eveningEnd: string;
  nightStart: string;
  nightEnd: string;
  alarmsWanted: boolean;
  editedWorkTimeFields: SetupWorkTimeField[];
  confirmedSequenceSignature: string | null;
  confirmedWorkTimeSignature: string | null;
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

function isNullableShortString(value: unknown, maxLength: number): value is string | null {
  return value === null || isShortString(value, maxLength);
}

function parseEditedWorkTimeFields(value: unknown): SetupWorkTimeField[] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set<SetupWorkTimeField>(SETUP_WORK_TIME_FIELDS);
  if (!value.every((field) => typeof field === 'string' && known.has(field as SetupWorkTimeField))) {
    return null;
  }
  return [...new Set(value as SetupWorkTimeField[])];
}

function isPresetId(value: unknown): value is WorkPatternPresetId {
  return (
    value === 'weekday' ||
    value === 'two-team-two-shift' ||
    value === 'three-team-two-shift' ||
    value === 'three-team-three-shift' ||
    value === 'four-team-two-shift' ||
    value === 'four-team-three-shift' ||
    value === 'custom'
  );
}

function normalizeSetupDraftPattern(draft: SetupDraft): SetupDraft {
  const effectivePresetId = getEffectiveWorkPatternPresetId(
    draft.presetId,
    draft.sequence,
  );
  if (effectivePresetId !== 'weekday') return draft;
  const position = isValidDateKey(draft.referenceDate)
    ? getWeekdayPatternPosition(draft.referenceDate)
    : null;
  if (draft.presetId === 'weekday' && draft.position === position) return draft;
  return {
    ...draft,
    presetId: 'weekday',
    position,
  };
}

function parseCurrentSetupDraft(item: Record<string, unknown>): SetupDraft | null {
  const presetId = item.presetId;
  const position = item.position;
  const sequence = item.sequence;
  const editedWorkTimeFields = parseEditedWorkTimeFields(item.editedWorkTimeFields);
  if (
    (presetId !== null && !isPresetId(presetId)) ||
    !Array.isArray(sequence) ||
    !isValidCustomPatternSequence(sequence) ||
    (presetId === 'weekday' && getWorkPatternPresetId(sequence) !== 'weekday') ||
    (position !== null &&
      (!Number.isInteger(position) || Number(position) < 0 || Number(position) >= sequence.length)) ||
    !isSetupStep(item.step) ||
    !isShortString(item.referenceDate, 20) ||
    !isShortString(item.dayStart, 8) ||
    !isShortString(item.dayEnd, 8) ||
    !isShortString(item.eveningStart, 8) ||
    !isShortString(item.eveningEnd, 8) ||
    !isShortString(item.nightStart, 8) ||
    !isShortString(item.nightEnd, 8) ||
    typeof item.alarmsWanted !== 'boolean' ||
    editedWorkTimeFields === null ||
    !isNullableShortString(item.confirmedSequenceSignature, 512) ||
    !isNullableShortString(item.confirmedWorkTimeSignature, 512)
  ) {
    return null;
  }

  return normalizeSetupDraftPattern({
    version: SETUP_DRAFT_VERSION,
    step: item.step,
    presetId,
    sequence: [...sequence],
    position: position === null ? null : Number(position),
    referenceDate: item.referenceDate,
    dayStart: item.dayStart,
    dayEnd: item.dayEnd,
    eveningStart: item.eveningStart,
    eveningEnd: item.eveningEnd,
    nightStart: item.nightStart,
    nightEnd: item.nightEnd,
    alarmsWanted: item.alarmsWanted,
    editedWorkTimeFields,
    confirmedSequenceSignature: item.confirmedSequenceSignature,
    confirmedWorkTimeSignature: item.confirmedWorkTimeSignature,
  });
}

function parseVersionThreeSetupDraft(item: Record<string, unknown>): SetupDraft | null {
  if (item.version !== 3) return null;
  const compatible = parseCurrentSetupDraft({
    ...item,
    version: SETUP_DRAFT_VERSION,
    editedWorkTimeFields:
      item.presetId === null ? [] : [...SETUP_WORK_TIME_FIELDS],
    confirmedSequenceSignature: null,
    confirmedWorkTimeSignature: null,
  });
  return compatible;
}

function parseLegacySetupDraft(item: Record<string, unknown>): SetupDraft | null {
  const patternKind = item.patternKind;
  const position = item.position;
  if (
    (item.version !== 1 && item.version !== 2) ||
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

  const presetId =
    patternKind === 'weekday'
      ? 'weekday'
      : patternKind === 'rotation'
        ? 'three-team-two-shift'
        : null;
  const sequence = presetId
    ? [...getWorkPatternPreset(presetId).shiftTypeIds]
    : [...getWorkPatternPreset('three-team-two-shift').shiftTypeIds];
  return {
    version: SETUP_DRAFT_VERSION,
    // 이전 두 번째 화면에는 시간과 첫 근무일이 함께 있었으므로 마지막 단계에서 이어가요.
    step: item.step === 1 ? 1 : 3,
    presetId,
    sequence,
    position: position === null ? null : Number(position),
    referenceDate: item.referenceDate,
    dayStart: item.dayStart,
    dayEnd: item.dayEnd,
    eveningStart: '15:00',
    eveningEnd: '23:00',
    nightStart: item.nightStart,
    nightEnd: item.nightEnd,
    // v1은 Android에서 알람이 자동 선택됐으므로 사용자 선택으로 간주하지 않아요.
    alarmsWanted: item.version === 2 ? item.alarmsWanted : false,
    editedWorkTimeFields: [...SETUP_WORK_TIME_FIELDS],
    confirmedSequenceSignature: null,
    confirmedWorkTimeSignature: null,
  };
}

/** 자동 저장된 빈 1단계 초안은 이어하기 안내나 시간 제안을 막지 않아요. */
export function isMeaningfulSetupDraft(draft: SetupDraft): boolean {
  return draft.presetId !== null || draft.step !== 1 || draft.position !== null;
}

export function parseSetupDraft(value: unknown): SetupDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version === SETUP_DRAFT_VERSION) return parseCurrentSetupDraft(item);
  if (item.version === 3) return parseVersionThreeSetupDraft(item);
  return parseLegacySetupDraft(item);
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
  await storage.setItem(
    SETUP_DRAFT_STORAGE_KEY,
    JSON.stringify(normalizeSetupDraftPattern(draft)),
  );
}

export async function clearSetupDraft(
  storage: SetupDraftStorage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(SETUP_DRAFT_STORAGE_KEY);
}
