import type { DayAlarmOverride, ShiftType } from '../../models/app-data';
import { formatTimeInput, parseTimeInput } from '../../utils/shift-time';

export type DayAlarmMode = 'default' | 'disabled' | 'wake-time';
export type WakeDayOffset = -1 | 0;

export type DayAlarmDraft = {
  mode: DayAlarmMode;
  wakeTime: string;
  wakeDayOffset: WakeDayOffset;
};

export type DayAlarmDraftResult =
  | { valid: true; override: DayAlarmOverride | null; leadMinutes: number | null }
  | { valid: false; message: string };

export function getDefaultWakeTime(shift: ShiftType | null | undefined): {
  wakeMinutes: number;
  wakeDayOffset: WakeDayOffset;
} | null {
  if (!shift || shift.startMinutes === null) return null;
  const absoluteWakeMinutes = shift.startMinutes - shift.alarmMinutesBefore;
  return {
    wakeMinutes: ((absoluteWakeMinutes % 1440) + 1440) % 1440,
    wakeDayOffset: absoluteWakeMinutes < 0 ? -1 : 0,
  };
}

export function createDayAlarmDraft(
  override: DayAlarmOverride | null | undefined,
  shift: ShiftType | null | undefined,
): DayAlarmDraft {
  const defaultWake = getDefaultWakeTime(shift) ?? {
    wakeMinutes: 0,
    wakeDayOffset: 0 as WakeDayOffset,
  };

  if (!override) {
    return {
      mode: 'default',
      wakeTime: formatTimeInput(defaultWake.wakeMinutes),
      wakeDayOffset: defaultWake.wakeDayOffset,
    };
  }
  if (override.mode === 'disabled') {
    return {
      mode: 'disabled',
      wakeTime: formatTimeInput(defaultWake.wakeMinutes),
      wakeDayOffset: defaultWake.wakeDayOffset,
    };
  }
  return {
    mode: 'wake-time',
    wakeTime: formatTimeInput(override.wakeMinutes),
    wakeDayOffset: override.wakeDayOffset,
  };
}

export function calculateWakeLeadMinutes(
  shiftStartMinutes: number,
  wakeMinutes: number,
  wakeDayOffset: WakeDayOffset,
): number | null {
  const absoluteWakeMinutes = wakeDayOffset * 1440 + wakeMinutes;
  const leadMinutes = shiftStartMinutes - absoluteWakeMinutes;
  return leadMinutes > 0 && leadMinutes <= 1440 ? leadMinutes : null;
}

export function resolveDayAlarmDraft(
  draft: DayAlarmDraft,
  shiftStartMinutes: number | null,
): DayAlarmDraftResult {
  if (draft.mode === 'default') {
    return { valid: true, override: null, leadMinutes: null };
  }
  if (draft.mode === 'disabled') {
    return { valid: true, override: { mode: 'disabled' }, leadMinutes: null };
  }
  if (shiftStartMinutes === null) {
    return { valid: false, message: '근무 시작 시간을 먼저 확인해야 합니다.' };
  }

  const wakeMinutes = parseTimeInput(draft.wakeTime);
  if (wakeMinutes === null) {
    return { valid: false, message: '기상 시각을 05:10 형식으로 입력해야 합니다.' };
  }
  const leadMinutes = calculateWakeLeadMinutes(
    shiftStartMinutes,
    wakeMinutes,
    draft.wakeDayOffset,
  );
  if (leadMinutes === null) {
    return {
      valid: false,
      message: '기상 시각은 근무 시작 전 24시간 안으로 지정해야 합니다.',
    };
  }

  return {
    valid: true,
    override: {
      mode: 'wake-time',
      wakeMinutes,
      wakeDayOffset: draft.wakeDayOffset,
    },
    leadMinutes,
  };
}

export function formatWakeDayLabel(offset: WakeDayOffset) {
  return offset === -1 ? '전날' : '당일';
}

export function formatDayAlarmOverrideSummary(
  override: DayAlarmOverride | null | undefined,
  shift: ShiftType,
) {
  if (override?.mode === 'disabled') return '이날만 알람 없음';
  const wake = override?.mode === 'wake-time' ? override : getDefaultWakeTime(shift);
  if (!wake) return '알람 시각 확인 필요';
  const suffix = override?.mode === 'wake-time' ? '이날만 설정' : '기본 설정';
  return `${formatWakeDayLabel(wake.wakeDayOffset)} ${formatTimeInput(
    wake.wakeMinutes,
  )} · ${suffix}`;
}

export function areDayAlarmOverridesEqual(
  left: DayAlarmOverride | null | undefined,
  right: DayAlarmOverride | null | undefined,
) {
  if (!left && !right) return true;
  if (!left || !right || left.mode !== right.mode) return false;
  if (left.mode === 'disabled' || right.mode === 'disabled') return true;
  return (
    left.wakeMinutes === right.wakeMinutes &&
    left.wakeDayOffset === right.wakeDayOffset
  );
}
