import { describe, expect, it } from 'vitest';

import { isUpcomingShift } from '../upcoming-shift';

describe('다가오는 근무 판정', () => {
  const now = new Date('2026-07-17T10:00:00+09:00');

  it('현재 진행 중이거나 이미 시작한 근무를 제외해요', () => {
    expect(
      isUpcomingShift(
        { startsAt: new Date('2026-07-17T07:00:00+09:00') },
        now,
      ),
    ).toBe(false);
  });

  it('지금 이후에 시작하는 근무만 포함해요', () => {
    expect(
      isUpcomingShift(
        { startsAt: new Date('2026-07-17T18:00:00+09:00') },
        now,
      ),
    ).toBe(true);
  });

  it('현재 시각에 시작하는 근무는 다가오는 근무로 중복하지 않아요', () => {
    expect(isUpcomingShift({ startsAt: new Date(now) }, now)).toBe(false);
  });
});
