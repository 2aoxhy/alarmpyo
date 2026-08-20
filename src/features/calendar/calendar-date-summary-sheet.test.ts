// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getCalendarDateDirectChangeCopy,
  resolveCalendarDateDirectChange,
} from './calendar-date-summary-presentation';

const summarySheet = readFileSync(
  resolve(process.cwd(), 'src/features/calendar/calendar-date-summary-sheet.tsx'),
  'utf8',
);

describe('달력 날짜 요약 시트 문구', () => {
  it('근무 이름과 자정을 넘는 실제 시간을 손실 없이 표시합니다', () => {
    expect(summarySheet).toContain('formatCompactTime(schedule.startMinutes)');
    expect(summarySheet).toContain("schedule.endsNextDay ? '다음 날 ' : ''");
    expect(summarySheet).toContain('formatCompactTime(schedule.endMinutes)');
    expect(summarySheet).toContain('fontVariant: [\'tabular-nums\']');
    expect(summarySheet).toContain('flexShrink: 0');
  });

  it('시간이 없는 휴무와 일정 없음도 완전한 문구로 표시합니다', () => {
    expect(summarySheet).toContain("if (!schedule) return '일정 없음'");
    expect(summarySheet).toContain("schedule?.label ?? '일정 없음'");
    expect(summarySheet).not.toContain('numberOfLines');
  });

  it('기본 근무표와 직접 변경 종류를 구분합니다', () => {
    expect(getCalendarDateDirectChangeCopy('none')).toBe(
      '기본 근무표와 같습니다.',
    );
    expect(getCalendarDateDirectChangeCopy('shift')).toBe(
      '근무를 이 날짜에 직접 변경했습니다.',
    );
    expect(getCalendarDateDirectChangeCopy('time')).toBe(
      '근무 시간을 이 날짜에 직접 변경했습니다.',
    );
    expect(getCalendarDateDirectChangeCopy('shift-and-time')).toBe(
      '근무와 시간을 이 날짜에 직접 변경했습니다.',
    );
    expect(getCalendarDateDirectChangeCopy('special-schedule')).toBe(
      '특별 일정이 적용되어 기본 근무표와 다릅니다.',
    );
    expect(summarySheet).toContain("directChange !== 'none'");
    expect(
      resolveCalendarDateDirectChange({
        hasSpecialSchedule: true,
        hasShiftOverride: false,
        hasTimeOverride: false,
      }),
    ).toBe('special-schedule');
    expect(
      resolveCalendarDateDirectChange({
        hasSpecialSchedule: false,
        hasShiftOverride: true,
        hasTimeOverride: true,
      }),
    ).toBe('shift-and-time');
  });

  it('일정 시작 전에는 요약을 허용하고 수정만 비활성화합니다', () => {
    expect(summarySheet).toContain('const editable = data.editable ?? true');
    expect(summarySheet).toContain('disabled={!editable}');
    expect(summarySheet).toContain('일정 적용 시작일 이전 날짜입니다.');
    expect(summarySheet).toContain('{editable ? (');
    expect(summarySheet).toContain("editable && directChange !== 'none'");
  });
});
