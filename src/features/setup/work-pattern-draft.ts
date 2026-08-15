import type { AppData, RotationPattern, ShiftType } from '../../models/app-data';
import {
  analyzeScheduleSafety,
  createScheduleSafetyShifts,
  type ScheduleSafetyResult,
} from '../../services/schedule-safety-service';
import { addDays, differenceInCalendarDays, isValidDateKey } from '../../utils/date';
import {
  calculateShiftDuration,
  formatTimeInput,
  parseTimeInput,
  type ShiftDuration,
} from '../../utils/shift-time';
import {
  createWorkPatternFromReference,
  getEffectiveWorkPatternPresetId,
  getWeekdayPatternPosition,
  getWorkPatternCategoryId,
  getWorkPatternPresetId,
  isBaseWorkShiftId,
  isValidCustomPatternSequence,
  type BaseWorkShiftId,
  type WorkPatternCategoryId,
  type WorkPatternPresetId,
} from '../../utils/work-pattern';

export type EditableWorkShiftId = Exclude<BaseWorkShiftId, 'off'>;

export type WorkPatternTimeValues = Record<
  EditableWorkShiftId,
  { end: string; start: string }
>;

export type WorkPatternDraft = {
  /** Store에 쓰지 않는 편집 출처입니다. */
  mode: 'initial-setup' | 'existing-schedule';
  presetId: WorkPatternPresetId | null;
  categoryId: WorkPatternCategoryId | null;
  sequence: BaseWorkShiftId[];
  sourcePattern: RotationPattern | null;
  sourceSequence: string[];
  scheduleStartDate: string;
  referenceDate: string;
  position: number | null;
  times: WorkPatternTimeValues;
  sourceTimes: WorkPatternTimeValues;
  alarmsWanted: boolean;
  reviewedShiftIds: EditableWorkShiftId[];
  summaryConfirmation: string | null;
  /** legacy ID가 사라지는 변경에는 사용자의 명시적인 확인이 필요합니다. */
  legacyMappingConfirmed: boolean;
};

export type WorkPatternDraftIssueCode =
  | 'preset-required'
  | 'sequence-invalid'
  | 'date-invalid'
  | 'position-required'
  | 'shift-time-invalid'
  | 'work-overlap'
  | 'summary-unconfirmed'
  | 'new-shift-review-required'
  | 'legacy-mapping-required';

export type WorkPatternDraftIssue = {
  code: WorkPatternDraftIssueCode;
  shiftTypeId?: EditableWorkShiftId;
};

export type WorkPatternDraftValidation = {
  activePosition: number | null;
  activeShiftIds: EditableWorkShiftId[];
  canEnableAlarms: boolean;
  canSave: boolean;
  effectivePresetId: WorkPatternPresetId | null;
  issues: WorkPatternDraftIssue[];
  safety: ScheduleSafetyResult;
  shifts: Record<
    EditableWorkShiftId,
    {
      duration: ShiftDuration | null;
      endMinutes: number | null;
      startMinutes: number | null;
    }
  >;
};

export type WorkPatternIssueTarget = {
  editor: 'sequence' | 'times' | null;
  shiftTypeId: EditableWorkShiftId | null;
  step: 1 | 2 | 3;
};

export type InitialWorkPatternDraftSnapshot = {
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
  confirmedSequenceSignature: string | null;
  confirmedWorkTimeSignature: string | null;
};

export type WorkPatternMutation = {
  pattern: RotationPattern;
  shiftTypePatches: Record<string, Partial<ShiftType>>;
};

export type WorkPatternSaveOutcome =
  | { status: 'success'; issue: null }
  | {
      status: 'failure' | 'partial';
      issue:
        | 'backup-failure'
        | 'invalid-schedule'
        | 'storage-failure'
        | 'alarms-disabled'
        | 'alarm-sync-partial';
    };

const EDITABLE_SHIFT_IDS: readonly EditableWorkShiftId[] = ['day', 'evening', 'night'];

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function isLegacyEveningId(id: string) {
  return /^legacy-evening(?:-\d+)?$/.test(id);
}

function toEditableShiftId(id: string): BaseWorkShiftId | null {
  if (isBaseWorkShiftId(id)) return id;
  if (isLegacyEveningId(id)) return 'evening';
  return null;
}

export function getUnresolvedLegacyShiftIds(draft: WorkPatternDraft): string[] {
  return [...new Set(draft.sourceSequence.filter((id) => !isBaseWorkShiftId(id)))];
}

export function getMappedSourceSequence(draft: WorkPatternDraft): BaseWorkShiftId[] {
  return draft.sourceSequence
    .map(toEditableShiftId)
    .filter((id): id is BaseWorkShiftId => id !== null);
}

export function isWorkPatternSequenceChanged(draft: WorkPatternDraft): boolean {
  const source = getMappedSourceSequence(draft);
  return (
    source.length !== draft.sequence.length ||
    source.some((id, index) => id !== draft.sequence[index])
  );
}

function shiftTimeValues(shiftTypes: readonly ShiftType[]): WorkPatternTimeValues {
  const read = (id: EditableWorkShiftId) => {
    const shift = shiftTypes.find((item) => item.id === id);
    return {
      start: formatTimeInput(shift?.startMinutes ?? 0),
      end: formatTimeInput(shift?.endMinutes ?? 0),
    };
  };
  return { day: read('day'), evening: read('evening'), night: read('night') };
}

export function createExistingWorkPatternDraft({
  data,
  today,
}: {
  data: AppData;
  today: string;
}): WorkPatternDraft {
  const sourceSequence = [...data.pattern.shiftTypeIds];
  const sequence = sourceSequence
    .map(toEditableShiftId)
    .filter((id): id is BaseWorkShiftId => id !== null);
  const safeSequence: BaseWorkShiftId[] = isValidCustomPatternSequence(sequence)
    ? [...sequence]
    : ['day'];
  const presetId = getWorkPatternPresetId(safeSequence);
  const scheduleStartDate = data.pattern.scheduleStartDate ?? data.pattern.anchorDate;
  const referenceDate = scheduleStartDate > today ? scheduleStartDate : today;
  const position =
    presetId === 'weekday'
      ? getWeekdayPatternPosition(referenceDate)
      : positiveModulo(
          differenceInCalendarDays(referenceDate, data.pattern.anchorDate),
          sourceSequence.length || safeSequence.length,
        );
  const times = shiftTimeValues(data.shiftTypes);
  return {
    mode: 'existing-schedule',
    presetId,
    categoryId: getWorkPatternCategoryId(presetId),
    sequence: [...safeSequence],
    sourcePattern: { ...data.pattern, shiftTypeIds: sourceSequence },
    sourceSequence,
    scheduleStartDate,
    referenceDate,
    position,
    times,
    sourceTimes: times,
    alarmsWanted: data.settings.notificationsEnabled,
    reviewedShiftIds: activeShiftIds(safeSequence),
    summaryConfirmation: null,
    legacyMappingConfirmed: false,
  };
}

export function createInitialWorkPatternDraft({
  shiftTypes,
  today,
}: {
  shiftTypes: readonly ShiftType[];
  today: string;
}): WorkPatternDraft {
  const times = shiftTimeValues(shiftTypes);
  return {
    mode: 'initial-setup',
    presetId: null,
    categoryId: null,
    sequence: ['day', 'day', 'night', 'night', 'off', 'off'],
    sourcePattern: null,
    sourceSequence: [],
    scheduleStartDate: today,
    referenceDate: today,
    position: null,
    times,
    sourceTimes: times,
    alarmsWanted: false,
    reviewedShiftIds: [],
    summaryConfirmation: null,
    legacyMappingConfirmed: true,
  };
}

/** v4 자동 저장 형식은 유지하면서 최초 설정도 공용 초안 계약으로 복원합니다. */
export function restoreInitialWorkPatternDraft(
  base: WorkPatternDraft,
  snapshot: InitialWorkPatternDraftSnapshot,
): WorkPatternDraft {
  const restored: WorkPatternDraft = {
    ...base,
    presetId: snapshot.presetId,
    categoryId: getWorkPatternCategoryId(snapshot.presetId),
    sequence: [...snapshot.sequence],
    scheduleStartDate: snapshot.referenceDate,
    referenceDate: snapshot.referenceDate,
    position: snapshot.position,
    times: {
      day: { start: snapshot.dayStart, end: snapshot.dayEnd },
      evening: { start: snapshot.eveningStart, end: snapshot.eveningEnd },
      night: { start: snapshot.nightStart, end: snapshot.nightEnd },
    },
    alarmsWanted: snapshot.alarmsWanted,
    reviewedShiftIds: [],
    summaryConfirmation: null,
  };
  const signature = createWorkPatternSummarySignature(restored);
  const confirmed =
    snapshot.confirmedSequenceSignature === signature &&
    snapshot.confirmedWorkTimeSignature === signature;
  return confirmed
    ? {
        ...restored,
        reviewedShiftIds: activeShiftIds(restored.sequence),
        summaryConfirmation: signature,
      }
    : restored;
}

export function activeShiftIds(
  sequence: readonly BaseWorkShiftId[],
): EditableWorkShiftId[] {
  return EDITABLE_SHIFT_IDS.filter((id) => sequence.includes(id));
}

export function getNewlyActiveShiftIds(draft: WorkPatternDraft): EditableWorkShiftId[] {
  const sourceActive = new Set(activeShiftIds(getMappedSourceSequence(draft)));
  return activeShiftIds(draft.sequence).filter((id) => !sourceActive.has(id));
}

export function createWorkPatternSummarySignature(draft: WorkPatternDraft): string {
  return createWorkPatternConfirmationSignature({
    presetId: draft.presetId,
    sequence: draft.sequence,
    times: draft.times,
  });
}

export function createWorkPatternConfirmationSignature({
  presetId,
  sequence,
  times,
}: {
  presetId: WorkPatternPresetId | null;
  sequence: readonly BaseWorkShiftId[];
  times: WorkPatternTimeValues;
}): string {
  const active = activeShiftIds(sequence);
  return [
    'work-pattern:v1',
    presetId ?? '',
    sequence.join(','),
    active.map((id) => `${id}:${times[id].start}-${times[id].end}`).join('|'),
  ].join(':');
}

function timePatch(
  draft: WorkPatternDraft,
  id: EditableWorkShiftId,
): Partial<ShiftType> | null {
  const startMinutes = parseTimeInput(draft.times[id].start);
  const endMinutes = parseTimeInput(draft.times[id].end);
  if (startMinutes === null || endMinutes === null) return null;
  const duration = calculateShiftDuration(startMinutes, endMinutes);
  if (!duration) return null;
  const source = draft.sourceTimes[id];
  if (
    draft.mode === 'existing-schedule' &&
    !getNewlyActiveShiftIds(draft).includes(id) &&
    source.start === draft.times[id].start &&
    source.end === draft.times[id].end
  ) {
    return null;
  }
  return { startMinutes, endMinutes, endsNextDay: duration.endsNextDay };
}

export function validateWorkPatternDraft(
  draft: WorkPatternDraft,
  shiftTypes: readonly ShiftType[],
): WorkPatternDraftValidation {
  const issues: WorkPatternDraftIssue[] = [];
  const effectivePresetId =
    draft.presetId === null
      ? null
      : getEffectiveWorkPatternPresetId(draft.presetId, draft.sequence);
  const activeIds = activeShiftIds(draft.sequence);
  if (draft.presetId === null) issues.push({ code: 'preset-required' });
  if (!isValidCustomPatternSequence(draft.sequence)) issues.push({ code: 'sequence-invalid' });
  if (!isValidDateKey(draft.scheduleStartDate) || !isValidDateKey(draft.referenceDate)) {
    issues.push({ code: 'date-invalid' });
  }
  const activePosition =
    effectivePresetId === 'weekday' && isValidDateKey(draft.referenceDate)
      ? getWeekdayPatternPosition(draft.referenceDate)
      : draft.position;
  if (
    effectivePresetId !== 'weekday' &&
    (activePosition === null || activePosition < 0 || activePosition >= draft.sequence.length)
  ) {
    issues.push({ code: 'position-required' });
  }

  const shifts = Object.fromEntries(
    EDITABLE_SHIFT_IDS.map((id) => {
      const startMinutes = parseTimeInput(draft.times[id].start);
      const endMinutes = parseTimeInput(draft.times[id].end);
      const duration =
        startMinutes === null || endMinutes === null
          ? null
          : calculateShiftDuration(startMinutes, endMinutes);
      if (activeIds.includes(id) && duration === null) {
        issues.push({ code: 'shift-time-invalid', shiftTypeId: id });
      }
      return [id, { startMinutes, endMinutes, duration }];
    }),
  ) as WorkPatternDraftValidation['shifts'];
  const patches = Object.fromEntries(
    activeIds.map((id) => [id, {
      startMinutes: shifts[id].startMinutes,
      endMinutes: shifts[id].endMinutes,
    }]),
  );
  const safety = analyzeScheduleSafety({
    sequence: draft.sequence,
    shifts: createScheduleSafetyShifts(shiftTypes, patches),
  });
  if (!safety.canSave) issues.push({ code: 'work-overlap' });

  const newlyActive = getNewlyActiveShiftIds(draft);
  for (const id of newlyActive) {
    if (!draft.reviewedShiftIds.includes(id)) {
      issues.push({ code: 'new-shift-review-required', shiftTypeId: id });
    }
  }
  if (draft.summaryConfirmation !== createWorkPatternSummarySignature(draft)) {
    issues.push({ code: 'summary-unconfirmed' });
  }
  if (
    isWorkPatternSequenceChanged(draft) &&
    getUnresolvedLegacyShiftIds(draft).length > 0 &&
    !draft.legacyMappingConfirmed
  ) {
    issues.push({ code: 'legacy-mapping-required' });
  }
  return {
    activePosition,
    activeShiftIds: activeIds,
    canEnableAlarms: safety.canEnableAlarms,
    canSave: issues.length === 0,
    effectivePresetId,
    issues,
    safety,
    shifts,
  };
}

/** 첫 오류를 화면 단계와 접근성 포커스 대상으로 결정합니다. */
export function getFirstWorkPatternIssueTarget(
  validation: WorkPatternDraftValidation,
): WorkPatternIssueTarget | null {
  const issue = validation.issues[0];
  if (!issue) return null;
  switch (issue.code) {
    case 'preset-required':
      return { step: 1, editor: null, shiftTypeId: null };
    case 'sequence-invalid':
    case 'legacy-mapping-required':
      return { step: 2, editor: 'sequence', shiftTypeId: null };
    case 'shift-time-invalid':
    case 'new-shift-review-required':
      return { step: 2, editor: 'times', shiftTypeId: issue.shiftTypeId ?? null };
    case 'work-overlap':
      return {
        step: 2,
        editor: 'times',
        shiftTypeId: validation.activeShiftIds[0] ?? null,
      };
    case 'summary-unconfirmed':
      return { step: 2, editor: null, shiftTypeId: null };
    case 'date-invalid':
    case 'position-required':
      return { step: 3, editor: null, shiftTypeId: null };
  }
}

export function buildWorkPatternMutation(
  draft: WorkPatternDraft,
  shiftTypes: readonly ShiftType[],
): WorkPatternMutation {
  const validation = validateWorkPatternDraft(draft, shiftTypes);
  if (!validation.canSave || validation.activePosition === null || !validation.effectivePresetId) {
    throw new RangeError('근무표 초안을 확인해야 합니다.');
  }
  const sequenceChanged = isWorkPatternSequenceChanged(draft);
  let pattern: RotationPattern;
  if (draft.sourcePattern && !sequenceChanged) {
    pattern = {
      ...draft.sourcePattern,
      scheduleStartDate: draft.scheduleStartDate,
      anchorDate:
        validation.effectivePresetId === 'weekday'
          ? addDays(draft.scheduleStartDate, -getWeekdayPatternPosition(draft.scheduleStartDate))
          : addDays(draft.referenceDate, -validation.activePosition),
      shiftTypeIds: [...draft.sourceSequence],
    };
  } else {
    pattern = createWorkPatternFromReference({
      presetId: validation.effectivePresetId,
      position: validation.activePosition,
      referenceDate: draft.referenceDate,
      scheduleStartDate: draft.scheduleStartDate,
      shiftTypeIds: draft.sequence,
    });
  }
  const shiftTypePatches = Object.fromEntries(
    validation.activeShiftIds
      .map((id) => [id, timePatch(draft, id)] as const)
      .filter((entry): entry is [EditableWorkShiftId, Partial<ShiftType>] => entry[1] !== null),
  );
  return { pattern, shiftTypePatches };
}

export function resolveWorkPatternSaveOutcome({
  alarmsWanted,
  alarmsReady,
  alarmSyncFailed = false,
  backupCreated,
  persisted,
  valid,
}: {
  alarmsWanted: boolean;
  alarmsReady: boolean;
  alarmSyncFailed?: boolean;
  backupCreated: boolean;
  persisted: boolean;
  valid: boolean;
}): WorkPatternSaveOutcome {
  if (!valid) return { status: 'failure', issue: 'invalid-schedule' };
  if (!backupCreated) return { status: 'failure', issue: 'backup-failure' };
  if (!persisted) return { status: 'failure', issue: 'storage-failure' };
  if (alarmSyncFailed) return { status: 'partial', issue: 'alarm-sync-partial' };
  if (alarmsWanted && !alarmsReady) {
    return {
      status: 'partial',
      issue: 'alarms-disabled',
    };
  }
  return { status: 'success', issue: null };
}
