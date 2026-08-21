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
        message: '15분·30분·45분·60분 뒤 정확히 울리도록 정확한 알람을 허용해야 합니다.',
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
