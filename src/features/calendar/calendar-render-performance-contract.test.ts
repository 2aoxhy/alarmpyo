// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dayCell = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-day-cell.tsx'),
  'utf8',
);
const calendarScreen = readFileSync(
  resolve(process.cwd(), 'src/app/(tabs)/calendar.tsx'),
  'utf8',
);

describe('달력 렌더링 성능 계약', () => {
  it('날짜 셀을 memo로 격리하고 선택 구간 변화만 다시 그려요', () => {
    expect(dayCell).toContain('memo(function CalendarDayCell');
    expect(dayCell).toContain('areCalendarDayCellPropsEqual');
    expect(dayCell).toContain('previous.selectedDateKeySet.has');
    expect(dayCell).toContain('resolveCalendarSelectionSegment(');
  });

  it('셀에 전달하는 선택·탭 콜백은 렌더 사이에 안정적으로 유지해요', () => {
    expect(calendarScreen).toContain('const beginDateSelection = useCallback(');
    expect(calendarScreen).toContain('const pressCalendarDate = useCallback(');
  });
});
