import type { AppData, ShiftType } from '../models/app-data';
import {
  ALARM_PLAN_HORIZON_DAYS,
} from './alarm-planner';
import { getCachedDailyAlarmProjection } from './schedule-projection-cache';
import type { AlarmPyoAlarmStatus } from './alarmpyo-alarm-service';
import type { SleepReminderStatus } from './sleep-reminder-service';
import type { AlarmAutoCheckStatus } from './alarm-sync-policy';
import { resolveAlarmHealthState } from './alarm-access-summary';
import {
  getScheduleStartDate,
  resolveDayExceptionFromAppData,
} from './app-data-service';
import { buildSleepTimingGuidance } from './sleep-timing-planner';
import { buildWorkRoutinePlan } from './work-routine-planner';
import {
  addDays,
  dateAtMinutes,
  formatAlarmCountdown,
  formatCompactTime,
  formatKoreanDate,
  formatMinutes,
  parseDateKey,
  toDateKey,
} from '../utils/date';
import { getDayExceptionLabel } from '../utils/day-exception';
import { isUpcomingShift } from '../utils/upcoming-shift';

export type ShiftMoment = {
  dateKey: string;
  shift: ShiftType;
  startsAt: Date;
  endsAt: Date;
};

export type TodayAlarmPlanSummary = {
  plannedAlarmCount: number;
};

export type TodayAlarmSummary = {
  title: string;
  description?: string;
};

/**
 * 366일 알람 계획은 분 단위 화면 갱신과 분리하여 계산합니다.
 * 호출부는 앱 데이터나 날짜가 바뀔 때만 이 값을 다시 만듭니다.
 */
export function buildTodayAlarmPlanSummary(input: {
  data: AppData;
  now: Date;
  resolveShift: (dateKey: string) => ShiftType | null;
}): TodayAlarmPlanSummary {
  return {
    plannedAlarmCount: getCachedDailyAlarmProjection(
      input.data,
      input.resolveShift,
      input.now,
    ).length,
  };
}

function shiftMoment(dateKey: string, shift: ShiftType): ShiftMoment | null {
  if (shift.isOff || shift.startMinutes === null || shift.endMinutes === null) {
    return null;
  }
  const startsAt = dateAtMinutes(dateKey, shift.startMinutes);
  const endDate = shift.endsNextDay ? addDays(dateKey, 1) : dateKey;
  const endsAt = dateAtMinutes(endDate, shift.endMinutes);
  return { dateKey, shift, startsAt, endsAt };
}

function remainingLabel(target: Date, now: Date) {
  const minutes = Math.max(
    0,
    Math.ceil((target.getTime() - now.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}분 남음`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest ? `${hours}시간 ${rest}분 남음` : `${hours}시간 남음`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours
    ? `${days}일 ${remainingHours}시간 남음`
    : `${days}일 남음`;
}

function shiftTimeLabel(shift: ShiftType) {
  return `${formatMinutes(shift.startMinutes)}부터 ${shift.endsNextDay ? '다음 날 ' : ''}${formatMinutes(shift.endMinutes)}까지`;
}

const STANDARD_WORK_SHIFT_IDS = new Set([
  'day',
  'evening',
  'night',
  'substitute-day',
  'substitute-night',
]);

function workLabel(shift: ShiftType) {
  return STANDARD_WORK_SHIFT_IDS.has(shift.id) ? `${shift.name} 근무` : shift.name;
}

function alarmTimeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function alarmDateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export function buildTodayViewModel(input: {
  data: AppData;
  now: Date;
  resolveShift: (dateKey: string) => ShiftType | null;
  alarmPlanSummary: TodayAlarmPlanSummary;
  alarmStatus: AlarmPyoAlarmStatus | null;
  alarmStatusError: boolean;
  alarmAutoCheckStatus?: AlarmAutoCheckStatus;
  alarmSyncFailed?: boolean;
  alarmPlatformSupported: boolean;
  sleepReminderStatus?: SleepReminderStatus | null;
  sleepReminderStatusError?: boolean;
  sleepReminderSupported?: boolean;
  sleepReminderSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  compactHome: boolean;
}) {
  const {
    data,
    now,
    resolveShift,
    alarmPlanSummary,
    alarmStatus,
    alarmStatusError,
    alarmAutoCheckStatus = 'idle',
    alarmSyncFailed = false,
    alarmPlatformSupported,
    sleepReminderStatus = null,
    sleepReminderStatusError = false,
    sleepReminderSupported = false,
    sleepReminderSyncStatus = 'idle',
    compactHome,
  } = input;
  const today = toDateKey(now);
  const possibleCurrent = [addDays(today, -1), today]
    .map((dateKey) => {
      const shift = resolveShift(dateKey);
      return shift ? shiftMoment(dateKey, shift) : null;
    })
    .filter((item): item is ShiftMoment => item !== null);
  const current = possibleCurrent.find(
    (item) =>
      item.startsAt.getTime() <= now.getTime() &&
      now.getTime() < item.endsAt.getTime(),
  );
  const todayShift = resolveShift(today);
  const scheduleStartDate = getScheduleStartDate(data);
  const scheduleHasStarted = today >= scheduleStartDate;
  const todayException = resolveDayExceptionFromAppData(data, today);
  const activeException = current
    ? resolveDayExceptionFromAppData(data, current.dateKey)
    : todayException;
  const todayMoment = todayShift ? shiftMoment(today, todayShift) : null;

  let nextWork: ShiftMoment | null = null;
  const upcomingWorkDays: ShiftMoment[] = [];
  for (
    let offset = 0;
    offset < ALARM_PLAN_HORIZON_DAYS &&
    (!nextWork || upcomingWorkDays.length < 3);
    offset += 1
  ) {
    const dateKey = addDays(today, offset);
    const shift = resolveShift(dateKey);
    if (!shift) continue;
    const moment = shiftMoment(dateKey, shift);
    if (!moment || !isUpcomingShift(moment, now)) continue;
    if (!nextWork) nextWork = moment;
    if (upcomingWorkDays.length < 3) upcomingWorkDays.push(moment);
  }

  const homeState = current
    ? 'working'
    : todayShift?.isOff
      ? 'off'
      : todayMoment && now.getTime() < todayMoment.startsAt.getTime()
        ? 'before'
        : todayMoment && now.getTime() >= todayMoment.endsAt.getTime()
          ? 'finished'
          : todayShift
            ? 'before'
            : 'empty';
  const heroTitle =
    homeState === 'working'
      ? activeException
        ? `${getDayExceptionLabel(activeException)} 중`
        : `${workLabel(current!.shift)} 중`
      : homeState === 'before'
        ? todayException
          ? `오늘은 ${getDayExceptionLabel(todayException)}`
          : `오늘은 ${workLabel(todayShift!)}`
        : homeState === 'finished'
          ? todayException
            ? `${getDayExceptionLabel(todayException)} 완료`
            : `${workLabel(todayShift!)} 완료`
          : homeState === 'off'
            ? todayException
              ? `오늘은 ${getDayExceptionLabel(todayException)}`
              : '오늘은 휴무'
            : scheduleHasStarted
              ? '오늘 일정 없음'
              : '근무표 시작 전';
  const heroDetail =
    homeState === 'working'
      ? shiftTimeLabel(current!.shift)
      : homeState === 'before'
        ? shiftTimeLabel(todayShift!)
        : homeState === 'finished'
          ? '오늘 근무를 마쳤습니다.\n다음 근무도 미리 확인해야 합니다.'
          : homeState === 'off'
            ? todayException === 'leave'
              ? '근무 알람은 울리지 않습니다.\n기본 근무표는 그대로 유지됩니다.'
              : todayException
                ? `${getDayExceptionLabel(todayException)} 일정이 등록되어 있습니다.\n필요하면 근무 시간을 확인해야 합니다.`
                : '오늘은 충분히 쉬고\n다음 근무를 준비해야 합니다.'
            : scheduleHasStarted
              ? '달력에서 오늘 근무를\n선택해야 합니다.'
              : `${formatKoreanDate(scheduleStartDate, true)}부터\n일정이 시작됩니다.`;
  const nextWorkException = nextWork
    ? resolveDayExceptionFromAppData(data, nextWork.dateKey)
    : undefined;
  const nextWorkDetail = nextWork
    ? compactHome
      ? `${parseDateKey(nextWork.dateKey).getMonth() + 1}월 ${parseDateKey(nextWork.dateKey).getDate()}일 · ${formatCompactTime(nextWork.shift.startMinutes)}`
      : `${formatKoreanDate(nextWork.dateKey)} · ${formatMinutes(nextWork.shift.startMinutes)} 시작`
    : `${ALARM_PLAN_HORIZON_DAYS}일 내 예정 근무 없음`;
  const footerLabel =
    homeState === 'working'
      ? '퇴근까지'
      : homeState === 'before'
        ? '근무 시작까지'
        : nextWork
          ? `다음 근무: ${nextWorkException ? getDayExceptionLabel(nextWorkException) : nextWork.shift.name}`
          : '다음 근무';
  const footerValue =
    homeState === 'working'
      ? remainingLabel(current!.endsAt, now)
      : homeState === 'before' && todayMoment
        ? remainingLabel(todayMoment.startsAt, now)
        : nextWorkDetail;
  const statusLabel =
    homeState === 'working'
      ? '현재 근무 중'
      : homeState === 'before'
        ? '근무 전'
        : homeState === 'finished'
          ? '오늘 근무 완료'
          : homeState === 'off'
            ? '휴무 중'
            : scheduleHasStarted
              ? '일정 없음'
              : '시작 전';

  const scheduledAlarms = alarmStatus?.scheduledAlarms.slice(0, 3) ?? [];
  const scheduledAlarmCount =
    alarmStatus?.scheduledCount ?? data.settings.scheduledNotificationCount;
  const alarmHealthState = resolveAlarmHealthState({
    actualScheduledCount: scheduledAlarmCount,
    alarmAutoCheckStatus,
    alarmStatus,
    alarmStatusError,
    alarmSyncFailed,
    notificationsEnabled: data.settings.notificationsEnabled,
    now: now.getTime(),
    platformSupported: alarmPlatformSupported,
    sleepReminderEnabled: data.settings.sleepReminderEnabled,
    sleepReminderStatus,
    sleepReminderStatusError,
    sleepReminderSupported,
    sleepReminderSyncStatus,
    totalPlannedAlarmCount: alarmPlanSummary.plannedAlarmCount,
  });
  const alarmsReady = alarmHealthState.status === 'ready';
  const alarmStateLabel = !alarmPlatformSupported
    ? 'Android 앱에서만 사용할 수 있습니다'
    : !data.settings.notificationsEnabled
      ? '근무 알람을 사용하지 않습니다'
      : alarmHealthState.status === 'checking'
        ? '알람 상태를 확인하고 있습니다'
        : alarmHealthState.status === 'ready' && scheduledAlarms.length > 0
          ? '다음 근무 알람이 준비되었습니다'
          : alarmHealthState.status === 'ready'
            ? '예정된 근무 알람이 없습니다'
            : alarmHealthState.title;
  const nextScheduledAlarm = scheduledAlarms[0];
  const alarmSummary: TodayAlarmSummary = alarmsReady && nextScheduledAlarm
    ? {
        title: alarmStateLabel,
        description: `${alarmDateLabel(nextScheduledAlarm.alarmAt)} ${alarmTimeLabel(nextScheduledAlarm.alarmAt)} · ${nextScheduledAlarm.shiftName} · ${formatAlarmCountdown(nextScheduledAlarm.alarmAt, now)}`,
      }
    : alarmHealthState.status === 'ready'
      ? { title: alarmStateLabel }
      : {
          title: alarmHealthState.title,
          description: alarmHealthState.description,
        };

  return {
    today,
    current,
    todayShift,
    todayException,
    activeException,
    nextWork,
    upcomingWorkDays,
    nextWorkException,
    homeState,
    heroTitle,
    heroDetail,
    footerLabel,
    footerValue,
    statusLabel,
    editorDateKey: current?.dateKey ?? today,
    alarmHealthState,
    alarmsReady,
    scheduledAlarms,
    scheduledAlarmCount,
    alarmStateLabel,
    alarmSummary,
    sleepTimingGuidance: buildSleepTimingGuidance(data, {
      now,
      additionalLimit: compactHome ? 1 : 2,
    }),
    workRoutinePlan:
      !current && nextWork
        ? buildWorkRoutinePlan(
            nextWork.dateKey,
            nextWork.shift,
            now,
            data.settings.workRoutineProfiles,
          )
        : null,
  };
}
