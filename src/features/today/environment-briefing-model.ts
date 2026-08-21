import type {
  EnvironmentBriefingTarget,
} from '@/application/environment/environment-presentation';
import type { ManualEnvironmentRegion } from '@/application/environment/environment-types';

const MAX_COMMUTE_FORECAST_LEAD_MS = 47 * 60 * 60 * 1_000;

export function resolveEnvironmentBriefingLayout(
  width: number,
  fontScale: number,
): Readonly<{ stackActions: boolean; regionColumns: 1 | 2 }> {
  const largeText = fontScale >= 1.4;
  const narrow = width < 320;
  return {
    stackActions: largeText || narrow,
    regionColumns: !largeText && !narrow ? 2 : 1,
  };
}

export const MANUAL_ENVIRONMENT_REGIONS: readonly ManualEnvironmentRegion[] =
  Object.freeze([
    { regionName: '서울', grid: { nx: 60, ny: 127 } },
    { regionName: '부산', grid: { nx: 98, ny: 76 } },
    { regionName: '대구', grid: { nx: 89, ny: 90 } },
    { regionName: '인천', grid: { nx: 55, ny: 124 } },
    { regionName: '광주', grid: { nx: 58, ny: 74 } },
    { regionName: '대전', grid: { nx: 67, ny: 100 } },
    { regionName: '울산', grid: { nx: 102, ny: 84 } },
    { regionName: '세종', grid: { nx: 66, ny: 103 } },
    { regionName: '경기 수원', grid: { nx: 60, ny: 121 } },
    { regionName: '강원 춘천', grid: { nx: 73, ny: 134 } },
    { regionName: '충북 청주', grid: { nx: 69, ny: 106 } },
    { regionName: '충남 홍성', grid: { nx: 55, ny: 106 } },
    { regionName: '전북 전주', grid: { nx: 63, ny: 89 } },
    { regionName: '전남 무안', grid: { nx: 51, ny: 67 } },
    { regionName: '경북 안동', grid: { nx: 91, ny: 106 } },
    { regionName: '경남 창원', grid: { nx: 89, ny: 77 } },
    { regionName: '제주', grid: { nx: 52, ny: 38 } },
  ]);

export function resolveTodayEnvironmentTarget(input: Readonly<{
  now: Date;
  currentWorkEndsAt?: Date | null;
  nextDepartAt?: number | null;
}>): EnvironmentBriefingTarget {
  const nowAt = input.now.getTime();
  const currentWorkEndsAt = input.currentWorkEndsAt?.getTime();
  if (
    Number.isFinite(currentWorkEndsAt) &&
    (currentWorkEndsAt as number) > nowAt
  ) {
    return { kind: 'return', at: currentWorkEndsAt as number };
  }

  const nextDepartAt = input.nextDepartAt;
  if (
    typeof nextDepartAt === 'number' &&
    Number.isFinite(nextDepartAt) &&
    nextDepartAt >= nowAt &&
    nextDepartAt - nowAt <= MAX_COMMUTE_FORECAST_LEAD_MS
  ) {
    return { kind: 'depart', at: nextDepartAt };
  }

  return { kind: 'current', at: nowAt };
}
