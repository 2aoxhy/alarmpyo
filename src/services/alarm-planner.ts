import {
  MAX_ALARM_MINUTES_BEFORE,
  type AppData,
  type DayExceptionType,
  type ShiftType,
} from '../models/app-data';
import { addDays, dateAtMinutes, toDateKey } from '../utils/date';
import { getDayExceptionLabel, usesDayAlarmForException } from '../utils/day-exception';
import {
  getDayAlarmOverrideLeadMinutes,
  getDayAlarmOverrideWakeAt,
  resolveDayAlarmOverrideFromAppData,
  resolveEffectiveDayFromAppData,
} from './app-data-service';

/**
 * 네이티브 계층이 앱을 다시 열지 않아도 다음 알람을 이어서 예약할 수 있도록
 * 윤년을 포함한 1년을 안전하게 덮도록 최대 366일의 근무 계획을 한 번에 전달해요.
 */
export const ALARM_PLAN_HORIZON_DAYS = 366;
export const ALARM_PLAN_REFRESH_RECOMMENDED_DAYS = 90;

export type AlarmPyoAlarmSyncMetadata = {
  generatedAt: number;
  refreshRecommendedAt: number;
  safetyThroughAt: number;
};

export type AlarmPyoAlarmPlan = {
  id: string;
  dateKey: string;
  shiftTypeId: string;
  shiftName: string;
  alarmAt: number;
  startMinutes: number;
  alarmMinutesBefore: number;
};

export type BuildAlarmPyoAlarmPlanOptions = {
  now?: Date;
  horizonDays?: number;
  /**
   * 상태 점검처럼 가까운 알람만 필요할 때 계산을 일찍 끝내요.
   * 실제 네이티브 동기화에는 이 값을 생략해 366일 계획을 그대로 전달해요.
   */
  maxAlarms?: number;
};

export function buildAlarmPyoAlarmSyncMetadata(
  now: Date = new Date(),
): AlarmPyoAlarmSyncMetadata {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('알람 갱신 계산 기준 시각이 올바르지 않아요.');
  }
  const generatedAt = now.getTime();
  const refreshRecommendedAt = new Date(now.getTime());
  refreshRecommendedAt.setDate(
    refreshRecommendedAt.getDate() + ALARM_PLAN_REFRESH_RECOMMENDED_DAYS,
  );
  const safetyThroughAt = dateAtMinutes(
    addDays(toDateKey(now), ALARM_PLAN_HORIZON_DAYS),
    0,
  );
  return {
    generatedAt,
    refreshRecommendedAt: refreshRecommendedAt.getTime(),
    safetyThroughAt: safetyThroughAt.getTime(),
  };
}

const SUBSTITUTE_SHIFT_ID_PREFIX = 'substitute-';
const NATIVE_SUBSTITUTE_SHIFT_ID = 'substitute';
const ALARM_PLAN_POLICY_VERSION = 3;

function nativeShiftTypeId(shift: ShiftType): string {
  return shift.id.startsWith(SUBSTITUTE_SHIFT_ID_PREFIX)
    ? NATIVE_SUBSTITUTE_SHIFT_ID
    : shift.id;
}

/**
 * 네이티브 알람 화면은 주간·야간 대체근무를 하나의 표시 종류로 받아요.
 * 앱 안에서는 이름을 함께 비교해 원래 대체근무 설정과 다시 연결해요.
 */
export function resolveAlarmPyoAlarmShift(
  shiftTypes: readonly ShiftType[],
  alarm: Pick<AlarmPyoAlarmPlan, 'shiftName' | 'shiftTypeId'>,
): ShiftType | null {
  const exact = shiftTypes.find((shift) => shift.id === alarm.shiftTypeId);
  if (exact) return exact;
  if (alarm.shiftTypeId !== NATIVE_SUBSTITUTE_SHIFT_ID) return null;

  return (
    shiftTypes.find(
      (shift) =>
        shift.id.startsWith(SUBSTITUTE_SHIFT_ID_PREFIX) &&
        shift.name === alarm.shiftName,
    ) ?? null
  );
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name}은(는) 0 이상의 정수여야 해요.`);
  }
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function createAlarmId(dateKey: string, shift: ShiftType, alarmAt: number): string {
  return `alarmpyo-alarm:${stableHash(`${ALARM_PLAN_POLICY_VERSION}|${dateKey}|${shift.id}|${alarmAt}`)}`;
}

/**
 * 교육·예비군 일정은 원래 순번이 야간이나 휴무여도 주간 근무의 기상 알람을 사용해요.
 * 날짜별 임시 시간보다 설정에 저장된 주간 알람을 우선해 일관되게 예약해요.
 */
export function resolveAlarmPyoAlarmSourceShift(
  data: AppData,
  dateKey: string,
  scheduledShift: ShiftType | null,
  dayException: DayExceptionType | null | undefined = data.dayExceptions[dateKey],
): ShiftType | null {
  const effectiveDay = resolveEffectiveDayFromAppData(data, dateKey, {
    scheduledShift,
    dayException,
  });
  const effectiveShift = effectiveDay.shift;
  if (effectiveShift && usesDayAlarmForException(effectiveDay.dayException)) {
    return {
      ...effectiveShift,
      name: getDayExceptionLabel(effectiveDay.dayException),
      shortName: effectiveDay.dayException === 'training' ? '교' : '예',
    };
  }
  return effectiveShift?.isOff ? null : effectiveShift;
}

export function buildAlarmPyoAlarmPlan(
  data: AppData,
  resolveShift: (dateKey: string) => ShiftType | null,
  options: BuildAlarmPyoAlarmPlanOptions = {},
): AlarmPyoAlarmPlan[] {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('알람 계산 기준 시각이 올바르지 않아요.');
  }

  const horizonDays = options.horizonDays ?? ALARM_PLAN_HORIZON_DAYS;
  assertNonNegativeInteger(horizonDays, '알람 계산 일수');
  const maxAlarms = options.maxAlarms;
  if (maxAlarms !== undefined) {
    assertNonNegativeInteger(maxAlarms, '알람 계산 개수');
  }

  if (
    !data.settings.setupCompleted ||
    !data.settings.notificationsEnabled ||
    horizonDays === 0 ||
    maxAlarms === 0
  ) {
    return [];
  }

  const firstDateKey = toDateKey(now);
  const nowTimestamp = now.getTime();
  const plans: AlarmPyoAlarmPlan[] = [];

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const dateKey = addDays(firstDateKey, offset);
    const shift = resolveAlarmPyoAlarmSourceShift(data, dateKey, resolveShift(dateKey));
    if (!shift || shift.isOff || shift.startMinutes === null) continue;
    const alarmOverride = resolveDayAlarmOverrideFromAppData(
      data,
      dateKey,
      shift,
    );
    if (alarmOverride?.mode === 'disabled') continue;

    let alarmAt: number;
    let alarmMinutesBefore: number;
    if (alarmOverride?.mode === 'wake-time') {
      const overrideLead = getDayAlarmOverrideLeadMinutes(
        dateKey,
        shift,
        alarmOverride,
      );
      // resolveDayAlarmOverrideFromAppData가 같은 조건을 확인하지만 데이터가
      // 계산 중 바뀌어도 전역 알람으로 안전하게 되돌아가도록 방어해요.
      if (overrideLead === null) continue;
      alarmAt = getDayAlarmOverrideWakeAt(dateKey, alarmOverride);
      alarmMinutesBefore = overrideLead;
    } else {
      if (!shift.alarmEnabled) continue;
      if (
        !Number.isInteger(shift.alarmMinutesBefore) ||
        shift.alarmMinutesBefore < 0 ||
        shift.alarmMinutesBefore > MAX_ALARM_MINUTES_BEFORE
      ) {
        throw new RangeError(`${shift.name} 근무의 알람 준비 시간이 올바르지 않아요.`);
      }
      alarmMinutesBefore = shift.alarmMinutesBefore;
      alarmAt =
        dateAtMinutes(dateKey, shift.startMinutes).getTime() - alarmMinutesBefore * 60_000;
    }
    // 이미 네이티브에 예약된 임박한 알람도 동기화 계획에 남겨야 합니다.
    // 미래 시각인 동안은 거리와 관계없이 네이티브 계층에 전달합니다.
    if (alarmAt <= nowTimestamp) continue;

    plans.push({
      id: createAlarmId(dateKey, shift, alarmAt),
      dateKey,
      shiftTypeId: nativeShiftTypeId(shift),
      shiftName: shift.name,
      alarmAt,
      startMinutes: shift.startMinutes,
      alarmMinutesBefore,
    });
    if (maxAlarms !== undefined && plans.length >= maxAlarms) break;
  }

  plans.sort((left, right) => {
    const timeDifference = left.alarmAt - right.alarmAt;
    return timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id);
  });
  return plans;
}
