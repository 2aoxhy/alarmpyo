import { describe, expect, it } from 'vitest';

import {
  MANUAL_ENVIRONMENT_REGIONS,
  resolveEnvironmentBriefingLayout,
  resolveTodayEnvironmentTarget,
} from './environment-briefing-model';

describe('Today 환경 브리핑 대상', () => {
  const now = new Date('2026-08-21T00:00:00.000Z');

  it('근무 중에는 퇴근 시각을 우선해요', () => {
    const endsAt = new Date('2026-08-21T08:00:00.000Z');
    expect(
      resolveTodayEnvironmentTarget({
        now,
        currentWorkEndsAt: endsAt,
        nextDepartAt: now.getTime() + 60 * 60 * 1_000,
      }),
    ).toEqual({ kind: 'return', at: endsAt.getTime() });
  });

  it('47시간 안의 다음 출발은 출근 브리핑으로 표시해요', () => {
    const departAt = now.getTime() + 46 * 60 * 60 * 1_000;
    expect(resolveTodayEnvironmentTarget({ now, nextDepartAt: departAt })).toEqual({
      kind: 'depart',
      at: departAt,
    });
  });

  it('예보 범위 밖의 출근은 현재 환경으로 대체해요', () => {
    expect(
      resolveTodayEnvironmentTarget({
        now,
        nextDepartAt: now.getTime() + 48 * 60 * 60 * 1_000,
      }),
    ).toEqual({ kind: 'current', at: now.getTime() });
  });

  it('수동 지역은 중복 이름 없이 유효한 기상 격자를 제공해요', () => {
    expect(new Set(MANUAL_ENVIRONMENT_REGIONS.map((item) => item.regionName)).size).toBe(
      MANUAL_ENVIRONMENT_REGIONS.length,
    );
    expect(
      MANUAL_ENVIRONMENT_REGIONS.every(
        (item) =>
          Number.isInteger(item.grid.nx) &&
          Number.isInteger(item.grid.ny) &&
          item.grid.nx > 0 &&
          item.grid.ny > 0,
      ),
    ).toBe(true);
  });

  it('320dp 일반 글자에서 CTA와 지역을 2열로 유지해요', () => {
    expect(resolveEnvironmentBriefingLayout(320, 1)).toEqual({
      stackActions: false,
      regionColumns: 2,
    });
    expect(resolveEnvironmentBriefingLayout(320, 1.4)).toEqual({
      stackActions: true,
      regionColumns: 1,
    });
    expect(resolveEnvironmentBriefingLayout(300, 1)).toEqual({
      stackActions: true,
      regionColumns: 1,
    });
  });
});
