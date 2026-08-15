import { describe, expect, it } from 'vitest';

import { formatSettingsWorkSummary } from './settings-work-summary';

describe('설정 근무표 요약', () => {
  it('근무 이름과 시각을 줄바꿈되지 않는 하나의 토큰으로 표시해요', () => {
    expect(
      formatSettingsWorkSummary(
        '3조 2교대',
        [
          { isOff: false, shortName: '주', startMinutes: 6 * 60 + 45 },
          { isOff: false, shortName: '야', startMinutes: 17 * 60 + 45 },
          { isOff: true, shortName: '휴', startMinutes: null },
        ],
        { width: 360, fontScale: 1 },
      ),
    ).toBe('3조 2교대 · 주\u00A006:45 · 야\u00A017:45');
  });

  it.each([
    [320, 1],
    [360, 1.3],
    [412, 2],
  ])(
    '%ipx·%s배 글자에서는 시간 목록을 짧은 상태로 바꿔요',
    (width, fontScale) => {
      expect(
        formatSettingsWorkSummary(
          '3조 2교대',
          [{ isOff: false, shortName: '주', startMinutes: 6 * 60 + 45 }],
          { width, fontScale },
        ),
      ).toBe('3조 2교대 · 근무 시간 설정됨');
    },
  );

  it('표시할 근무 시각이 없으면 근무 방식 이름만 남겨요', () => {
    expect(
      formatSettingsWorkSummary(
        '기타 교대',
        [{ isOff: true, shortName: '휴', startMinutes: null }],
        { width: 320, fontScale: 2 },
      ),
    ).toBe('기타 교대');
  });
});
