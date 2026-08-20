export type CalendarDateDirectChange =
  | 'none'
  | 'shift'
  | 'time'
  | 'shift-and-time'
  | 'special-schedule';

export function resolveCalendarDateDirectChange(input: Readonly<{
  hasSpecialSchedule: boolean;
  hasShiftOverride: boolean;
  hasTimeOverride: boolean;
}>): CalendarDateDirectChange {
  if (input.hasSpecialSchedule) return 'special-schedule';
  if (input.hasShiftOverride && input.hasTimeOverride) return 'shift-and-time';
  if (input.hasShiftOverride) return 'shift';
  if (input.hasTimeOverride) return 'time';
  return 'none';
}

export function getCalendarDateDirectChangeCopy(
  directChange: CalendarDateDirectChange = 'none',
): string {
  switch (directChange) {
    case 'shift':
      return '근무를 이 날짜에 직접 변경했습니다.';
    case 'time':
      return '근무 시간을 이 날짜에 직접 변경했습니다.';
    case 'shift-and-time':
      return '근무와 시간을 이 날짜에 직접 변경했습니다.';
    case 'special-schedule':
      return '특별 일정이 적용되어 기본 근무표와 다릅니다.';
    case 'none':
      return '기본 근무표와 같습니다.';
  }
}
