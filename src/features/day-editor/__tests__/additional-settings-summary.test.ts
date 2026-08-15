import { describe, expect, it } from 'vitest';

import {
  buildAdditionalSettingsSummary,
  shouldExpandAdditionalSettings,
} from '../additional-settings-summary';

describe('하루 일정 추가 설정 요약', () => {
  it('추가로 바꾼 값이 없으면 설정 범위를 안내해요', () => {
    expect(
      buildAdditionalSettingsSummary({
        exceptionLabel: null,
        hasTimeOverride: false,
        hasNote: false,
      }),
    ).toBe('특별 일정, 근무 시간, 알람과 메모를 설정합니다.');
  });

  it('현재 적용된 설정만 짧게 모아서 보여줘요', () => {
    expect(
      buildAdditionalSettingsSummary({
        exceptionLabel: '교육',
        hasAlarmOverride: true,
        hasTimeOverride: true,
        hasNote: true,
      }),
    ).toBe('교육 · 시간 변경 · 알람 변경 · 메모 있음');
  });

  it('메모만 있는 날짜도 설정이 있음을 알려줘요', () => {
    expect(
      buildAdditionalSettingsSummary({
        hasTimeOverride: false,
        hasNote: true,
      }),
    ).toBe('메모 있음');
  });

  it('저장된 추가 설정이 있는 날짜는 처음부터 펼쳐요', () => {
    expect(
      shouldExpandAdditionalSettings({
        hasException: false,
        hasTimeOverride: true,
        note: '',
      }),
    ).toBe(true);
    expect(
      shouldExpandAdditionalSettings({
        hasAlarmOverride: true,
        hasException: false,
        hasTimeOverride: false,
        note: '',
      }),
    ).toBe(true);
    expect(
      shouldExpandAdditionalSettings({
        hasException: false,
        hasTimeOverride: false,
        note: '  ',
      }),
    ).toBe(false);
  });
});
