import { describe, expect, it, vi } from 'vitest';

import type { EnvironmentCache, EnvironmentExecutionContext } from './contracts';
import { getKmaIssue, parseKmaForecast } from './providers';
import { geographicToKoreaTm, kmaGridToGeographic } from './projection';
import { createEnvironmentBriefingWorker } from './worker';

function kmaResponse() {
  const categories = [
    ['TMP', '12'],
    ['POP', '70'],
    ['PTY', '1'],
    ['SKY', '4'],
    ['WSD', '2.1'],
  ];
  return {
    response: {
      header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' },
      body: {
        items: {
          item: categories.map(([category, fcstValue]) => ({
            baseDate: '20260821',
            baseTime: '0500',
            category,
            fcstDate: '20260821',
            fcstTime: '0600',
            fcstValue,
            nx: 60,
            ny: 127,
          })),
        },
      },
    },
  };
}

function airStationResponse() {
  return {
    response: {
      header: { resultCode: '00', resultMsg: 'NORMAL_CODE' },
      body: { items: [{ stationName: '종로구', tm: '1.2' }] },
    },
  };
}

function airMeasurementResponse() {
  return {
    response: {
      header: { resultCode: '00', resultMsg: 'NORMAL_CODE' },
      body: {
        items: [
          {
            stationName: '종로구',
            dataTime: '2026-08-21 05:00',
            khaiGrade: '3',
            khaiValue: '132',
            pm10Value: '81',
            pm25Value: '38',
          },
        ],
      },
    },
  };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createContext() {
  const pending: Promise<unknown>[] = [];
  const context: EnvironmentExecutionContext = {
    waitUntil(work) {
      pending.push(work);
    },
  };
  return { context, flush: () => Promise.all(pending) };
}

function createMemoryCache(): EnvironmentCache {
  const values = new Map<string, Response>();
  return {
    async match(request) {
      return values.get(request.url)?.clone();
    },
    async put(request, response) {
      values.set(request.url, response.clone());
    },
  };
}

describe('Environment briefing Worker', () => {
  it('기상청 격자 중심을 AirKorea EPSG:5181 좌표로 변환합니다', () => {
    const geographic = kmaGridToGeographic(60, 127);
    expect(geographic.latitude).toBeCloseTo(37.58, 1);
    expect(geographic.longitude).toBeCloseTo(126.99, 1);
    const tm = geographicToKoreaTm(
      geographic.latitude,
      geographic.longitude,
    );
    expect(tm.x).toBeGreaterThan(190_000);
    expect(tm.x).toBeLessThan(210_000);
    expect(tm.y).toBeGreaterThan(445_000);
    expect(tm.y).toBeLessThan(460_000);
  });

  it('발표 15분 유예를 적용해 최신 기상청 발표판을 선택합니다', () => {
    expect(getKmaIssue(new Date('2026-08-20T20:20:00.000Z'))).toEqual({
      date: '20260821',
      time: '0500',
    });
    expect(getKmaIssue(new Date('2026-08-20T20:10:00.000Z'))).toEqual({
      date: '20260821',
      time: '0200',
    });
  });

  it('KMA 카테고리를 48시간 시간별 계약으로 정규화합니다', () => {
    const result = parseKmaForecast(
      kmaResponse(),
      { date: '20260821', time: '0500' },
      new Date('2026-08-20T20:30:00.000Z'),
    );
    expect(result).toEqual({
      status: 'ready',
      issuedAt: '2026-08-20T20:00:00.000Z',
      hours: [
        {
          at: '2026-08-20T21:00:00.000Z',
          temperatureCelsius: 12,
          precipitationProbability: 70,
          precipitationType: 'rain',
          sky: 'overcast',
          windSpeedMetersPerSecond: 2.1,
        },
      ],
    });
  });

  it('요청에 nx/ny 외 값이 있으면 거부합니다', async () => {
    const fetchImpl = vi.fn(async () => json(kmaResponse())) as unknown as typeof fetch;
    const worker = createEnvironmentBriefingWorker({
      fetchImpl,
      now: () => new Date('2026-08-20T20:30:00.000Z'),
    });
    const { context } = createContext();
    const response = await worker.fetch(
      new Request('https://worker.example/v1/environment-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          nx: 60,
          ny: 127,
          latitude: 37.5,
        }),
      }),
      {},
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('한 공급자가 실패해도 다른 공급자 결과를 200으로 반환합니다', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.includes('getVilageFcst')) return json(kmaResponse());
      throw new Error('AirKorea must not be called without its secret.');
    }) as unknown as typeof fetch;
    const cache = createMemoryCache();
    const worker = createEnvironmentBriefingWorker({
      fetchImpl,
      cache,
      now: () => new Date('2026-08-20T20:30:00.000Z'),
    });
    const { context, flush } = createContext();
    const response = await worker.fetch(
      new Request('https://worker.example/v1/environment-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"schemaVersion":1,"nx":60,"ny":127}',
      }),
      { KMA_SERVICE_KEY: 'kma-secret' },
      context,
    );
    await flush();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.weather).toMatchObject({ status: 'ready' });
    expect(payload.airQuality).toEqual({ status: 'unavailable', reason: 'auth' });
    expect(JSON.stringify(payload)).not.toContain('kma-secret');
  });

  it('공급자 응답 상한을 UTF-8 바이트 크기로 적용합니다', async () => {
    const oversized = {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      arrayBuffer: async () => new Uint8Array(2 * 1_024 * 1_024 + 1).buffer,
      text: async () => JSON.stringify(kmaResponse()),
    } as unknown as Response;
    const fetchImpl = vi.fn(async () => oversized) as unknown as typeof fetch;
    const worker = createEnvironmentBriefingWorker({
      fetchImpl,
      now: () => new Date('2026-08-20T20:30:00.000Z'),
    });
    const { context } = createContext();
    const response = await worker.fetch(
      new Request('https://worker.example/v1/environment-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"schemaVersion":1,"nx":60,"ny":127}',
      }),
      { KMA_SERVICE_KEY: 'kma-secret' },
      context,
    );

    await expect(response.json()).resolves.toMatchObject({
      weather: { status: 'unavailable', reason: 'invalid-response' },
    });
  });

  it('AirKorea 최근 측정소 실측값과 제공 등급을 그대로 유지합니다', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.includes('getVilageFcst')) return json(kmaResponse());
      if (url.pathname.includes('getNearbyMsrstnList')) {
        return json(airStationResponse());
      }
      if (url.pathname.includes('getMsrstnAcctoRltmMesureDnsty')) {
        return json(airMeasurementResponse());
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const worker = createEnvironmentBriefingWorker({
      fetchImpl,
      now: () => new Date('2026-08-20T20:30:00.000Z'),
    });
    const { context } = createContext();
    const response = await worker.fetch(
      new Request('https://worker.example/v1/environment-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"schemaVersion":1,"nx":60,"ny":127}',
      }),
      {
        KMA_SERVICE_KEY: 'kma-secret',
        AIRKOREA_SERVICE_KEY: 'air-secret',
      },
      context,
    );
    const payload = (await response.json()) as {
      airQuality: Record<string, unknown>;
    };
    expect(payload.airQuality).toEqual({
      status: 'ready',
      stationName: '종로구',
      observedAt: '2026-08-20T20:00:00.000Z',
      grade: 'bad',
      overallIndex: 132,
      pm10MicrogramsPerCubicMeter: 81,
      pm25MicrogramsPerCubicMeter: 38,
    });
  });

  it('허용하지 않은 web Origin을 upstream 호출 전에 차단합니다', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const worker = createEnvironmentBriefingWorker({ fetchImpl });
    const { context } = createContext();
    const response = await worker.fetch(
      new Request('https://worker.example/v1/environment-briefing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: '{"schemaVersion":1,"nx":60,"ny":127}',
      }),
      { ALLOWED_ORIGIN: 'https://alarmpyo.example' },
      context,
    );
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('Cloudflare rate-limit binding이 거부하면 공공 API를 호출하지 않습니다', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const worker = createEnvironmentBriefingWorker({ fetchImpl });
    const { context } = createContext();
    const response = await worker.fetch(
      new Request('https://worker.example/v1/environment-briefing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.1',
        },
        body: '{"schemaVersion":1,"nx":60,"ny":127}',
      }),
      {
        ENVIRONMENT_RATE_LIMITER: {
          limit: vi.fn(async () => ({ success: false })),
        },
      },
      context,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
