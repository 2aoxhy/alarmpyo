import { describe, expect, it } from 'vitest';

import {
  parseEnvironmentBriefingPayload,
  parseEnvironmentCacheEntry,
  parseEnvironmentSettings,
} from './environment-codec';
import { buildEnvironmentBriefingViewModel } from './environment-presentation';
import type { EnvironmentBriefingPayload } from './environment-types';
import { isValidKmaGrid, toKmaGrid } from './kma-grid';

function samplePayload(): EnvironmentBriefingPayload {
  return {
    schemaVersion: 1,
    fetchedAt: '2026-08-21T20:00:00.000Z',
    weather: {
      status: 'ready',
      issuedAt: '2026-08-21T17:00:00.000Z',
      hours: [
        {
          at: '2026-08-21T21:00:00.000Z',
          temperatureCelsius: 12,
          precipitationProbability: 70,
          precipitationType: 'rain',
          sky: 'overcast',
          windSpeedMetersPerSecond: 2.1,
        },
      ],
    },
    airQuality: {
      status: 'ready',
      stationName: '종로구',
      observedAt: '2026-08-21T20:00:00.000Z',
      grade: 'moderate',
      overallIndex: 72,
      pm10MicrogramsPerCubicMeter: 41,
      pm25MicrogramsPerCubicMeter: 22,
    },
  };
}

describe('환경 브리핑 계약', () => {
  it('위경도를 앱 내에서 기상청 5km 격자로 즉시 변환합니다', () => {
    expect(toKmaGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
    expect(toKmaGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 });
    expect(toKmaGrid(48.8566, 2.3522)).toBeNull();
    expect(isValidKmaGrid({ nx: 0, ny: 127 })).toBe(false);
  });

  it('서버 응답의 범위·타입·중복 시각을 검증합니다', () => {
    const payload = samplePayload();
    expect(parseEnvironmentBriefingPayload(payload)).toEqual(payload);
    expect(
      parseEnvironmentBriefingPayload({
        ...payload,
        weather: {
          ...payload.weather,
          hours:
            payload.weather.status === 'ready'
              ? [...payload.weather.hours, ...payload.weather.hours]
              : [],
        },
      }),
    ).toBeNull();
    expect(
      parseEnvironmentBriefingPayload({ ...payload, schemaVersion: 2 }),
    ).toBeNull();
  });

  it('AppData와 분리된 설정과 캐시만 읽습니다', () => {
    const settings = {
      schemaVersion: 1 as const,
      mode: 'automatic' as const,
      grid: { nx: 60, ny: 127 },
      regionName: '현재 위치',
    };
    expect(parseEnvironmentSettings(settings)).toEqual(settings);
    expect(parseEnvironmentSettings({ ...settings, latitude: 37.5 })).toEqual(
      settings,
    );
    expect(
      parseEnvironmentCacheEntry({
        schemaVersion: 1,
        savedAt: '2026-08-21T20:00:00.000Z',
        grid: settings.grid,
        regionName: settings.regionName,
        payload: samplePayload(),
      }),
    ).not.toBeNull();
  });

  it('출근 시각 예보와 실측 공기를 서로 다른 시각으로 표시합니다', () => {
    const viewModel = buildEnvironmentBriefingViewModel(samplePayload(), {
      now: new Date('2026-08-21T21:00:00.000Z'),
      target: {
        kind: 'depart',
        at: Date.parse('2026-08-21T21:30:00.000Z'),
      },
    });
    expect(viewModel.weather?.line).toBe(
      '출근 06:30 · 12°C · 비 70% · 우산 권장',
    );
    expect(viewModel.airQuality?.line).toBe('현재 공기 보통 · 05:00 측정');
    expect(viewModel.airQuality?.detailLine).toBe(
      '미세 41 · 초미세 22㎍/㎥',
    );
  });

  it('6시간을 넘긴 공기질은 오해를 막기 위해 숨깁니다', () => {
    const viewModel = buildEnvironmentBriefingViewModel(samplePayload(), {
      now: new Date('2026-08-22T03:00:01.000Z'),
    });
    expect(viewModel.airQuality).toBeNull();
  });
});
