import {
  isQuickTimerDuration,
  QUICK_TIMER_MAX_DURATION_MINUTES,
  QUICK_TIMER_MIN_DURATION_MINUTES,
  type QuickTimerDuration,
} from '../../models/quick-timer';

import type { QuickTimerStatus } from './quick-timer-controller';

type QuickTimerRequiredAction = QuickTimerStatus['requiredAction'];

const SECOND_MS = 1_000;
const COUNTDOWN_BASE_SIZE = 48;
const COUNTDOWN_HORIZONTAL_RESERVE = 88;
const COUNTDOWN_WIDTH_FACTOR = 5.3;

export type QuickTimerActionPresentation = {
  title: string;
  message: string;
};

export type QuickTimerCountdownAnchor = {
  remainingMillis: number;
  observedAtMonotonic: number;
};

export type QuickTimerPresetColumns = 1 | 2 | 4;

export type QuickTimerDurationInputResult =
  | { valid: true; durationMinutes: QuickTimerDuration }
  | { valid: false; error: string };

export type QuickTimerKeypadToken =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '00';

export type QuickTimerKeypadPresentation = {
  minutes: string;
  seconds: string;
  durationMinutes: QuickTimerDuration | null;
  canStart: boolean;
  helperText: string;
  errorText: string | null;
  accessibilityLabel: string;
};

export const QUICK_TIMER_KEYPAD_MAX_DIGITS = 4;

export function parseQuickTimerDurationInput(
  input: string,
): QuickTimerDurationInputResult {
  const normalized = input.trim();
  if (normalized.length === 0) {
    return {
      valid: false,
      error: `${QUICK_TIMER_MIN_DURATION_MINUTES}분부터 ${QUICK_TIMER_MAX_DURATION_MINUTES}분까지 시간을 입력해야 합니다.`,
    };
  }
  if (!/^\d+$/u.test(normalized)) {
    return {
      valid: false,
      error: '분 단위의 정수만 입력해야 합니다.',
    };
  }

  const durationMinutes = Number(normalized);
  if (!isQuickTimerDuration(durationMinutes)) {
    return {
      valid: false,
      error: `${QUICK_TIMER_MIN_DURATION_MINUTES}분부터 ${QUICK_TIMER_MAX_DURATION_MINUTES}분까지 입력해야 합니다.`,
    };
  }
  return { valid: true, durationMinutes };
}

export function appendQuickTimerKeypadDigits(
  currentDigits: string,
  token: QuickTimerKeypadToken,
): string {
  const current = currentDigits
    .replace(/\D/gu, '')
    .slice(0, QUICK_TIMER_KEYPAD_MAX_DIGITS);
  if (current.length + token.length > QUICK_TIMER_KEYPAD_MAX_DIGITS) {
    return current;
  }
  return `${current}${token}`;
}

export function deleteQuickTimerKeypadDigit(currentDigits: string): string {
  return currentDigits.replace(/\D/gu, '').slice(0, -1);
}

export function getQuickTimerKeypadPresentation(
  inputDigits: string,
): QuickTimerKeypadPresentation {
  const digits = inputDigits
    .replace(/\D/gu, '')
    .slice(0, QUICK_TIMER_KEYPAD_MAX_DIGITS);
  const padded = digits.padStart(QUICK_TIMER_KEYPAD_MAX_DIGITS, '0');
  const rawMinutes = Number(padded.slice(0, 2));
  const rawSeconds = Number(padded.slice(2, 4));
  const durationMinutes =
    rawSeconds === 0 && isQuickTimerDuration(rawMinutes)
      ? rawMinutes
      : null;

  let helperText = '분 입력 후 00';
  let errorText: string | null = null;
  if (rawMinutes > QUICK_TIMER_MAX_DURATION_MINUTES) {
    errorText = `${QUICK_TIMER_MIN_DURATION_MINUTES}분부터 ${QUICK_TIMER_MAX_DURATION_MINUTES}분까지 입력할 수 있습니다.`;
    helperText = errorText;
  } else if (rawSeconds !== 0) {
    errorText = '끝 두 자리를 00으로 맞춰야 합니다.';
    helperText = errorText;
  } else if (durationMinutes !== null) {
    helperText = `${durationMinutes}분 타이머를 시작할 수 있습니다.`;
  }

  const minutes = rawMinutes.toString().padStart(2, '0');
  const seconds = rawSeconds.toString().padStart(2, '0');

  return {
    minutes,
    seconds,
    durationMinutes,
    canStart: durationMinutes !== null,
    helperText,
    errorText,
    accessibilityLabel: `입력한 시간 ${rawMinutes}분 ${rawSeconds}초`,
  };
}

export function getQuickTimerDisplayLabel(
  status: Pick<QuickTimerStatus, 'durationMinutes' | 'isRepeat' | 'state'>,
): string {
  if (status.state === 'ringing') {
    return status.isRepeat
      ? '타이머가 다시 울리고 있습니다'
      : '타이머가 울리고 있습니다';
  }
  if (status.isRepeat) return '타이머 다시 울림';
  return status.durationMinutes === null
    ? '타이머'
    : `${status.durationMinutes}분 타이머`;
}

export function createQuickTimerCountdownAnchor(
  status: Pick<QuickTimerStatus, 'active' | 'remainingMillis' | 'state'>,
  observedAtMonotonic: number,
): QuickTimerCountdownAnchor {
  const preservesRemainingTime = status.active || status.state === 'paused';
  return {
    remainingMillis:
      preservesRemainingTime && Number.isFinite(status.remainingMillis)
        ? Math.max(0, status.remainingMillis)
        : 0,
    observedAtMonotonic: Number.isFinite(observedAtMonotonic)
      ? observedAtMonotonic
      : 0,
  };
}

export function getQuickTimerRemainingMillis(
  anchor: QuickTimerCountdownAnchor,
  monotonicNow: number,
): number {
  if (!Number.isFinite(monotonicNow)) return anchor.remainingMillis;
  const elapsed = Math.max(0, monotonicNow - anchor.observedAtMonotonic);
  return Math.max(0, anchor.remainingMillis - elapsed);
}

export function getQuickTimerTargetAt(
  remainingMillis: number,
  wallClockNow: number,
): number {
  if (!Number.isFinite(wallClockNow) || wallClockNow <= 0) return 0;
  return wallClockNow + Math.max(0, remainingMillis);
}

export function isQuickTimerScheduleConfirmed(
  status: Pick<
    QuickTimerStatus,
    'active' | 'durationMinutes' | 'isRepeat' | 'state'
  >,
  requestedDuration: number,
): boolean {
  return (
    status.state === 'scheduled' &&
    status.active &&
    !status.isRepeat &&
    status.durationMinutes === requestedDuration
  );
}

export function formatQuickTimerCountdown(remainingMillis: number): string {
  const safeRemainingMillis = Number.isFinite(remainingMillis)
    ? Math.max(0, remainingMillis)
    : 0;
  const totalSeconds = Math.ceil(safeRemainingMillis / SECOND_MS);
  if (safeRemainingMillis >= 60_000) {
    return `${Math.ceil(safeRemainingMillis / 60_000)}분 남음`;
  }
  return `${totalSeconds}초 남음`;
}

function sameCalendarDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatQuickTimerTarget(
  fireAt: number,
  now = Date.now(),
): string {
  if (!Number.isFinite(fireAt) || fireAt <= 0) return '울림 시각 확인 필요';
  const target = new Date(fireAt);
  const current = new Date(now);
  const tomorrow = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() + 1,
  );
  const dateLabel = sameCalendarDate(target, current)
    ? '오늘'
    : sameCalendarDate(target, tomorrow)
      ? '내일'
      : `${target.getMonth() + 1}월 ${target.getDate()}일`;
  const period = target.getHours() < 12 ? '오전' : '오후';
  const hour = target.getHours() % 12 || 12;
  const minute = target.getMinutes().toString().padStart(2, '0');
  return `${dateLabel} ${period} ${hour}:${minute}`;
}

export function getQuickTimerRemainingLabel(remainingMillis: number): string {
  return formatQuickTimerCountdown(remainingMillis);
}

export function shouldStackQuickTimerActions(
  width: number,
  fontScale: number,
): boolean {
  return width < 360 || fontScale >= 1.3;
}

export function resolveQuickTimerPresetColumns(
  width: number,
  fontScale: number,
): QuickTimerPresetColumns {
  const safeWidth = Number.isFinite(width) ? Math.max(width, 0) : 0;
  const safeFontScale = Number.isFinite(fontScale)
    ? Math.max(fontScale, 1)
    : 1;
  if (safeWidth < 320 || safeFontScale >= 1.4) return 1;
  return safeWidth >= 500 ? 4 : 2;
}

export function resolveQuickTimerCountdownSize(
  width: number,
  fontScale: number,
): number {
  const safeWidth = Number.isFinite(width) ? Math.max(width, 0) : 0;
  const safeFontScale = Number.isFinite(fontScale)
    ? Math.min(Math.max(fontScale, 1), 2)
    : 1;
  const availableWidth = Math.max(safeWidth - COUNTDOWN_HORIZONTAL_RESERVE, 0);
  return Math.max(
    18,
    Math.min(
      COUNTDOWN_BASE_SIZE,
      Math.floor(availableWidth / (COUNTDOWN_WIDTH_FACTOR * safeFontScale)),
    ),
  );
}

export function getQuickTimerActionPresentation(
  action: QuickTimerRequiredAction,
): QuickTimerActionPresentation | null {
  switch (action) {
    case 'exact-alarm':
      return {
        title: '정확한 알람 허용 필요',
        message: '선택한 시간 뒤 정확히 울리도록 정확한 알람을 허용해야 합니다.',
      };
    case 'notifications':
      return {
        title: '알림 허용 필요',
        message: '타이머가 울릴 때 알람 화면과 알림을 표시하도록 알림을 허용해야 합니다.',
      };
    case 'full-screen':
      return {
        title: '전체 화면 알람 허용 필요',
        message: '화면이 잠겨 있어도 타이머를 확인하도록 전체 화면 알람을 허용해야 합니다.',
      };
    case 'none':
      return null;
  }
}
