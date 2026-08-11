import type { AppData, ShiftType } from '../models/app-data';
import {
  addDays,
  dateAtMinutes,
  differenceInCalendarDays,
  toDateKey,
} from '../utils/date';
import { getDayExceptionLabel } from '../utils/day-exception';
import {
  getDayAlarmOverrideWakeAt,
  resolveDayAlarmOverrideFromAppData,
  resolveEffectiveDayFromAppData,
} from './app-data-service';
import {
  resolveRoutineAlarmLeadMinutes,
  ROUTINE_ALARM_LEAD_MINUTES,
} from './work-routine-planner';
import {
  getWorkRoutineTimingForShift,
  isValidWorkRoutineTiming,
  WORK_ROUTINE_MINUTES_STEP,
} from './work-routine-settings';

export const SLEEP_TIMING_HORIZON_DAYS = 4;
export const SLEEP_TIMING_MAIN_MINUTES = 8 * 60;
export const SLEEP_TIMING_MINIMUM_MINUTES = 7 * 60;
export const SLEEP_TIMING_MAXIMUM_MINUTES = 8 * 60 + 30;
export const SLEEP_TIMING_NIGHT_NAP_MINUTES = 90;
// 잠들기 직전까지 일정을 잡지 않도록 보충 수면 준비 시간을 따로 안내해요.
export const SLEEP_TIMING_NIGHT_NAP_PREP_MINUTES = 10;
// 야간 퇴근 06:45 이후 이동·정리를 거쳐 08:00에 수면을 시작하는 기본 여유입니다.
export const SLEEP_TIMING_POST_SHIFT_BUFFER_MINUTES = 75;
// 마지막 야간 뒤에는 낮 수면을 짧게 마치고 밤 수면으로 돌아갈 수 있도록 합니다.
export const SLEEP_TIMING_LAST_NIGHT_RECOVERY_MINUTES = 5 * 60;
export const SLEEP_TIMING_DEFAULT_ALARM_LEAD_MINUTES = ROUTINE_ALARM_LEAD_MINUTES;

const DEFAULT_NIGHT_CORE_END_MINUTES = 7 * 60;
const DEFAULT_REGULAR_SLEEP_START_MINUTES = 23 * 60;
const LAST_NIGHT_RECOVERY_BEDTIME_RANGE_MINUTES = 30;
const WORK_WINDOW_PRIORITY_MS = 24 * 60 * 60 * 1_000;
const TRANSITION_MODE_LOOKAHEAD_MS = 36 * 60 * 60 * 1_000;
const DEFAULT_ROUTINE_COMMUTE_MINUTES = 15;
const MINIMUM_USEFUL_SLEEP_WINDOW_MINUTES = 30;
const MINUTE_IN_MS = 60_000;

export type SleepTimingTransitionModeKind =
  | 'day-to-night'
  | 'off-to-night'
  | 'night-to-off'
  | 'night-to-day'
  | 'off-to-day';

export type SleepTimingTransitionMode = {
  kind: SleepTimingTransitionModeKind;
  title: string;
  guidance: string;
  windowIds: string[];
};

export type SleepTimingWindowKind =
  | 'main'
  | 'night-core'
  | 'pre-night-nap'
  | 'post-night'
  | 'off-transition'
  | 'regular';

export type SleepTimingWindow = {
  id: string;
  kind: SleepTimingWindowKind;
  title: string;
  startAt: number;
  endAt: number;
  bedtimeRangeStartAt: number;
  bedtimeRangeEndAt: number;
  guidance: string;
  relatedDateKey: string | null;
  shiftTypeId: string | null;
  shiftName: string | null;
  usesFallbackAlarmLead: boolean;
  transitionModeKind: SleepTimingTransitionModeKind | null;
};

export type SleepTimingTransition = {
  id: string;
  kind: 'first-night-awake';
  title: string;
  startAt: number;
  endAt: number;
  nextSleepStartAt: number;
  nextWakeAt: number;
  guidance: string;
  relatedDateKey: string;
  shiftTypeId: string;
  shiftName: string;
};

export type SleepTimingGuidance = {
  primary: SleepTimingWindow;
  additional: SleepTimingWindow[];
  transition: SleepTimingTransition | null;
  transitionMode: SleepTimingTransitionMode | null;
};

export type BuildSleepTimingGuidanceOptions = {
  now?: Date;
  horizonDays?: number;
  additionalLimit?: number;
};

type WorkEvent = {
  dateKey: string;
  shift: ShiftType;
  shiftTypeId: string;
  shiftName: string;
};

type WorkInterval = {
  startAt: number;
  endAt: number;
};

function isValidShiftMinute(value: number | null): value is number {
  return Number.isInteger(value) && value !== null && value >= 0 && value < 24 * 60;
}

function isNightShift(shift: ShiftType): boolean {
  return (
    shift.endsNextDay ||
    shift.id === 'night' ||
    shift.id === 'substitute-night'
  );
}

function resolveWorkEvent(data: AppData, dateKey: string): WorkEvent | null {
  const effectiveDay = resolveEffectiveDayFromAppData(data, dateKey);
  const shift = effectiveDay.shift;
  if (
    !effectiveDay.scheduleActive ||
    !shift ||
    shift.isOff ||
    !isValidShiftMinute(shift.startMinutes) ||
    !isValidShiftMinute(shift.endMinutes)
  ) {
    return null;
  }

  const exception = effectiveDay.dayException;
  return {
    dateKey,
    shift,
    shiftTypeId: exception ? `exception-${exception}` : shift.id,
    shiftName: exception ? getDayExceptionLabel(exception) : shift.name,
  };
}

function alarmLeadForSleep(shift: ShiftType): {
  minutes: number;
  usesFallback: boolean;
} {
  return resolveRoutineAlarmLeadMinutes(shift);
}

function workStartAt(event: WorkEvent): number {
  return dateAtMinutes(event.dateKey, event.shift.startMinutes!).getTime();
}

function workEndAt(event: WorkEvent): number {
  const endDateKey = event.shift.endsNextDay
    ? addDays(event.dateKey, 1)
    : event.dateKey;
  return dateAtMinutes(endDateKey, event.shift.endMinutes!).getTime();
}

function wakeAt(data: AppData, event: WorkEvent): {
  timestamp: number;
  usesFallback: boolean;
} {
  const alarmOverride = resolveDayAlarmOverrideFromAppData(
    data,
    event.dateKey,
    event.shift,
  );
  if (alarmOverride?.mode === 'wake-time') {
    return {
      timestamp: getDayAlarmOverrideWakeAt(event.dateKey, alarmOverride),
      usesFallback: false,
    };
  }
  const lead = alarmLeadForSleep(event.shift);
  const routineTiming = getWorkRoutineTimingForShift(
    data.settings.workRoutineProfiles,
    event.shift,
  );
  const routineLead = isValidWorkRoutineTiming(routineTiming)
    ? routineTiming.departMinutesBefore + WORK_ROUTINE_MINUTES_STEP
    : 0;
  const wakeLeadMinutes = Math.max(lead.minutes, routineLead);
  return {
    timestamp: workStartAt(event) - wakeLeadMinutes * MINUTE_IN_MS,
    usesFallback: lead.usesFallback,
  };
}

function postShiftBufferMinutes(data: AppData, event: WorkEvent): number {
  const routineTiming = getWorkRoutineTimingForShift(
    data.settings.workRoutineProfiles,
    event.shift,
  );
  if (!isValidWorkRoutineTiming(routineTiming)) {
    return SLEEP_TIMING_POST_SHIFT_BUFFER_MINUTES;
  }
  const commuteMinutes =
    routineTiming.departMinutesBefore - routineTiming.arriveMinutesBefore;
  return Math.max(
    WORK_ROUTINE_MINUTES_STEP,
    SLEEP_TIMING_POST_SHIFT_BUFFER_MINUTES +
      commuteMinutes -
      DEFAULT_ROUTINE_COMMUTE_MINUTES,
  );
}

function workIntervalsInRange(
  data: AppData,
  startAt: number,
  endAt: number,
): WorkInterval[] {
  if (!data.settings.setupCompleted) return [];
  const firstDateKey = addDays(toDateKey(new Date(startAt)), -1);
  const lastDateKey = toDateKey(new Date(endAt));
  const dayCount = differenceInCalendarDays(lastDateKey, firstDateKey);
  const intervals: WorkInterval[] = [];

  for (let offset = 0; offset <= dayCount; offset += 1) {
    const event = resolveWorkEvent(data, addDays(firstDateKey, offset));
    if (!event) continue;
    const interval = {
      startAt: workStartAt(event),
      endAt: workEndAt(event),
    };
    if (interval.startAt < endAt && interval.endAt > startAt) {
      intervals.push(interval);
    }
  }

  return intervals.sort((left, right) => left.startAt - right.startAt);
}

/** 저장된 근무와 겹치는 부분을 제거하고 실제로 확보할 수 있는 수면 구간만 남겨요. */
function fitSleepWindowAroundWork(
  data: AppData,
  window: SleepTimingWindow,
): SleepTimingWindow | null {
  const rangeStartAt = Math.min(
    window.startAt,
    window.bedtimeRangeStartAt,
    window.bedtimeRangeEndAt,
  );
  const rangeEndAt = Math.max(
    window.endAt,
    window.bedtimeRangeStartAt,
    window.bedtimeRangeEndAt,
  );
  const intervals = workIntervalsInRange(data, rangeStartAt, rangeEndAt);
  if (intervals.length === 0) return window;

  let startAt = window.startAt;
  let endAt = window.endAt;
  let bedtimeRangeStartAt = window.bedtimeRangeStartAt;
  let bedtimeRangeEndAt = window.bedtimeRangeEndAt;

  if (window.kind === 'post-night') {
    for (const interval of intervals) {
      if (interval.startAt >= endAt || interval.endAt <= startAt) continue;
      if (interval.startAt <= startAt) return null;
      endAt = Math.min(endAt, interval.startAt);
    }
    bedtimeRangeStartAt = Math.min(
      Math.max(bedtimeRangeStartAt, startAt),
      endAt,
    );
    bedtimeRangeEndAt = Math.max(
      bedtimeRangeStartAt,
      Math.min(bedtimeRangeEndAt, endAt),
    );
  } else {
    let latestBlockingEndAt = Number.NEGATIVE_INFINITY;
    for (const interval of intervals) {
      if (interval.startAt >= endAt || interval.endAt <= rangeStartAt) continue;
      latestBlockingEndAt = Math.max(latestBlockingEndAt, interval.endAt);
    }
    if (Number.isFinite(latestBlockingEndAt)) {
      startAt = Math.max(startAt, latestBlockingEndAt);
      bedtimeRangeStartAt = Math.max(
        bedtimeRangeStartAt,
        latestBlockingEndAt,
      );
      bedtimeRangeEndAt = Math.max(
        bedtimeRangeStartAt,
        Math.min(bedtimeRangeEndAt, endAt),
      );
    }
  }

  if (
    endAt - startAt <
    MINIMUM_USEFUL_SLEEP_WINDOW_MINUTES * MINUTE_IN_MS
  ) {
    return null;
  }

  const adjusted =
    startAt !== window.startAt ||
    endAt !== window.endAt ||
    bedtimeRangeStartAt !== window.bedtimeRangeStartAt ||
    bedtimeRangeEndAt !== window.bedtimeRangeEndAt;
  return {
    ...window,
    id: adjusted
      ? `${window.id}:work-safe:${startAt}:${endAt}`
      : window.id,
    startAt,
    endAt,
    bedtimeRangeStartAt,
    bedtimeRangeEndAt,
    guidance: adjusted
      ? `${window.guidance} 저장된 근무 시간과 겹치지 않는 범위로 조정했어요.`
      : window.guidance,
  };
}

function createWorkWindow(
  event: WorkEvent,
  kind: Exclude<SleepTimingWindowKind, 'regular'>,
  startAt: number,
  endAt: number,
  usesFallbackAlarmLead: boolean,
  options: {
    bedtimeRangeStartAt?: number;
    bedtimeRangeEndAt?: number;
    guidance?: string;
    shiftName?: string | null;
    title?: string;
    transitionModeKind?: SleepTimingTransitionModeKind | null;
  } = {},
): SleepTimingWindow | null {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    return null;
  }

  const title =
    options.title ??
    (kind === 'main'
      ? `${event.shiftName} 전 주수면`
      : kind === 'night-core'
        ? `${event.shiftName} 전 주수면`
        : kind === 'pre-night-nap'
          ? `${event.shiftName} 전 보충 수면`
          : kind === 'off-transition'
            ? '휴무 전환 수면'
            : `${event.shiftName} 후 회복 수면`);

  const defaultRangeStartAt =
    kind === 'pre-night-nap'
      ? startAt
      : Math.min(startAt, endAt - SLEEP_TIMING_MAXIMUM_MINUTES * 60_000);
  const defaultRangeEndAt =
    kind === 'pre-night-nap'
      ? startAt
      : Math.max(startAt, endAt - SLEEP_TIMING_MINIMUM_MINUTES * 60_000);

  return {
    id: `sleep:${kind}:${event.dateKey}:${startAt}`,
    kind,
    title,
    startAt,
    endAt,
    bedtimeRangeStartAt: options.bedtimeRangeStartAt ?? defaultRangeStartAt,
    bedtimeRangeEndAt: options.bedtimeRangeEndAt ?? defaultRangeEndAt,
    guidance:
      options.guidance ??
      (kind === 'pre-night-nap'
        ? '야간 근무 전에 90분 보충 수면을 확보하세요.'
        : '기상 목표를 기준으로 7시간 이상 수면을 확보하세요.'),
    relatedDateKey: event.dateKey,
    shiftTypeId: event.shiftTypeId,
    shiftName: options.shiftName === undefined ? event.shiftName : options.shiftName,
    usesFallbackAlarmLead,
    transitionModeKind: options.transitionModeKind ?? null,
  };
}

function regularSleepWindow(data: AppData, now: Date): SleepTimingWindow {
  const today = toDateKey(now);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  let sleepDateKey =
    minutesNow < DEFAULT_NIGHT_CORE_END_MINUTES ? addDays(today, -1) : today;

  const resolveWindow = (dateKey: string) => {
    const endDateKey = addDays(dateKey, 1);
    const endDateEvent = resolveWorkEvent(data, endDateKey);
    const defaultEndAt = dateAtMinutes(
      endDateKey,
      DEFAULT_NIGHT_CORE_END_MINUTES,
    ).getTime();
    const endDateWake = endDateEvent
      ? wakeAt(data, endDateEvent).timestamp
      : null;
    const endAt =
      endDateWake !== null && endDateWake < defaultEndAt
        ? endDateWake
        : defaultEndAt;

    const targetStartAt = Math.min(
      dateAtMinutes(dateKey, DEFAULT_REGULAR_SLEEP_START_MINUTES).getTime(),
      endAt - SLEEP_TIMING_MAIN_MINUTES * 60_000,
    );

    return {
      endAt,
      endDateEvent,
      startAt: targetStartAt,
    };
  };

  let window = resolveWindow(sleepDateKey);
  if (window.endAt <= now.getTime()) {
    sleepDateKey = addDays(sleepDateKey, 1);
    window = resolveWindow(sleepDateKey);
  }

  return {
    id: `sleep:regular:${sleepDateKey}`,
    kind: 'regular',
    title: window.endDateEvent ? '일반 수면' : '휴무일 일반 수면',
    startAt: window.startAt,
    endAt: window.endAt,
    bedtimeRangeStartAt:
      window.endAt - SLEEP_TIMING_MAXIMUM_MINUTES * 60_000,
    bedtimeRangeEndAt:
      window.endAt - SLEEP_TIMING_MINIMUM_MINUTES * 60_000,
    guidance: window.endDateEvent
      ? '다음 근무의 기상 시각을 넘기지 않도록 수면 시간을 확보하세요.'
      : '휴무일에도 기상 시각을 크게 늦추지 말고 생활 리듬을 유지하세요.',
    relatedDateKey: null,
    shiftTypeId: null,
    shiftName: null,
    usesFallbackAlarmLead: false,
    transitionModeKind: null,
  };
}

function workSafeRegularSleepWindow(
  data: AppData,
  now: Date,
): SleepTimingWindow {
  for (let offset = 0; offset <= SLEEP_TIMING_HORIZON_DAYS + 2; offset += 1) {
    const reference = new Date(now);
    reference.setDate(reference.getDate() + offset);
    const candidate = fitSleepWindowAroundWork(
      data,
      regularSleepWindow(data, reference),
    );
    if (candidate && candidate.endAt > now.getTime()) return candidate;
  }

  // 근무표가 비정상적으로 모든 일반 수면대를 덮는 경우에도 반환 계약은 유지해요.
  // 실제 화면에서는 가까운 근무별 수면 창이 우선 선택돼요.
  return regularSleepWindow(data, now);
}

function createFirstNightWindows(
  data: AppData,
  event: WorkEvent,
  previousEvent: WorkEvent | null,
): SleepTimingWindow[] {
  const wake = wakeAt(data, event);
  const napEndAt = wake.timestamp;
  const napStartAt = napEndAt - SLEEP_TIMING_NIGHT_NAP_MINUTES * 60_000;
  const napPrepStartAt =
    napStartAt - SLEEP_TIMING_NIGHT_NAP_PREP_MINUTES * 60_000;
  // 첫 야간 날에는 전날 주간 알람(05:10)을 그대로 재사용하지 않아요.
  // 기본적으로 23:00~07:00 주수면을 확보하되, 이른 야간은 보충 수면 준비 전에
  // 주수면을 끝내도록 당겨 두 수면 창이 겹치지 않게 해요.
  const defaultCoreEndAt = dateAtMinutes(
    event.dateKey,
    DEFAULT_NIGHT_CORE_END_MINUTES,
  ).getTime();
  const coreEndAt = Math.min(defaultCoreEndAt, napPrepStartAt);
  const coreStartAt = coreEndAt - SLEEP_TIMING_MAIN_MINUTES * 60_000;
  const transitionModeKind: SleepTimingTransitionModeKind =
    previousEvent && !isNightShift(previousEvent.shift)
      ? 'day-to-night'
      : 'off-to-night';
  const core = createWorkWindow(
    event,
    'night-core',
    coreStartAt,
    coreEndAt,
    wake.usesFallback,
    {
      guidance:
        coreEndAt < defaultCoreEndAt
          ? '이른 야간 근무 전에는 보충 수면 준비와 겹치지 않도록 주수면을 먼저 마치세요.'
          : previousEvent && !isNightShift(previousEvent.shift)
          ? '주간 근무를 마친 밤에는 아침 07시까지 주수면을 확보하고, 오후에 보충 수면을 추가하세요.'
          : '첫 야간 전에는 아침까지 주수면을 확보하고 오후에 한 번 더 쉬세요.',
      transitionModeKind,
    },
  );

  const nap =
    napStartAt >= coreEndAt
      ? createWorkWindow(
          event,
          'pre-night-nap',
          napStartAt,
          napEndAt,
          wake.usesFallback,
          {
            bedtimeRangeStartAt: napPrepStartAt,
            bedtimeRangeEndAt: napStartAt,
            guidance: `${event.shiftName} 전 90분 보충 수면을 위해 10분 전부터 준비하세요.`,
            transitionModeKind,
          },
        )
      : null;

  return [core, nap].filter((item): item is SleepTimingWindow => item !== null);
}

function createPostNightWindows(data: AppData, event: WorkEvent): SleepTimingWindow[] {
  const endAt = workEndAt(event);
  const earliestSleepAt =
    endAt + postShiftBufferMinutes(data, event) * MINUTE_IN_MS;

  const endDateKey = event.shift.endsNextDay
    ? addDays(event.dateKey, 1)
    : event.dateKey;
  const nextEvent = resolveWorkEvent(data, endDateKey);
  if (
    nextEvent &&
    nextEvent.dateKey !== event.dateKey &&
    isNightShift(nextEvent.shift) &&
    workStartAt(nextEvent) > endAt
  ) {
    const nextWakeAt = wakeAt(data, nextEvent).timestamp;
    const startAt = Math.max(
      earliestSleepAt,
      nextWakeAt - SLEEP_TIMING_MAIN_MINUTES * 60_000,
    );
    const window = createWorkWindow(
      event,
      'post-night',
      startAt,
      nextWakeAt,
      false,
      {
        bedtimeRangeStartAt: earliestSleepAt,
        bedtimeRangeEndAt: Math.max(
          earliestSleepAt,
          nextWakeAt - SLEEP_TIMING_MINIMUM_MINUTES * 60_000,
        ),
        guidance: `퇴근 후 가능한 빨리 주무시고 다음 ${nextEvent.shiftName} 기상까지 주수면을 확보하세요.`,
        title: `연속 ${event.shiftName} 사이 주수면`,
      },
    );
    return window ? [window] : [];
  }

  const recoveryEndAt =
    earliestSleepAt + SLEEP_TIMING_LAST_NIGHT_RECOVERY_MINUTES * 60_000;
  const transitionModeKind: SleepTimingTransitionModeKind =
    nextEvent && !isNightShift(nextEvent.shift)
      ? 'night-to-day'
      : 'night-to-off';
  const recovery = createWorkWindow(
    event,
    'post-night',
    earliestSleepAt,
    recoveryEndAt,
    false,
    {
      bedtimeRangeStartAt: earliestSleepAt,
      bedtimeRangeEndAt:
        earliestSleepAt + LAST_NIGHT_RECOVERY_BEDTIME_RANGE_MINUTES * 60_000,
      guidance:
        '마지막 야간 뒤에는 회복 수면을 오후 초반에 마치고 밤 수면으로 전환하세요.',
      transitionModeKind,
    },
  );

  const followingDateKey = addDays(endDateKey, 1);
  const upcomingEvent = [1, 2, 3]
    .map((offset) => resolveWorkEvent(data, addDays(endDateKey, offset)))
    .find((candidate): candidate is WorkEvent => candidate !== null);
  let transition: SleepTimingWindow | null = null;
  const shouldReturnToDayRhythm = !upcomingEvent || !isNightShift(upcomingEvent.shift);
  if (shouldReturnToDayRhythm && upcomingEvent?.dateKey !== followingDateKey) {
    const transitionEndAt = dateAtMinutes(
      followingDateKey,
      DEFAULT_NIGHT_CORE_END_MINUTES,
    ).getTime();
    const transitionStartAt = Math.min(
      dateAtMinutes(endDateKey, DEFAULT_REGULAR_SLEEP_START_MINUTES).getTime(),
      transitionEndAt - SLEEP_TIMING_MAIN_MINUTES * 60_000,
    );
    transition = createWorkWindow(
      event,
      'off-transition',
      transitionStartAt,
      transitionEndAt,
      false,
      {
        bedtimeRangeStartAt:
          transitionEndAt - SLEEP_TIMING_MAXIMUM_MINUTES * 60_000,
        bedtimeRangeEndAt:
          transitionEndAt - SLEEP_TIMING_MINIMUM_MINUTES * 60_000,
        guidance:
          transitionModeKind === 'night-to-day'
            ? '이어진 주간 근무를 마친 뒤 다음 기상 시각에 맞춰 수면을 확보하는 참고 일정이에요.'
            : '당일 밤에는 평소 시간대에 다시 주무시고 휴무 리듬으로 전환하세요.',
        shiftName: null,
        title:
          transitionModeKind === 'night-to-day'
            ? '야간 → 주간 후 수면'
            : undefined,
        transitionModeKind,
      },
    );
  }

  return [recovery, transition].filter(
    (window): window is SleepTimingWindow => window !== null,
  );
}

function buildWorkWindows(
  data: AppData,
  now: Date,
  horizonDays: number,
): SleepTimingWindow[] {
  if (!data.settings.setupCompleted) return [];

  const today = toDateKey(now);
  const firstDateKey = addDays(today, -1);
  const windows: SleepTimingWindow[] = [];

  for (let offset = 0; offset <= horizonDays + 1; offset += 1) {
    const dateKey = addDays(firstDateKey, offset);
    const event = resolveWorkEvent(data, dateKey);
    if (!event) continue;

    if (!isNightShift(event.shift)) {
      const wake = wakeAt(data, event);
      const previousEvent = resolveWorkEvent(data, addDays(dateKey, -1));
      const transitionModeKind: SleepTimingTransitionModeKind | null =
        previousEvent && isNightShift(previousEvent.shift)
          ? 'night-to-day'
          : previousEvent
            ? null
            : 'off-to-day';
      const main = createWorkWindow(
        event,
        'main',
        wake.timestamp - SLEEP_TIMING_MAIN_MINUTES * 60_000,
        wake.timestamp,
        wake.usesFallback,
        {
          guidance: `${event.shiftName} 기상 시각을 기준으로 8시간 수면을 목표로 하세요.`,
          title:
            transitionModeKind === 'off-to-day'
              ? `${event.shiftName} 전환 수면`
              : undefined,
          transitionModeKind,
        },
      );
      if (main) windows.push(main);
      continue;
    }

    const previousEvent = resolveWorkEvent(data, addDays(dateKey, -1));
    if (!previousEvent || !isNightShift(previousEvent.shift)) {
      windows.push(...createFirstNightWindows(data, event, previousEvent));
    }

    windows.push(...createPostNightWindows(data, event));
  }

  const unique = new Map<string, SleepTimingWindow>();
  windows.forEach((window) => {
    const fitted = fitSleepWindowAroundWork(data, window);
    if (fitted) unique.set(fitted.id, fitted);
  });
  return [...unique.values()];
}

function findActiveFirstNightTransition(
  windows: SleepTimingWindow[],
  nowTimestamp: number,
): SleepTimingTransition | null {
  const coreWindows = windows
    .filter((window) => window.kind === 'night-core' && window.relatedDateKey)
    .sort((left, right) => left.endAt - right.endAt);

  for (const core of coreWindows) {
    const nap = windows.find(
      (window) =>
        window.kind === 'pre-night-nap' &&
        window.relatedDateKey === core.relatedDateKey,
    );
    if (!nap || !core.relatedDateKey || !core.shiftTypeId || !core.shiftName) continue;

    const transitionEndAt = Math.min(nap.bedtimeRangeStartAt, nap.startAt);
    if (core.endAt > nowTimestamp || nowTimestamp >= transitionEndAt) continue;

    return {
      id: `sleep-transition:first-night:${core.relatedDateKey}`,
      kind: 'first-night-awake',
      title: '야간 전환 시간',
      startAt: core.endAt,
      endAt: transitionEndAt,
      nextSleepStartAt: nap.startAt,
      nextWakeAt: nap.endAt,
      guidance:
        '주수면 종료부터 보충 수면 준비까지 깨어 있는 전환 구간이에요. 보충 수면 전에 개인 일정을 마무리하세요.',
      relatedDateKey: core.relatedDateKey,
      shiftTypeId: core.shiftTypeId,
      shiftName: core.shiftName,
    };
  }

  return null;
}

const TRANSITION_MODE_COPY: Record<
  SleepTimingTransitionModeKind,
  Pick<SleepTimingTransitionMode, 'title' | 'guidance'>
> = {
  'day-to-night': {
    title: '주간 → 야간 전환',
    guidance:
      '주수면·깨어 있는 전환 구간·오후 보충 수면을 이어서 확인하는 참고 일정이에요.',
  },
  'off-to-night': {
    title: '휴무 → 야간 전환',
    guidance: '밤 주수면과 오후 보충 수면을 나눠 다음 야간을 준비하는 일정 참고예요.',
  },
  'night-to-off': {
    title: '야간 → 휴무 전환',
    guidance: '퇴근 뒤 회복 수면을 짧게 마치고 당일 밤 수면으로 돌아가는 일정 참고예요.',
  },
  'night-to-day': {
    title: '야간 → 주간 전환',
    guidance: '두 근무 사이에 계산된 수면 시간을 확인하고 실제 일정에 맞춰 조정하세요.',
  },
  'off-to-day': {
    title: '휴무 → 주간 전환',
    guidance: '다음 주간 기상 시각에 맞춰 전날 취침 시각을 앞당기는 일정 참고예요.',
  },
};

function findRelevantTransitionMode(
  windows: SleepTimingWindow[],
  nowTimestamp: number,
): SleepTimingTransitionMode | null {
  const groups = new Map<
    string,
    {
      kind: SleepTimingTransitionModeKind;
      windows: SleepTimingWindow[];
    }
  >();

  windows.forEach((window) => {
    if (!window.transitionModeKind || !window.relatedDateKey) return;
    const key = `${window.transitionModeKind}:${window.relatedDateKey}`;
    const current = groups.get(key);
    if (current) {
      current.windows.push(window);
      return;
    }
    groups.set(key, {
      kind: window.transitionModeKind,
      windows: [window],
    });
  });

  const candidates = [...groups.values()]
    .map((candidate) => {
      const sortedWindows = [...candidate.windows].sort(
        (left, right) => left.startAt - right.startAt,
      );
      return {
        ...candidate,
        windows: sortedWindows,
        startAt: Math.min(
          ...sortedWindows.map((window) => window.bedtimeRangeStartAt),
        ),
        endAt: Math.max(...sortedWindows.map((window) => window.endAt)),
      };
    })
    .filter(
      (candidate) =>
        candidate.endAt > nowTimestamp &&
        candidate.startAt - nowTimestamp <= TRANSITION_MODE_LOOKAHEAD_MS,
    )
    .sort((left, right) => {
      const leftActive = left.startAt <= nowTimestamp;
      const rightActive = right.startAt <= nowTimestamp;
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      return left.startAt - right.startAt;
    });

  const selected = candidates[0];
  if (!selected) return null;

  return {
    kind: selected.kind,
    ...TRANSITION_MODE_COPY[selected.kind],
    windowIds: selected.windows.map((window) => window.id),
  };
}

function compareWindows(left: SleepTimingWindow, right: SleepTimingWindow, now: number): number {
  const leftActive = left.startAt <= now && now < left.endAt;
  const rightActive = right.startAt <= now && now < right.endAt;
  if (leftActive !== rightActive) return leftActive ? -1 : 1;
  if (left.startAt !== right.startAt) return left.startAt - right.startAt;
  return left.id.localeCompare(right.id);
}

/**
 * 근무표에 맞춘 수면 시간 예시를 계산합니다.
 * 건강 상태를 판단하지 않으며, 저장 데이터나 알람 예약을 변경하지 않습니다.
 */
export function buildSleepTimingGuidance(
  data: AppData,
  options: BuildSleepTimingGuidanceOptions = {},
): SleepTimingGuidance {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('수면 타이밍 계산 시각이 올바르지 않습니다.');
  }

  const horizonDays = options.horizonDays ?? SLEEP_TIMING_HORIZON_DAYS;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 14) {
    throw new RangeError('수면 타이밍 계산 일수는 1일부터 14일까지의 정수여야 합니다.');
  }

  const additionalLimit = options.additionalLimit ?? 2;
  if (!Number.isInteger(additionalLimit) || additionalLimit < 0 || additionalLimit > 10) {
    throw new RangeError('추가 수면 타이밍 수는 0개부터 10개까지의 정수여야 합니다.');
  }

  const nowTimestamp = now.getTime();
  const regular = workSafeRegularSleepWindow(data, now);
  const allWorkWindows = buildWorkWindows(data, now, horizonDays);
  const transition = findActiveFirstNightTransition(allWorkWindows, nowTimestamp);
  const transitionMode = findRelevantTransitionMode(allWorkWindows, nowTimestamp);
  const workWindows = allWorkWindows
    .filter((window) => window.endAt > nowTimestamp)
    .sort((left, right) => compareWindows(left, right, nowTimestamp));
  const activeWork = workWindows.find(
    (window) => window.startAt <= nowTimestamp && nowTimestamp < window.endAt,
  );
  const nearbyWork = workWindows.find(
    (window) =>
      window.startAt >= nowTimestamp &&
      window.startAt - nowTimestamp <= WORK_WINDOW_PRIORITY_MS,
  );
  const primary = activeWork ?? nearbyWork ?? regular;

  const additionalCandidates = workWindows
    .filter((window) => window.id !== primary.id && window.endAt > nowTimestamp)
    .sort((left, right) => compareWindows(left, right, nowTimestamp));
  const uniqueAdditional = new Map<string, SleepTimingWindow>();
  additionalCandidates.forEach((window) => uniqueAdditional.set(window.id, window));

  return {
    primary,
    additional: [...uniqueAdditional.values()].slice(0, additionalLimit),
    transition,
    transitionMode,
  };
}
