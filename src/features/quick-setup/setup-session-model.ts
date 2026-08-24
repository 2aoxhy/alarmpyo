import type { AppData, ShiftType } from '../../models/app-data';
import type { SetupDraft } from '../../services/setup-draft-service';
import { formatTimeInput } from '../../utils/shift-time';
import {
  getPatternPositionForDate,
  getWeekdayPatternPosition,
  getWorkPatternPresetId,
  isValidCustomPatternSequence,
  type BaseWorkShiftId,
  type WorkPatternPresetId,
} from '../../utils/work-pattern';

import type { QuickSetupDraftV1 } from './quick-setup-model';

export type SetupSessionMode = 'initial' | 'reconfigure';
export type SetupSessionSource =
  | 'current'
  | 'received-file'
  | 'recommended'
  | 'custom';
export type SetupSessionStep =
  | 'schedule-source'
  | 'schedule-anchor'
  | 'alarm-readiness';
export type SetupSessionAlarmChoice = 'prepare' | 'schedule-only' | null;

export type SetupSessionTimeValues = Record<
  Exclude<BaseWorkShiftId, 'off'>,
  { end: string; start: string }
>;

export type SetupSessionDraftV2 = {
  version: 2;
  mode: SetupSessionMode;
  source: SetupSessionSource | null;
  step: SetupSessionStep;
  presetId: WorkPatternPresetId | null;
  sequence: BaseWorkShiftId[];
  referenceDate: string;
  position: number | null;
  times: SetupSessionTimeValues;
  alarmChoice: SetupSessionAlarmChoice;
  summaryConfirmation: string | null;
};

export type StoredSetupSessionDraft = QuickSetupDraftV1 | SetupSessionDraftV2;

export type SetupReferenceDatePatch = Pick<
  SetupSessionDraftV2,
  'alarmChoice' | 'position' | 'referenceDate' | 'summaryConfirmation'
>;

const BASE_SHIFT_IDS = ['day', 'evening', 'night', 'off'] as const;
const SOURCES = ['current', 'received-file', 'recommended', 'custom'] as const;
const STEPS = ['schedule-source', 'schedule-anchor', 'alarm-readiness'] as const;
const MODES = ['initial', 'reconfigure'] as const;
const PRESETS = [
  'weekday',
  'two-team-two-shift',
  'three-team-two-shift',
  'three-team-three-shift',
  'four-team-two-shift',
  'four-team-three-shift',
  'custom',
] as const;

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

function readTimes(shiftTypes: readonly ShiftType[]): SetupSessionTimeValues {
  const read = (id: Exclude<BaseWorkShiftId, 'off'>) => {
    const shift = shiftTypes.find((candidate) => candidate.id === id);
    return {
      start: formatTimeInput(shift?.startMinutes ?? 0),
      end: formatTimeInput(shift?.endMinutes ?? 0),
    };
  };
  return { day: read('day'), evening: read('evening'), night: read('night') };
}

function safeBaseSequence(data: AppData): BaseWorkShiftId[] {
  const sequence = data.pattern.shiftTypeIds.filter(
    (id): id is BaseWorkShiftId => includes(BASE_SHIFT_IDS, id),
  );
  return isValidCustomPatternSequence(sequence)
    ? [...sequence]
    : ['day', 'day', 'night', 'night', 'off', 'off'];
}

/** 유효하지 않은 직접 입력이 재개 가능한 설정 초안에 들어가지 않게 합니다. */
export function createSetupReferenceDatePatch({
  presetId,
  referenceDate,
}: {
  presetId: WorkPatternPresetId | null;
  referenceDate: string;
}): SetupReferenceDatePatch | null {
  if (!isValidDraftDateKey(referenceDate)) return null;
  return {
    referenceDate,
    position:
      presetId === 'weekday'
        ? getWeekdayPatternPosition(referenceDate)
        : null,
    alarmChoice: null,
    summaryConfirmation: null,
  };
}

export function createSetupSessionDraft({
  data,
  mode,
  today,
}: {
  data: AppData;
  mode: SetupSessionMode;
  today: string;
}): SetupSessionDraftV2 {
  const sequence = safeBaseSequence(data);
  const presetId = getWorkPatternPresetId(sequence);
  const position =
    presetId === 'weekday'
      ? getWeekdayPatternPosition(today)
      : getPatternPositionForDate({
          date: today,
          referenceDate: data.pattern.anchorDate,
          referencePosition: 0,
          sequenceLength: sequence.length,
        });
  return {
    version: 2,
    mode,
    source: mode === 'reconfigure' ? 'current' : null,
    step: 'schedule-source',
    presetId: mode === 'reconfigure' ? presetId : null,
    sequence,
    referenceDate: today,
    position: mode === 'reconfigure' ? position : null,
    times: readTimes(data.shiftTypes),
    alarmChoice:
      mode === 'reconfigure' && data.settings.notificationsEnabled
        ? 'prepare'
        : null,
    summaryConfirmation: null,
  };
}

export function migrateQuickSetupDraft({
  data,
  draft,
  mode,
}: {
  data: AppData;
  draft: StoredSetupSessionDraft;
  mode: SetupSessionMode;
}): SetupSessionDraftV2 | null {
  if (draft.version === 2) {
    if (draft.mode !== mode) return null;
    if (
      mode === 'reconfigure' &&
      draft.step === 'schedule-source' &&
      draft.source === null
    ) {
      const sequence = safeBaseSequence(data);
      const presetId = getWorkPatternPresetId(sequence);
      return {
        ...draft,
        source: 'current',
        presetId,
        sequence,
        position:
          presetId === 'weekday'
            ? getWeekdayPatternPosition(draft.referenceDate)
            : getPatternPositionForDate({
                date: draft.referenceDate,
                referenceDate: data.pattern.anchorDate,
                referencePosition: 0,
                sequenceLength: sequence.length,
              }),
      };
    }
    return draft;
  }
  if (mode !== 'reconfigure') return null;
  return {
    version: 2,
    mode,
    source:
      draft.source === 'received-file'
        ? 'received-file'
        : draft.source === 'direct'
          ? 'recommended'
          : null,
    // v1은 근무표를 먼저 저장한 뒤 3단계로 이동했습니다. V2는 마지막
    // 버튼에서 원자적으로 저장하므로 2단계 확인부터 다시 시작합니다.
    step: draft.step === 'alarm-readiness' ? 'schedule-anchor' : draft.step,
    presetId: draft.presetId,
    sequence: [...draft.sequence],
    referenceDate: draft.referenceDate,
    position: draft.position,
    times: readTimes(data.shiftTypes),
    alarmChoice: data.settings.notificationsEnabled ? 'prepare' : null,
    summaryConfirmation: null,
  };
}

export function migrateInitialSetupDraft({
  data,
  draft,
}: {
  data: AppData;
  draft: SetupDraft;
}): SetupSessionDraftV2 {
  return {
    version: 2,
    mode: 'initial',
    source: draft.presetId === 'custom' ? 'custom' : draft.presetId ? 'recommended' : null,
    step: draft.step === 1 ? 'schedule-source' : 'schedule-anchor',
    presetId: draft.presetId,
    sequence: [...draft.sequence],
    referenceDate: draft.referenceDate,
    position: draft.position,
    times: {
      day: { start: draft.dayStart, end: draft.dayEnd },
      evening: { start: draft.eveningStart, end: draft.eveningEnd },
      night: { start: draft.nightStart, end: draft.nightEnd },
    },
    alarmChoice: draft.alarmsWanted ? 'prepare' : null,
    summaryConfirmation:
      draft.confirmedSequenceSignature === draft.confirmedWorkTimeSignature
        ? draft.confirmedSequenceSignature
        : null,
  };
}

export function parseSetupSessionDraft(value: unknown): SetupSessionDraftV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Partial<SetupSessionDraftV2>;
  const times = item.times;
  const validTimes =
    typeof times === 'object' &&
    times !== null &&
    (['day', 'evening', 'night'] as const).every((id) => {
      const row = times[id];
      return (
        typeof row === 'object' &&
        row !== null &&
        typeof row.start === 'string' &&
        row.start.length <= 8 &&
        typeof row.end === 'string' &&
        row.end.length <= 8
      );
    });
  if (
    item.version !== 2 ||
    !includes(MODES, item.mode) ||
    (item.source !== null && !includes(SOURCES, item.source)) ||
    !includes(STEPS, item.step) ||
    (item.presetId !== null && !includes(PRESETS, item.presetId)) ||
    !Array.isArray(item.sequence) ||
    !isValidCustomPatternSequence(item.sequence) ||
    typeof item.referenceDate !== 'string' ||
    !isValidDraftDateKey(item.referenceDate) ||
    !(
      item.position === null ||
      (Number.isInteger(item.position) &&
        Number(item.position) >= 0 &&
        Number(item.position) < item.sequence.length)
    ) ||
    !validTimes ||
    (item.alarmChoice !== null &&
      item.alarmChoice !== 'prepare' &&
      item.alarmChoice !== 'schedule-only') ||
    !(
      item.summaryConfirmation === null ||
      (typeof item.summaryConfirmation === 'string' &&
        item.summaryConfirmation.length <= 512)
    )
  ) {
    return null;
  }
  if (item.step !== 'schedule-source' && item.source === null) return null;
  return item as SetupSessionDraftV2;
}
