import {
  MAX_ALARM_MINUTES_BEFORE,
  type AppData,
  type ShiftType,
} from '../models/app-data';
import { addDays, dateAtMinutes, isValidDateKey, toDateKey } from '../utils/date';
import { ALARM_PLAN_HORIZON_DAYS, resolveAlarmPyoAlarmSourceShift } from './alarm-planner';
import {
  getDayAlarmOverrideLeadMinutes,
  getDayAlarmOverrideWakeAt,
  getScheduleStartDate,
  isValidDayAlarmOverride,
  resolveDayAlarmOverrideFromAppData,
  resolveEffectiveDayFromAppData,
  resolveShiftFromAppData,
} from './app-data-service';

export type ActualAppDataScheduleSafetyIssueCode =
  | 'invalid-pattern'
  | 'invalid-schedule-date'
  | 'invalid-shift-time'
  | 'work-overlap'
  | 'alarm-during-previous-shift'
  | 'unsupported-shift-type';

export type ActualAppDataScheduleSafetyIssueSource =
  | 'schedule'
  | 'pattern'
  | 'override'
  | 'time-override'
  | 'day-exception'
  | 'alarm-override'
  | 'effective-day';

export type ActualAppDataScheduleSafetyIssue = {
  code: ActualAppDataScheduleSafetyIssueCode;
  dateKey: string;
  shiftTypeId: string;
  source: ActualAppDataScheduleSafetyIssueSource;
  previousDateKey?: string;
  previousShiftTypeId?: string;
};

export type ActualAppDataScheduleSafetyResult = {
  /** 근무 겹침이나 잘못된 시각이 없어 자료 자체를 저장할 수 있는지 나타내요. */
  canSave: boolean;
  /** 저장 가능 여부에 더해 네이티브 근무 알람을 안전하게 켤 수 있는지 나타내요. */
  canEnableAlarms: boolean;
  issues: ActualAppDataScheduleSafetyIssue[];
  /** 데이터는 보존하되 네이티브 알람 계산에는 사용하지 않는 활성 ID 목록이에요. */
  unsupportedShiftTypeIds: string[];
  window: {
    startDateKey: string;
    endDateKey: string;
  };
};

export type AnalyzeActualAppDataScheduleSafetyOptions = {
  now?: Date;
  /** 기본 분석 범위 밖의 saveDay/saveDays 후보 날짜를 함께 검사해요. */
  focusDateKeys?: readonly string[];
  /** 2보다 작게 지정해도 이전 야간 근무를 위해 최소 이틀을 검사해요. */
  pastDays?: number;
  /** 네이티브 알람 계획보다 작게 지정해도 전체 네이티브 범위를 검사해요. */
  futureDays?: number;
};

type WorkInterval = {
  dateKey: string;
  end: number;
  shift: ShiftType;
  start: number;
};

type AlarmMoment = {
  alarmAt: number;
  dateKey: string;
  ownWorkInterval: WorkInterval;
  shift: ShiftType;
};

type ValidTimedShift = ShiftType & {
  startMinutes: number;
  endMinutes: number;
};

const MIN_PAST_DAYS = 2;
const DATE_NEIGHBORHOOD_DAYS = 2;
const MINUTES_PER_DAY = 24 * 60;
const SUPPORTED_EFFECTIVE_SHIFT_IDS = new Set([
  'day',
  'evening',
  'night',
  'substitute-day',
  'substitute-night',
  'off',
]);

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label}은(는) 0 이상의 정수여야 합니다.`);
  }
}

function isMinuteOfDay(value: number | null): value is number {
  return Number.isInteger(value) && value !== null && value >= 0 && value < MINUTES_PER_DAY;
}

function hasValidWorkTimes(shift: ShiftType): shift is ValidTimedShift {
  return (
    isMinuteOfDay(shift.startMinutes) &&
    isMinuteOfDay(shift.endMinutes) &&
    shift.startMinutes !== shift.endMinutes &&
    shift.endsNextDay === (shift.endMinutes < shift.startMinutes) &&
    Number.isInteger(shift.alarmMinutesBefore) &&
    shift.alarmMinutesBefore >= 0 &&
    shift.alarmMinutesBefore <= MAX_ALARM_MINUTES_BEFORE
  );
}

function isSupportedShiftReference(
  shiftTypeId: string,
  shiftsById: ReadonlyMap<string, ShiftType>,
): boolean {
  return SUPPORTED_EFFECTIVE_SHIFT_IDS.has(shiftTypeId) && shiftsById.has(shiftTypeId);
}

function issueKey(issue: ActualAppDataScheduleSafetyIssue): string {
  return [
    issue.code,
    issue.dateKey,
    issue.shiftTypeId,
    issue.previousDateKey ?? '',
    issue.previousShiftTypeId ?? '',
  ].join('|');
}

function addDateNeighborhood(target: Set<string>, dateKey: string): void {
  for (let offset = -DATE_NEIGHBORHOOD_DAYS; offset <= DATE_NEIGHBORHOOD_DAYS; offset += 1) {
    target.add(addDays(dateKey, offset));
  }
}

function createWorkInterval(dateKey: string, shift: ShiftType): WorkInterval | null {
  if (!hasValidWorkTimes(shift)) return null;
  const start = dateAtMinutes(dateKey, shift.startMinutes).getTime();
  const endDateKey = shift.endsNextDay ? addDays(dateKey, 1) : dateKey;
  const end = dateAtMinutes(endDateKey, shift.endMinutes).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { dateKey, end, shift, start }
    : null;
}

function mostImpactfulInterval(intervals: readonly WorkInterval[]): WorkInterval | undefined {
  return intervals.reduce<WorkInterval | undefined>(
    (selected, candidate) =>
      !selected || candidate.end > selected.end ||
      (candidate.end === selected.end && candidate.start > selected.start)
        ? candidate
        : selected,
    undefined,
  );
}

function addIssue(
  issues: ActualAppDataScheduleSafetyIssue[],
  issue: ActualAppDataScheduleSafetyIssue,
): void {
  issues.push(issue);
}

function addUnsupportedIssue(
  issues: ActualAppDataScheduleSafetyIssue[],
  unsupportedShiftTypeIds: Set<string>,
  issue: Omit<ActualAppDataScheduleSafetyIssue, 'code'>,
): void {
  if (unsupportedShiftTypeIds.has(issue.shiftTypeId)) return;
  unsupportedShiftTypeIds.add(issue.shiftTypeId);
  addIssue(issues, { ...issue, code: 'unsupported-shift-type' });
}

/**
 * 저장 후보 AppData를 실제 로컬 날짜와 시각으로 펼쳐 근무 겹침과 알람 충돌을 검사해요.
 *
 * 반복 순서만 검사하지 않고 날짜별 근무·시간·예외·알람 변경을 모두 기존 selector와
 * 알람 planner 계약대로 적용합니다. 일정 적용 시작일 전은 정상 비활성 구간으로
 * 제외하며, 지원하지 않는 이전 ID는 자료를 지우지 않고 알람 활성화만 fail-closed로
 * 막습니다.
 */
export function analyzeActualAppDataScheduleSafety(
  data: AppData,
  options: AnalyzeActualAppDataScheduleSafetyOptions = {},
): ActualAppDataScheduleSafetyResult {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('일정 안전 계산 기준 시각이 올바르지 않습니다.');
  }

  const requestedPastDays = options.pastDays ?? MIN_PAST_DAYS;
  const requestedFutureDays = options.futureDays ?? ALARM_PLAN_HORIZON_DAYS;
  assertNonNegativeInteger(requestedPastDays, '과거 일정 계산 일수');
  assertNonNegativeInteger(requestedFutureDays, '미래 일정 계산 일수');
  const pastDays = Math.max(MIN_PAST_DAYS, requestedPastDays);
  const futureDays = Math.max(ALARM_PLAN_HORIZON_DAYS, requestedFutureDays);
  const todayDateKey = toDateKey(now);
  const windowStartDateKey = addDays(todayDateKey, -pastDays);
  // 네이티브 범위의 끝 경계도 검사해 경계 직전 야간 근무를 놓치지 않아요.
  const windowEndDateKey = addDays(todayDateKey, futureDays);

  const issues: ActualAppDataScheduleSafetyIssue[] = [];
  const unsupportedShiftTypeIds = new Set<string>();
  const targetDateKeys = new Set<string>();
  const shiftsById = new Map(data.shiftTypes.map((shift) => [shift.id, shift]));

  for (let offset = -pastDays; offset <= futureDays; offset += 1) {
    targetDateKeys.add(addDays(todayDateKey, offset));
  }

  const anchorDateIsValid = isValidDateKey(data.pattern.anchorDate);
  const storedScheduleStartDate = data.pattern.scheduleStartDate;
  const scheduleStartDateIsValid =
    storedScheduleStartDate === undefined || isValidDateKey(storedScheduleStartDate);
  const scheduleStartDate =
    anchorDateIsValid && scheduleStartDateIsValid
      ? getScheduleStartDate(data)
      : storedScheduleStartDate ?? data.pattern.anchorDate;

  if (!anchorDateIsValid || !scheduleStartDateIsValid) {
    addIssue(issues, {
      code: 'invalid-schedule-date',
      dateKey: scheduleStartDate,
      shiftTypeId: data.pattern.shiftTypeIds[0] ?? '',
      source: 'schedule',
    });
  }

  if (data.pattern.shiftTypeIds.length === 0) {
    addIssue(issues, {
      code: 'invalid-pattern',
      dateKey: scheduleStartDate,
      shiftTypeId: '',
      source: 'pattern',
    });
  }

  if (anchorDateIsValid && scheduleStartDateIsValid) {
    // 시작일이 네이티브 horizon 밖이어도 첫 한 주기와 다음 경계를 검사합니다.
    for (let offset = 0; offset <= data.pattern.shiftTypeIds.length + 1; offset += 1) {
      targetDateKeys.add(addDays(scheduleStartDate, offset));
    }
    for (const shiftTypeId of new Set(data.pattern.shiftTypeIds)) {
      if (isSupportedShiftReference(shiftTypeId, shiftsById)) continue;
      addUnsupportedIssue(issues, unsupportedShiftTypeIds, {
        dateKey: scheduleStartDate,
        shiftTypeId,
        source: 'pattern',
      });
    }
  }

  for (const focusDateKey of options.focusDateKeys ?? []) {
    if (!isValidDateKey(focusDateKey)) {
      addIssue(issues, {
        code: 'invalid-schedule-date',
        dateKey: focusDateKey,
        shiftTypeId: '',
        source: 'schedule',
      });
      continue;
    }
    targetDateKeys.add(focusDateKey);
  }

  const evaluationDateKeys = new Set<string>();
  for (const dateKey of targetDateKeys) addDateNeighborhood(evaluationDateKeys, dateKey);
  const sortedEvaluationDateKeys = [...evaluationDateKeys].sort();
  const workIntervals: WorkInterval[] = [];
  const workIntervalByDate = new Map<string, WorkInterval>();

  for (const dateKey of sortedEvaluationDateKeys) {
    const effectiveDay = resolveEffectiveDayFromAppData(data, dateKey);
    if (!effectiveDay.scheduleActive) continue;

    const directOverride = data.overrides[dateKey];
    if (
      directOverride !== null &&
      directOverride !== undefined &&
      !isSupportedShiftReference(directOverride, shiftsById)
    ) {
      addUnsupportedIssue(issues, unsupportedShiftTypeIds, {
        dateKey,
        shiftTypeId: directOverride,
        source: 'override',
      });
    }

    const timeOverride = data.timeOverrides[dateKey];
    if (timeOverride) {
      if (!isSupportedShiftReference(timeOverride.shiftTypeId, shiftsById)) {
        addUnsupportedIssue(issues, unsupportedShiftTypeIds, {
          dateKey,
          shiftTypeId: timeOverride.shiftTypeId,
          source: 'time-override',
        });
      } else if (
        !isMinuteOfDay(timeOverride.startMinutes) ||
        !isMinuteOfDay(timeOverride.endMinutes) ||
        timeOverride.startMinutes === timeOverride.endMinutes ||
        timeOverride.endsNextDay !== (timeOverride.endMinutes < timeOverride.startMinutes)
      ) {
        addIssue(issues, {
          code: 'invalid-shift-time',
          dateKey,
          shiftTypeId: timeOverride.shiftTypeId,
          source: 'time-override',
        });
      }
    }

    const dayException = data.dayExceptions[dateKey];
    if (
      (dayException === 'training' || dayException === 'reserve') &&
      !isSupportedShiftReference('day', shiftsById)
    ) {
      addUnsupportedIssue(issues, unsupportedShiftTypeIds, {
        dateKey,
        shiftTypeId: 'day',
        source: 'day-exception',
      });
    }

    const rawAlarmOverride = data.alarmOverrides[dateKey];
    if (rawAlarmOverride && !isValidDayAlarmOverride(rawAlarmOverride)) {
      addIssue(issues, {
        code: 'invalid-shift-time',
        dateKey,
        shiftTypeId: effectiveDay.shift?.id ?? '',
        source: 'alarm-override',
      });
    }

    const shift = effectiveDay.shift;
    if (!shift || shift.isOff) continue;
    if (!isSupportedShiftReference(shift.id, shiftsById)) {
      addUnsupportedIssue(issues, unsupportedShiftTypeIds, {
        dateKey,
        shiftTypeId: shift.id,
        source: 'effective-day',
      });
      // 이전 형식의 근무는 보존하되 그 의미를 추정해 저장을 막지 않아요.
      continue;
    }

    const interval = createWorkInterval(dateKey, shift);
    if (!interval) {
      addIssue(issues, {
        code: 'invalid-shift-time',
        dateKey,
        shiftTypeId: shift.id,
        source: 'effective-day',
      });
      continue;
    }
    workIntervals.push(interval);
    workIntervalByDate.set(dateKey, interval);
  }

  workIntervals.sort(
    (left, right) =>
      left.start - right.start || left.end - right.end || left.dateKey.localeCompare(right.dateKey),
  );
  const activeWorkIntervals: WorkInterval[] = [];
  for (const current of workIntervals) {
    for (let index = activeWorkIntervals.length - 1; index >= 0; index -= 1) {
      if (activeWorkIntervals[index].end <= current.start) activeWorkIntervals.splice(index, 1);
    }
    if (targetDateKeys.has(current.dateKey)) {
      const previous = mostImpactfulInterval(activeWorkIntervals);
      if (previous) {
        addIssue(issues, {
          code: 'work-overlap',
          dateKey: current.dateKey,
          shiftTypeId: current.shift.id,
          source: 'effective-day',
          previousDateKey: previous.dateKey,
          previousShiftTypeId: previous.shift.id,
        });
      }
    }
    activeWorkIntervals.push(current);
  }

  const alarmMoments: AlarmMoment[] = [];
  for (const dateKey of targetDateKeys) {
    const ownWorkInterval = workIntervalByDate.get(dateKey);
    if (!ownWorkInterval) continue;
    const scheduledShift = resolveShiftFromAppData(data, dateKey);
    const shift = resolveAlarmPyoAlarmSourceShift(data, dateKey, scheduledShift);
    if (!shift || shift.isOff || !isSupportedShiftReference(shift.id, shiftsById)) continue;

    const rawAlarmOverride = data.alarmOverrides[dateKey];
    if (rawAlarmOverride && !isValidDayAlarmOverride(rawAlarmOverride)) continue;
    const alarmOverride = resolveDayAlarmOverrideFromAppData(data, dateKey, shift);
    if (alarmOverride?.mode === 'disabled') continue;

    let alarmAt: number;
    if (alarmOverride?.mode === 'wake-time') {
      const leadMinutes = getDayAlarmOverrideLeadMinutes(dateKey, shift, alarmOverride);
      if (leadMinutes === null) continue;
      alarmAt = getDayAlarmOverrideWakeAt(dateKey, alarmOverride);
    } else {
      if (!shift.alarmEnabled || !hasValidWorkTimes(shift)) continue;
      alarmAt =
        dateAtMinutes(dateKey, shift.startMinutes).getTime() -
        shift.alarmMinutesBefore * 60_000;
    }
    alarmMoments.push({ alarmAt, dateKey, ownWorkInterval, shift });
  }

  alarmMoments.sort(
    (left, right) => left.alarmAt - right.alarmAt || left.dateKey.localeCompare(right.dateKey),
  );
  const alarmActiveIntervals: WorkInterval[] = [];
  let nextWorkIntervalIndex = 0;
  for (const alarm of alarmMoments) {
    while (
      nextWorkIntervalIndex < workIntervals.length &&
      workIntervals[nextWorkIntervalIndex].start <= alarm.alarmAt
    ) {
      alarmActiveIntervals.push(workIntervals[nextWorkIntervalIndex]);
      nextWorkIntervalIndex += 1;
    }
    for (let index = alarmActiveIntervals.length - 1; index >= 0; index -= 1) {
      if (alarmActiveIntervals[index].end <= alarm.alarmAt) {
        alarmActiveIntervals.splice(index, 1);
      }
    }
    const previous = mostImpactfulInterval(
      alarmActiveIntervals.filter((interval) => interval !== alarm.ownWorkInterval),
    );
    if (previous) {
      addIssue(issues, {
        code: 'alarm-during-previous-shift',
        dateKey: alarm.dateKey,
        shiftTypeId: alarm.shift.id,
        source: 'effective-day',
        previousDateKey: previous.dateKey,
        previousShiftTypeId: previous.shift.id,
      });
    }
  }

  const issuesByKey = new Map<string, ActualAppDataScheduleSafetyIssue>();
  for (const issue of issues) {
    const key = issueKey(issue);
    if (!issuesByKey.has(key)) issuesByKey.set(key, issue);
  }
  const uniqueIssues = [...issuesByKey.values()];
  const canSave = !uniqueIssues.some(
    (issue) =>
      issue.code === 'invalid-pattern' ||
      issue.code === 'invalid-schedule-date' ||
      issue.code === 'invalid-shift-time' ||
      issue.code === 'work-overlap',
  );
  const canEnableAlarms =
    canSave &&
    unsupportedShiftTypeIds.size === 0 &&
    !uniqueIssues.some((issue) => issue.code === 'alarm-during-previous-shift');

  return {
    canSave,
    canEnableAlarms,
    issues: uniqueIssues,
    unsupportedShiftTypeIds: [...unsupportedShiftTypeIds].sort(),
    window: {
      startDateKey: windowStartDateKey,
      endDateKey: windowEndDateKey,
    },
  };
}

/** saveDay/saveDays처럼 기본 horizon 밖의 후보 날짜를 검사하는 명시적 편의 API예요. */
export function analyzeActualAppDataScheduleSafetyForDates(
  data: AppData,
  focusDateKeys: readonly string[],
  options: Omit<AnalyzeActualAppDataScheduleSafetyOptions, 'focusDateKeys'> = {},
): ActualAppDataScheduleSafetyResult {
  return analyzeActualAppDataScheduleSafety(data, { ...options, focusDateKeys });
}
