import { describe, expect, it } from 'vitest';

import {
  buildDayShiftSummary,
  getDaySaveActionLabel,
} from '../day-editor-presentation';

describe('하루 일정 편집 표시', () => {
  it('현재·기본 일정의 이름과 시간을 짧게 표시해요', () => {
    expect(
      buildDayShiftSummary({
        name: '야간',
        isOff: false,
        startMinutes: 17 * 60 + 45,
        endMinutes: 6 * 60 + 45,
        endsNextDay: true,
      }),
    ).toEqual({
      title: '야간',
      detail: '17:45–다음 날 06:45',
      accessibilityLabel: '야간. 17:45–다음 날 06:45',
    });
    expect(buildDayShiftSummary(null)).toMatchObject({
      title: '일정 없음',
      detail: '근무 시간 없음',
    });
  });

  it('저장 버튼은 선택 결과를 직접 말해요', () => {
    const base = {
      hasChanges: true,
      patternShiftName: '휴무',
      timeIsValid: true,
    } as const;
    expect(
      getDaySaveActionLabel({
        ...base,
        selection: 'night',
        selectedShiftName: '야간',
      }),
    ).toBe('야간으로 변경');
    expect(
      getDaySaveActionLabel({
        ...base,
        restoringBaseSchedule: true,
        selection: 'pattern',
      }),
    ).toBe('기본 일정으로 되돌리기');
    expect(
      getDaySaveActionLabel({ ...base, selection: null }),
    ).toBe('일정 표시 안 함');
    expect(
      getDaySaveActionLabel({
        ...base,
        exceptionLabel: '교육',
        selection: 'day',
      }),
    ).toBe('교육으로 변경');
    expect(
      getDaySaveActionLabel({ ...base, hasChanges: false, selection: 'night' }),
    ).toBe('변경 내용 없음');
  });
});
