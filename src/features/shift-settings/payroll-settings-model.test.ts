import { describe, expect, it } from 'vitest';

import {
  buildPayrollPreview,
  formatPayrollSettingsSummary,
  parsePayrollDay,
} from './payroll-settings-model';

describe('급여일 설정 화면 모델', () => {
  it('1일부터 31일까지만 허용합니다', () => {
    expect(parsePayrollDay('1')).toBe(1);
    expect(parsePayrollDay('31')).toBe(31);
    expect(parsePayrollDay('0')).toBeNull();
    expect(parsePayrollDay('32')).toBeNull();
    expect(parsePayrollDay('3일')).toBeNull();
  });

  it('현재 달부터 세 달의 실제 지급일을 미리 봅니다', () => {
    const preview = buildPayrollPreview(
      { day: 31, adjustment: 'fixed-date' },
      new Date(2026, 1, 12, 12),
    );

    expect(preview).toHaveLength(3);
    expect(preview.map((item) => item.paydayLabel)).toEqual([
      '2월 28일',
      '3월 31일',
      '4월 30일',
    ]);
    expect(preview.every((item) => item.confirmed)).toBe(true);
  });

  it('설정 요약에 날짜와 조정 정책을 함께 표시합니다', () => {
    expect(
      formatPayrollSettingsSummary({
        day: 21,
        adjustment: 'previous-business-day',
      }),
    ).toBe('매월 21일 · 직전 영업일');
  });
});
