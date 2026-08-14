import type { ShiftType } from '@/models/app-data';
import type { BaseWorkShiftId } from '@/utils/work-pattern';

export type ScheduleSafetyIssueCode =
  | 'invalid-shift-time'
  | 'work-overlap'
  | 'alarm-during-previous-shift';

export type ScheduleSafetyIssue = {
  code: ScheduleSafetyIssueCode;
  sequenceIndex: number;
  shiftTypeId: Exclude<BaseWorkShiftId, 'off'>;
  previousSequenceIndex?: number;
  previousShiftTypeId?: Exclude<BaseWorkShiftId, 'off'>;
};

export type ScheduleSafetyShift = {
  alarmEnabled: boolean;
  alarmMinutesBefore: number;
  endMinutes: number | null;
  startMinutes: number | null;
};

export type ScheduleSafetyResult = {
  canEnableAlarms: boolean;
  canSave: boolean;
  issues: ScheduleSafetyIssue[];
};

type WorkShiftId = Exclude<BaseWorkShiftId, 'off'>;

type WorkInterval = {
  end: number;
  sequenceIndex: number;
  shiftTypeId: WorkShiftId;
  start: number;
};

const WORK_SHIFT_IDS: readonly WorkShiftId[] = ['day', 'evening', 'night'];

function isWorkShiftId(value: BaseWorkShiftId): value is WorkShiftId {
  return value !== 'off';
}

function isMinuteOfDay(value: number | null): value is number {
  return Number.isInteger(value) && value !== null && value >= 0 && value < 24 * 60;
}

function isAlarmLeadValid(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 24 * 60;
}

function createInterval(
  dayOffset: number,
  sequenceIndex: number,
  shiftTypeId: WorkShiftId,
  shift: ScheduleSafetyShift,
): WorkInterval {
  const startMinutes = shift.startMinutes as number;
  const endMinutes = shift.endMinutes as number;
  const duration =
    endMinutes > startMinutes
      ? endMinutes - startMinutes
      : 24 * 60 - startMinutes + endMinutes;
  const start = dayOffset * 24 * 60 + startMinutes;
  return {
    end: start + duration,
    sequenceIndex,
    shiftTypeId,
    start,
  };
}

function issueKey(issue: ScheduleSafetyIssue): string {
  return [
    issue.code,
    issue.sequenceIndex,
    issue.shiftTypeId,
    issue.previousSequenceIndex ?? '',
    issue.previousShiftTypeId ?? '',
  ].join('|');
}

/**
 * 한 사람의 반복 근무를 실제 시간축으로 펼쳐 주기 경계까지 검사해요.
 * 같은 시각에 이전 근무가 끝나고 다음 근무가 시작하는 것은 겹침이 아니지만,
 * 다음 근무 알람이 이전 근무 중 울리는 경우에는 알람 사용을 막아요.
 */
export function analyzeScheduleSafety({
  sequence,
  shifts,
}: {
  sequence: readonly BaseWorkShiftId[];
  shifts: Record<WorkShiftId, ScheduleSafetyShift>;
}): ScheduleSafetyResult {
  const issues: ScheduleSafetyIssue[] = [];
  const activeIds = [...new Set(sequence.filter(isWorkShiftId))];

  for (const shiftTypeId of activeIds) {
    const shift = shifts[shiftTypeId];
    if (
      !shift ||
      !isMinuteOfDay(shift.startMinutes) ||
      !isMinuteOfDay(shift.endMinutes) ||
      shift.startMinutes === shift.endMinutes ||
      !isAlarmLeadValid(shift.alarmMinutesBefore)
    ) {
      const sequenceIndex = sequence.indexOf(shiftTypeId);
      issues.push({ code: 'invalid-shift-time', sequenceIndex, shiftTypeId });
    }
  }

  if (sequence.length === 0 || issues.some((issue) => issue.code === 'invalid-shift-time')) {
    return { canEnableAlarms: false, canSave: false, issues };
  }

  const intervals: WorkInterval[] = [];
  // 앞뒤 주기까지 펼쳐 중앙 주기의 첫날과 마지막 날도 동일하게 검사합니다.
  for (let dayOffset = -sequence.length; dayOffset < sequence.length * 2; dayOffset += 1) {
    const sequenceIndex = ((dayOffset % sequence.length) + sequence.length) % sequence.length;
    const shiftTypeId = sequence[sequenceIndex];
    if (!isWorkShiftId(shiftTypeId)) continue;
    intervals.push(
      createInterval(dayOffset, sequenceIndex, shiftTypeId, shifts[shiftTypeId]),
    );
  }
  intervals.sort((left, right) => left.start - right.start || left.end - right.end);

  for (let index = 0; index < intervals.length; index += 1) {
    const current = intervals[index];
    const dayOffset = Math.floor(current.start / (24 * 60));
    if (dayOffset < 0 || dayOffset >= sequence.length) continue;

    const previous = intervals
      .slice(0, index)
      .filter((candidate) => current.start < candidate.end)
      .reduce<WorkInterval | null>(
        (mostImpactful, candidate) =>
          mostImpactful === null || candidate.end > mostImpactful.end
            ? candidate
            : mostImpactful,
        null,
      );
    if (previous) {
      issues.push({
        code: 'work-overlap',
        sequenceIndex: current.sequenceIndex,
        shiftTypeId: current.shiftTypeId,
        previousSequenceIndex: previous.sequenceIndex,
        previousShiftTypeId: previous.shiftTypeId,
      });
    }

    const shift = shifts[current.shiftTypeId];
    if (!shift.alarmEnabled || shift.alarmMinutesBefore === 0) continue;
    const alarmAt = current.start - shift.alarmMinutesBefore;
    const alarmConflict = intervals
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.start <= alarmAt && alarmAt < candidate.end);
    if (alarmConflict) {
      issues.push({
        code: 'alarm-during-previous-shift',
        sequenceIndex: current.sequenceIndex,
        shiftTypeId: current.shiftTypeId,
        previousSequenceIndex: alarmConflict.sequenceIndex,
        previousShiftTypeId: alarmConflict.shiftTypeId,
      });
    }
  }

  const uniqueIssues = [...new Map(issues.map((issue) => [issueKey(issue), issue])).values()];
  const canSave = !uniqueIssues.some(
    (issue) => issue.code === 'invalid-shift-time' || issue.code === 'work-overlap',
  );
  return {
    canEnableAlarms:
      canSave &&
      !uniqueIssues.some((issue) => issue.code === 'alarm-during-previous-shift'),
    canSave,
    issues: uniqueIssues,
  };
}

export function createScheduleSafetyShifts(
  shiftTypes: readonly ShiftType[],
  patches: Partial<Record<WorkShiftId, Partial<ScheduleSafetyShift>>> = {},
): Record<WorkShiftId, ScheduleSafetyShift> {
  return Object.fromEntries(
    WORK_SHIFT_IDS.map((id) => {
      const stored = shiftTypes.find((shift) => shift.id === id);
      return [
        id,
        {
          alarmEnabled: stored?.alarmEnabled ?? true,
          alarmMinutesBefore: stored?.alarmMinutesBefore ?? 0,
          endMinutes: stored?.endMinutes ?? null,
          startMinutes: stored?.startMinutes ?? null,
          ...(patches[id] ?? {}),
        },
      ];
    }),
  ) as Record<WorkShiftId, ScheduleSafetyShift>;
}
