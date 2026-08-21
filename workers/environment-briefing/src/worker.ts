import type {
  AirQualityProviderResult,
  EnvironmentBriefingPayload,
  EnvironmentCache,
  EnvironmentExecutionContext,
  EnvironmentProviderFailureReason,
  EnvironmentWorkerDependencies,
  EnvironmentWorkerEnv,
  WeatherProviderResult,
} from './contracts';
import { ProviderError } from './contracts';
import { fetchAirQuality, fetchKmaForecast } from './providers';

const MAX_REQUEST_BYTES = 1_024;
const ENDPOINT_PATH = '/v1/environment-briefing';

function jsonResponse(
  value: unknown,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function emptyResponse(status: number, origin: string | null): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Max-Age', '86400');
    headers.set('Vary', 'Origin');
  }
  return new Response(null, { status, headers });
}

function resolveAllowedOrigin(
  request: Request,
  configuredOrigin: string | undefined,
): { allowed: boolean; responseOrigin: string | null } {
  const requestOrigin = request.headers.get('origin');
  if (!requestOrigin) return { allowed: true, responseOrigin: null };
  const normalized = configuredOrigin?.trim();
  return normalized && requestOrigin === normalized
    ? { allowed: true, responseOrigin: requestOrigin }
    : { allowed: false, responseOrigin: null };
}

async function parseRequestGrid(
  request: Request,
): Promise<{ nx: number; ny: number } | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return null;
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_REQUEST_BYTES) return null;
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== 'nx' ||
    keys[1] !== 'ny' ||
    keys[2] !== 'schemaVersion' ||
    item.schemaVersion !== 1 ||
    !Number.isInteger(item.nx) ||
    Number(item.nx) < 1 ||
    Number(item.nx) > 149 ||
    !Number.isInteger(item.ny) ||
    Number(item.ny) < 1 ||
    Number(item.ny) > 253
  ) {
    return null;
  }
  return { nx: Number(item.nx), ny: Number(item.ny) };
}

function unavailableWeather(
  reason: EnvironmentProviderFailureReason,
): WeatherProviderResult {
  return { status: 'unavailable', reason };
}

function unavailableAirQuality(
  reason: EnvironmentProviderFailureReason,
): AirQualityProviderResult {
  return { status: 'unavailable', reason };
}

function failureReason(error: unknown): EnvironmentProviderFailureReason {
  return error instanceof ProviderError ? error.reason : 'upstream';
}

function resolveDefaultCache(): EnvironmentCache | undefined {
  const cacheStorage = (
    globalThis as typeof globalThis & {
      caches?: { default?: EnvironmentCache };
    }
  ).caches;
  return cacheStorage?.default;
}

export function createEnvironmentBriefingWorker(
  overrides: Partial<EnvironmentWorkerDependencies> = {},
) {
  const dependencies: EnvironmentWorkerDependencies = {
    fetchImpl: overrides.fetchImpl ?? fetch,
    cache: overrides.cache ?? resolveDefaultCache(),
    now: overrides.now ?? (() => new Date()),
  };

  return {
    async fetch(
      request: Request,
      env: EnvironmentWorkerEnv,
      context: EnvironmentExecutionContext,
    ): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ENDPOINT_PATH) {
        return jsonResponse({ error: 'not-found' }, 404, null);
      }
      const origin = resolveAllowedOrigin(request, env.ALLOWED_ORIGIN);
      if (!origin.allowed) {
        return jsonResponse({ error: 'origin-not-allowed' }, 403, null);
      }
      if (request.method === 'OPTIONS') {
        return emptyResponse(204, origin.responseOrigin);
      }
      if (request.method !== 'POST') {
        const response = jsonResponse(
          { error: 'method-not-allowed' },
          405,
          origin.responseOrigin,
        );
        response.headers.set('Allow', 'POST, OPTIONS');
        return response;
      }
      if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        return jsonResponse(
          { error: 'invalid-request' },
          400,
          origin.responseOrigin,
        );
      }

      const clientKey = request.headers.get('cf-connecting-ip') ?? 'anonymous';
      if (env.ENVIRONMENT_RATE_LIMITER) {
        const rateLimit = await env.ENVIRONMENT_RATE_LIMITER.limit({
          key: clientKey,
        });
        if (!rateLimit.success) {
          const response = jsonResponse(
            { error: 'rate-limited' },
            429,
            origin.responseOrigin,
          );
          response.headers.set('Retry-After', '60');
          return response;
        }
      }

      const grid = await parseRequestGrid(request);
      if (!grid) {
        return jsonResponse(
          { error: 'invalid-request' },
          400,
          origin.responseOrigin,
        );
      }
      const now = dependencies.now();
      if (!Number.isFinite(now.getTime())) {
        return jsonResponse(
          { error: 'temporarily-unavailable' },
          503,
          origin.responseOrigin,
        );
      }

      const [weatherResult, airQualityResult] = await Promise.allSettled([
        fetchKmaForecast({
          serviceKey: env.KMA_SERVICE_KEY,
          ...grid,
          now,
          fetchImpl: dependencies.fetchImpl,
          cache: dependencies.cache,
          context,
        }),
        fetchAirQuality({
          serviceKey: env.AIRKOREA_SERVICE_KEY,
          ...grid,
          fetchImpl: dependencies.fetchImpl,
          cache: dependencies.cache,
          context,
        }),
      ]);
      const payload: EnvironmentBriefingPayload = {
        schemaVersion: 1,
        fetchedAt: now.toISOString(),
        weather:
          weatherResult.status === 'fulfilled'
            ? weatherResult.value
            : unavailableWeather(failureReason(weatherResult.reason)),
        airQuality:
          airQualityResult.status === 'fulfilled'
            ? airQualityResult.value
            : unavailableAirQuality(failureReason(airQualityResult.reason)),
      };
      return jsonResponse(payload, 200, origin.responseOrigin);
    },
  };
}

export default createEnvironmentBriefingWorker();
