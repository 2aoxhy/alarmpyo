import { describe, expect, it, vi } from 'vitest';

import type {
  EnvironmentCacheEntry,
  EnvironmentSettings,
} from '../../application/environment/environment-types';

import {
  createEnvironmentBriefingController,
  type EnvironmentBriefingControllerDependencies,
} from './environment-briefing-controller';

function readyPayload(partial = false) {
  return {
    schemaVersion: 1 as const,
    fetchedAt: '2026-08-21T00:00:00.000Z',
    weather: {
      status: 'ready' as const,
      issuedAt: '2026-08-20T23:00:00.000Z',
      hours: [
        {
          at: '2026-08-21T01:00:00.000Z',
          temperatureCelsius: 20,
          precipitationProbability: 10,
          precipitationType: 'none' as const,
          sky: 'clear' as const,
          windSpeedMetersPerSecond: 1,
        },
      ],
    },
    airQuality: partial
      ? ({ status: 'unavailable' as const, reason: 'quota' as const })
      : ({
          status: 'ready' as const,
          stationName: '종로구',
          observedAt: '2026-08-21T00:00:00.000Z',
          grade: 'good' as const,
          overallIndex: 40,
          pm10MicrogramsPerCubicMeter: 20,
          pm25MicrogramsPerCubicMeter: 10,
        }),
  };
}

function createDependencies(options: {
  now?: Date;
  settings?: EnvironmentSettings | null;
  cache?: EnvironmentCacheEntry | null;
  partial?: boolean;
  fetchFailure?: unknown;
  permission?: 'granted' | 'denied' | 'blocked' | 'undetermined';
} = {}) {
  let storedSettings = options.settings ?? null;
  let storedCache = options.cache ?? null;
  const gatewayFetch = vi.fn(async () => {
    if (options.fetchFailure) throw options.fetchFailure;
    return readyPayload(options.partial);
  });
  const dependencies: EnvironmentBriefingControllerDependencies = {
    repository: {
      readSettings: vi.fn(async () => storedSettings),
      writeSettings: vi.fn(async (settings) => {
        storedSettings = settings;
      }),
      readCache: vi.fn(async () => storedCache),
      writeCache: vi.fn(async (cache) => {
        storedCache = cache;
      }),
      clear: vi.fn(async () => {
        storedSettings = null;
        storedCache = null;
      }),
    },
    gateway: { fetch: gatewayFetch },
    location: {
      getPermission: vi.fn(async () => options.permission ?? 'granted'),
      requestPermission: vi.fn(async () => options.permission ?? 'granted'),
      getApproximatePosition: vi.fn(async () => ({
        latitude: 37.5665,
        longitude: 126.978,
      })),
    },
    clock: {
      now: () => options.now ?? new Date('2026-08-21T00:10:00.000Z'),
    },
  };
  return { dependencies, gatewayFetch, getSettings: () => storedSettings };
}

describe('환경 브리핑 controller', () => {
  it('사용자 행동 후에만 권한을 요청하고 좌표를 격자로 즉시 축소합니다', async () => {
    const { dependencies, gatewayFetch, getSettings } = createDependencies();
    const controller = createEnvironmentBriefingController(dependencies);
    await controller.initialize();
    expect(dependencies.location.requestPermission).not.toHaveBeenCalled();

    await controller.requestAutomaticLocation();
    expect(dependencies.location.requestPermission).toHaveBeenCalledOnce();
    expect(getSettings()).toEqual({
      schemaVersion: 1,
      mode: 'automatic',
      grid: { nx: 60, ny: 127 },
      regionName: '현재 위치',
    });
    expect(JSON.stringify(getSettings())).not.toMatch(/latitude|longitude/);
    expect(gatewayFetch).toHaveBeenCalledWith({ nx: 60, ny: 127 });
    expect(controller.getSnapshot().status).toBe('ready');
    controller.dispose();
  });

  it('두 공급자 중 하나만 성공하면 partial 상태로 표시합니다', async () => {
    const { dependencies } = createDependencies({ partial: true });
    const controller = createEnvironmentBriefingController(dependencies);
    await controller.selectManualRegion({
      regionName: '서울특별시',
      grid: { nx: 60, ny: 127 },
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: 'partial',
      enabled: true,
      regionName: '서울특별시',
    });
    controller.dispose();
  });

  it('30분 이내 캐시는 네트워크 없이 사용합니다', async () => {
    const settings: EnvironmentSettings = {
      schemaVersion: 1,
      mode: 'manual',
      grid: { nx: 60, ny: 127 },
      regionName: '서울특별시',
    };
    const cache: EnvironmentCacheEntry = {
      schemaVersion: 1,
      savedAt: '2026-08-21T00:00:00.000Z',
      grid: settings.grid,
      regionName: settings.regionName,
      payload: readyPayload(),
    };
    const { dependencies, gatewayFetch } = createDependencies({ settings, cache });
    const controller = createEnvironmentBriefingController(dependencies);
    await controller.initialize();
    expect(gatewayFetch).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe('ready');
    controller.dispose();
  });

  it('갱신 실패 시 6시간 이내 캐시를 stale로 제공합니다', async () => {
    const settings: EnvironmentSettings = {
      schemaVersion: 1,
      mode: 'manual',
      grid: { nx: 60, ny: 127 },
      regionName: '서울특별시',
    };
    const cache: EnvironmentCacheEntry = {
      schemaVersion: 1,
      savedAt: '2026-08-20T20:00:00.000Z',
      grid: settings.grid,
      regionName: settings.regionName,
      payload: readyPayload(),
    };
    const { dependencies } = createDependencies({
      settings,
      cache,
      fetchFailure: { code: 'upstream' },
    });
    const controller = createEnvironmentBriefingController(dependencies);
    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({
      status: 'stale',
      failure: 'network',
      payload: cache.payload,
    });
    controller.dispose();
  });

  it('권한을 거부하면 저장된 격자를 서버에 보내지 않습니다', async () => {
    const settings: EnvironmentSettings = {
      schemaVersion: 1,
      mode: 'automatic',
      grid: { nx: 60, ny: 127 },
      regionName: '현재 위치',
    };
    const { dependencies, gatewayFetch } = createDependencies({
      settings,
      permission: 'blocked',
    });
    const controller = createEnvironmentBriefingController(dependencies);
    await controller.initialize();
    expect(gatewayFetch).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      status: 'permission-required',
      failure: 'location-permission-denied',
    });
    controller.dispose();
  });

  it('수동 새로고침을 5분 동안 중복 실행하지 않습니다', async () => {
    const { dependencies, gatewayFetch } = createDependencies();
    const controller = createEnvironmentBriefingController(dependencies);
    await controller.selectManualRegion({
      regionName: '서울특별시',
      grid: { nx: 60, ny: 127 },
    });
    await controller.refresh({ manual: true, reacquireLocation: false });
    await controller.refresh({ manual: true, reacquireLocation: false });
    expect(gatewayFetch).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().canRefresh).toBe(false);
    controller.dispose();
  });
});
