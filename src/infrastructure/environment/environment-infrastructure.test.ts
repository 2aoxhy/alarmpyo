import { describe, expect, it, vi } from 'vitest';

import type { EnvironmentBriefingPayload } from '../../application/environment/environment-types';

import {
  createEnvironmentBriefingHttpGateway,
  EnvironmentGatewayError,
} from './environment-http-gateway';
import {
  createEnvironmentLocalRepository,
  type EnvironmentKeyValueStorage,
} from './environment-local-repository';

function payload(): EnvironmentBriefingPayload {
  return {
    schemaVersion: 1,
    fetchedAt: '2026-08-21T00:00:00.000Z',
    weather: { status: 'unavailable', reason: 'no-data' },
    airQuality: { status: 'unavailable', reason: 'quota' },
  };
}

function memoryStorage(): EnvironmentKeyValueStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

describe('환경 브리핑 infrastructure', () => {
  it('HTTP 요청에 격자만 보내고 위경도를 전송하지 않습니다', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify(payload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const gateway = createEnvironmentBriefingHttpGateway({
      baseUrl: 'https://environment.example',
      fetchImpl,
    });
    await expect(gateway.fetch({ nx: 60, ny: 127 })).resolves.toEqual(payload());
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"schemaVersion":1,"nx":60,"ny":127}');
    expect(String(init?.body)).not.toMatch(/lat|lon|schedule|depart/i);
  });

  it('안전하지 않은 proxy URL과 손상된 응답을 거부합니다', async () => {
    expect(() =>
      createEnvironmentBriefingHttpGateway({ baseUrl: 'http://example.com' }),
    ).toThrow(EnvironmentGatewayError);
    const gateway = createEnvironmentBriefingHttpGateway({
      baseUrl: 'https://environment.example',
      fetchImpl: async () => new Response('{bad json', { status: 200 }),
    });
    await expect(gateway.fetch({ nx: 60, ny: 127 })).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  it('응답 상한을 UTF-8 바이트 크기로 적용합니다', async () => {
    const oversized = {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      arrayBuffer: async () => new Uint8Array(256 * 1_024 + 1).buffer,
      // 과거 문자 수 검사라면 이 유효한 작은 본문을 읽고 통과했어요.
      text: async () => JSON.stringify(payload()),
    } as unknown as Response;
    const gateway = createEnvironmentBriefingHttpGateway({
      baseUrl: 'https://environment.example',
      fetchImpl: async () => oversized,
    });

    await expect(gateway.fetch({ nx: 60, ny: 127 })).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  it('설정과 캐시에 5km 격자만 저장하고 함께 제거합니다', async () => {
    const storage = memoryStorage();
    const repository = createEnvironmentLocalRepository(storage);
    const settings = {
      schemaVersion: 1 as const,
      mode: 'automatic' as const,
      grid: { nx: 60, ny: 127 },
      regionName: '현재 위치',
    };
    await repository.writeSettings(settings);
    await repository.writeCache({
      schemaVersion: 1,
      savedAt: '2026-08-21T00:00:00.000Z',
      grid: settings.grid,
      regionName: settings.regionName,
      payload: payload(),
    });
    expect(await repository.readSettings()).toEqual(settings);
    const serialized = [...storage.values.values()].join('');
    expect(serialized).not.toMatch(/latitude|longitude/);
    await repository.clear();
    expect(storage.values.size).toBe(0);
  });
});
