import { describe, expect, it } from 'vitest';

import { formatAppUpdateDate } from '../../utils/app-release-date';

describe('앱 업데이트 날짜', () => {
  it('업데이트 생성 시각을 서울 날짜의 일/월/연 형식으로 표시해요', () => {
    expect(formatAppUpdateDate(new Date('2026-07-25T16:00:00.000Z'))).toBe(
      '26/07/26',
    );
  });

  it('생성 시각이 없거나 잘못되면 최신 날짜를 임의로 만들지 않아요', () => {
    expect(formatAppUpdateDate(null)).toBeNull();
    expect(formatAppUpdateDate(new Date(Number.NaN))).toBeNull();
  });
});
