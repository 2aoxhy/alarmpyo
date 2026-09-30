export const QUICK_TIMER_MIN_DURATION_MINUTES = 1;
export const QUICK_TIMER_MAX_DURATION_MINUTES = 60;

/**
 * 한 번의 탭으로 시작하는 기본 시간입니다.
 * 60분은 직접 입력으로도 설정할 수 있지만 빠른 선택에서는 제공하지 않습니다.
 */
export const QUICK_TIMER_PRESET_DURATIONS = [15, 30, 45] as const;

export type QuickTimerDuration = number;

export function isQuickTimerDuration(
  value: unknown,
): value is QuickTimerDuration {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= QUICK_TIMER_MIN_DURATION_MINUTES &&
    value <= QUICK_TIMER_MAX_DURATION_MINUTES
  );
}
