import {
  type AirQualityGrade,
  type AirQualityProviderResult,
  type EnvironmentCache,
  type EnvironmentExecutionContext,
  type EnvironmentProviderFailureReason,
  ProviderError,
  type WeatherForecastHour,
  type WeatherProviderResult,
} from './contracts';
import { geographicToKoreaTm, kmaGridToGeographic } from './projection';

const KMA_ENDPOINT =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const AIRKOREA_STATION_ENDPOINT =
  'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList';
const AIRKOREA_MEASUREMENT_ENDPOINT =
  'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty';
const KOREA_OFFSET_MS = 9 * 60 * 60 * 1_000;
const PROVIDER_TIMEOUT_MS = 5_000;
const MAX_UPSTREAM_RESPONSE_BYTES = 2 * 1_024 * 1_024;
const KMA_CACHE_SECONDS = 30 * 60;
const AIR_QUALITY_CACHE_SECONDS = 60 * 60;
const STATION_CACHE_SECONDS = 24 * 60 * 60;
const KMA_BASE_TIMES = [2, 5, 8, 11, 14, 17, 20, 23] as const;

type FetchImplementation = typeof fetch;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toItemArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => item !== null);
  }
  const item = asRecord(value);
  return item ? [item] : [];
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const parsed = nullableNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function mapHttpFailure(status: number): EnvironmentProviderFailureReason {
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'quota';
  return 'upstream';
}

function mapProviderResultCode(code: unknown): EnvironmentProviderFailureReason {
  const normalized = String(code ?? '').padStart(2, '0');
  if (normalized === '03') return 'no-data';
  if (normalized === '05') return 'timeout';
  if (normalized === '20' || normalized === '30' || normalized === '31') {
    return 'auth';
  }
  if (normalized === '22' || normalized === '23') return 'quota';
  return 'upstream';
}

async function fetchProviderJson(
  fetchImpl: FetchImplementation,
  url: URL,
): Promise<unknown> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: abortController.signal,
    });
    if (!response.ok) throw new ProviderError(mapHttpFailure(response.status));
    const declaredLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_UPSTREAM_RESPONSE_BYTES
    ) {
      throw new ProviderError('invalid-response');
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_UPSTREAM_RESPONSE_BYTES) {
      throw new ProviderError('invalid-response');
    }
    let raw: string;
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new ProviderError('invalid-response');
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new ProviderError('invalid-response');
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (abortController.signal.aborted) throw new ProviderError('timeout');
    throw new ProviderError('upstream');
  } finally {
    clearTimeout(timeout);
  }
}

async function readCachedJson<T>(
  cache: EnvironmentCache | undefined,
  key: string,
): Promise<T | null> {
  if (!cache) return null;
  try {
    const response = await cache.match(new Request(key));
    return response ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

function writeCachedJson(
  cache: EnvironmentCache | undefined,
  context: EnvironmentExecutionContext,
  key: string,
  value: unknown,
  maxAgeSeconds: number,
) {
  if (!cache) return;
  const response = new Response(JSON.stringify(value), {
    headers: {
      'Cache-Control': `public, max-age=${maxAgeSeconds}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  context.waitUntil(cache.put(new Request(key), response));
}

function toKoreaDateParts(timestamp: number): {
  date: string;
  hour: number;
  minute: number;
} {
  const date = new Date(timestamp + KOREA_OFFSET_MS);
  return {
    date: `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}${String(date.getUTCDate()).padStart(2, '0')}`,
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function formatKoreaIssueTimestamp(date: string, time: string): string {
  return new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(
      0,
      2,
    )}:${time.slice(2, 4)}:00+09:00`,
  ).toISOString();
}

export type KmaIssue = Readonly<{ date: string; time: string }>;

/** Uses a 15-minute publication grace period before selecting a base issue. */
export function getKmaIssue(now: Date, previousCount = 0): KmaIssue {
  const graceAdjusted = now.getTime() - 15 * 60 * 1_000;
  const candidates: KmaIssue[] = [];
  for (let daysBack = 0; candidates.length <= previousCount; daysBack += 1) {
    const parts = toKoreaDateParts(graceAdjusted - daysBack * 24 * 60 * 60 * 1_000);
    const hours =
      daysBack === 0
        ? [...KMA_BASE_TIMES].filter((hour) => hour <= parts.hour).reverse()
        : [...KMA_BASE_TIMES].reverse();
    for (const hour of hours) {
      candidates.push({
        date: parts.date,
        time: `${String(hour).padStart(2, '0')}00`,
      });
    }
  }
  return candidates[previousCount]!;
}

function parseForecastTimestamp(date: unknown, time: unknown): string | null {
  const normalizedDate = String(date ?? '');
  const normalizedTime = String(time ?? '').padStart(4, '0');
  if (!/^\d{8}$/.test(normalizedDate) || !/^\d{4}$/.test(normalizedTime)) {
    return null;
  }
  const timestamp = Date.parse(
    `${normalizedDate.slice(0, 4)}-${normalizedDate.slice(
      4,
      6,
    )}-${normalizedDate.slice(6, 8)}T${normalizedTime.slice(
      0,
      2,
    )}:${normalizedTime.slice(2, 4)}:00+09:00`,
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function mapPrecipitation(value: unknown): WeatherForecastHour['precipitationType'] {
  switch (String(value ?? '')) {
    case '0':
      return 'none';
    case '1':
    case '4':
    case '5':
      return 'rain';
    case '2':
    case '6':
      return 'rain-snow';
    case '3':
    case '7':
      return 'snow';
    default:
      return 'unknown';
  }
}

function mapSky(value: unknown): WeatherForecastHour['sky'] {
  if (String(value) === '1') return 'clear';
  if (String(value) === '3') return 'partly-cloudy';
  if (String(value) === '4') return 'overcast';
  return 'unknown';
}

export function parseKmaForecast(
  value: unknown,
  issue: KmaIssue,
  now: Date,
): WeatherProviderResult {
  const root = asRecord(value);
  const response = asRecord(root?.response);
  const header = asRecord(response?.header);
  if (!header || String(header.resultCode) !== '00') {
    throw new ProviderError(mapProviderResultCode(header?.resultCode));
  }
  const body = asRecord(response?.body);
  const items = asRecord(body?.items);
  const rows = toItemArray(items?.item);
  if (rows.length === 0) throw new ProviderError('no-data');

  type MutableForecast = {
    at: string;
    temperatureCelsius: number | null;
    precipitationProbability: number | null;
    precipitationType: WeatherForecastHour['precipitationType'];
    sky: WeatherForecastHour['sky'];
    windSpeedMetersPerSecond: number | null;
  };
  const grouped = new Map<string, MutableForecast>();
  for (const row of rows) {
    const at = parseForecastTimestamp(row.fcstDate, row.fcstTime);
    if (!at) continue;
    const current = grouped.get(at) ?? {
      at,
      temperatureCelsius: null,
      precipitationProbability: null,
      precipitationType: 'unknown',
      sky: 'unknown',
      windSpeedMetersPerSecond: null,
    };
    switch (row.category) {
      case 'TMP':
        current.temperatureCelsius = boundedNumber(row.fcstValue, -100, 100);
        break;
      case 'POP':
        current.precipitationProbability = boundedNumber(row.fcstValue, 0, 100);
        break;
      case 'PTY':
        current.precipitationType = mapPrecipitation(row.fcstValue);
        break;
      case 'SKY':
        current.sky = mapSky(row.fcstValue);
        break;
      case 'WSD':
        current.windSpeedMetersPerSecond = boundedNumber(row.fcstValue, 0, 200);
        break;
      default:
        break;
    }
    grouped.set(at, current);
  }

  const earliest = now.getTime() - 60 * 60 * 1_000;
  const latest = now.getTime() + 48 * 60 * 60 * 1_000;
  const hours = [...grouped.values()]
    .filter((hour) => {
      const timestamp = Date.parse(hour.at);
      return timestamp >= earliest && timestamp <= latest;
    })
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    .slice(0, 72);
  if (hours.length === 0) throw new ProviderError('no-data');
  return {
    status: 'ready',
    issuedAt: formatKoreaIssueTimestamp(issue.date, issue.time),
    hours,
  };
}

async function fetchKmaIssue(
  input: Readonly<{
    serviceKey: string;
    nx: number;
    ny: number;
    issue: KmaIssue;
    now: Date;
    fetchImpl: FetchImplementation;
    cache?: EnvironmentCache;
    context: EnvironmentExecutionContext;
  }>,
): Promise<WeatherProviderResult> {
  const cacheKey = `https://environment-cache.invalid/kma/${input.issue.date}/${input.issue.time}/${input.nx}/${input.ny}`;
  const cached = await readCachedJson<WeatherProviderResult>(input.cache, cacheKey);
  if (cached?.status === 'ready') return cached;

  const url = new URL(KMA_ENDPOINT);
  url.searchParams.set('serviceKey', input.serviceKey);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1000');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('base_date', input.issue.date);
  url.searchParams.set('base_time', input.issue.time);
  url.searchParams.set('nx', String(input.nx));
  url.searchParams.set('ny', String(input.ny));
  const value = await fetchProviderJson(input.fetchImpl, url);
  const result = parseKmaForecast(value, input.issue, input.now);
  writeCachedJson(
    input.cache,
    input.context,
    cacheKey,
    result,
    KMA_CACHE_SECONDS,
  );
  return result;
}

export async function fetchKmaForecast(input: Readonly<{
  serviceKey: string | undefined;
  nx: number;
  ny: number;
  now: Date;
  fetchImpl: FetchImplementation;
  cache?: EnvironmentCache;
  context: EnvironmentExecutionContext;
}>): Promise<WeatherProviderResult> {
  if (!input.serviceKey?.trim()) throw new ProviderError('auth');
  let lastNoData: ProviderError | null = null;
  for (let previousCount = 0; previousCount < 2; previousCount += 1) {
    try {
      return await fetchKmaIssue({
        ...input,
        serviceKey: input.serviceKey,
        issue: getKmaIssue(input.now, previousCount),
      });
    } catch (error) {
      if (error instanceof ProviderError && error.reason === 'no-data') {
        lastNoData = error;
        continue;
      }
      throw error;
    }
  }
  throw lastNoData ?? new ProviderError('no-data');
}

function extractPublicDataItems(value: unknown): Record<string, unknown>[] {
  const root = asRecord(value);
  const response = asRecord(root?.response);
  const header = asRecord(response?.header);
  if (!header || String(header.resultCode) !== '00') {
    throw new ProviderError(mapProviderResultCode(header?.resultCode));
  }
  const body = asRecord(response?.body);
  return toItemArray(body?.items);
}

function parseAirKoreaTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const timestamp = Date.parse(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00`,
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function gradeFromProvider(item: Record<string, unknown>): AirQualityGrade {
  const preferred = nullableNumber(item.khaiGrade);
  const componentGrades = [
    nullableNumber(item.pm10Grade1h),
    nullableNumber(item.pm25Grade1h),
  ].filter((grade): grade is number => grade !== null);
  const grade = preferred ?? (componentGrades.length ? Math.max(...componentGrades) : null);
  if (grade === 1) return 'good';
  if (grade === 2) return 'moderate';
  if (grade === 3) return 'bad';
  if (grade === 4) return 'very-bad';
  return 'unknown';
}

async function findNearbyStation(input: Readonly<{
  serviceKey: string;
  nx: number;
  ny: number;
  fetchImpl: FetchImplementation;
  cache?: EnvironmentCache;
  context: EnvironmentExecutionContext;
}>): Promise<string> {
  const cacheKey = `https://environment-cache.invalid/air/station/${input.nx}/${input.ny}`;
  const cached = await readCachedJson<{ stationName?: unknown }>(
    input.cache,
    cacheKey,
  );
  if (
    typeof cached?.stationName === 'string' &&
    cached.stationName.length > 0 &&
    cached.stationName.length <= 80
  ) {
    return cached.stationName;
  }
  const geographic = kmaGridToGeographic(input.nx, input.ny);
  const tm = geographicToKoreaTm(geographic.latitude, geographic.longitude);
  const url = new URL(AIRKOREA_STATION_ENDPOINT);
  url.searchParams.set('serviceKey', input.serviceKey);
  url.searchParams.set('returnType', 'json');
  url.searchParams.set('tmX', tm.x.toFixed(3));
  url.searchParams.set('tmY', tm.y.toFixed(3));
  url.searchParams.set('ver', '1.1');
  const rows = extractPublicDataItems(
    await fetchProviderJson(input.fetchImpl, url),
  ).sort(
    (left, right) =>
      (nullableNumber(left.tm) ?? Number.POSITIVE_INFINITY) -
      (nullableNumber(right.tm) ?? Number.POSITIVE_INFINITY),
  );
  const stationName = rows.find(
    (row) =>
      typeof row.stationName === 'string' &&
      row.stationName.trim().length > 0 &&
      row.stationName.length <= 80,
  )?.stationName;
  if (typeof stationName !== 'string') throw new ProviderError('no-data');
  const trimmed = stationName.trim();
  writeCachedJson(
    input.cache,
    input.context,
    cacheKey,
    { stationName: trimmed },
    STATION_CACHE_SECONDS,
  );
  return trimmed;
}

export async function fetchAirQuality(input: Readonly<{
  serviceKey: string | undefined;
  nx: number;
  ny: number;
  fetchImpl: FetchImplementation;
  cache?: EnvironmentCache;
  context: EnvironmentExecutionContext;
}>): Promise<AirQualityProviderResult> {
  if (!input.serviceKey?.trim()) throw new ProviderError('auth');
  const stationName = await findNearbyStation({
    ...input,
    serviceKey: input.serviceKey,
  });
  const cacheKey = `https://environment-cache.invalid/air/measurement/${encodeURIComponent(
    stationName,
  )}`;
  const cached = await readCachedJson<AirQualityProviderResult>(
    input.cache,
    cacheKey,
  );
  if (cached?.status === 'ready') return cached;

  const url = new URL(AIRKOREA_MEASUREMENT_ENDPOINT);
  url.searchParams.set('serviceKey', input.serviceKey);
  url.searchParams.set('returnType', 'json');
  url.searchParams.set('numOfRows', '1');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('stationName', stationName);
  url.searchParams.set('dataTerm', 'DAILY');
  url.searchParams.set('ver', '1.3');
  const item = extractPublicDataItems(
    await fetchProviderJson(input.fetchImpl, url),
  )[0];
  if (!item) throw new ProviderError('no-data');
  const observedAt = parseAirKoreaTimestamp(item.dataTime);
  if (!observedAt) throw new ProviderError('invalid-response');
  const result: AirQualityProviderResult = {
    status: 'ready',
    stationName,
    observedAt,
    grade: gradeFromProvider(item),
    overallIndex: boundedNumber(item.khaiValue, 0, 10_000),
    pm10MicrogramsPerCubicMeter: boundedNumber(item.pm10Value, 0, 10_000),
    pm25MicrogramsPerCubicMeter: boundedNumber(item.pm25Value, 0, 10_000),
  };
  writeCachedJson(
    input.cache,
    input.context,
    cacheKey,
    result,
    AIR_QUALITY_CACHE_SECONDS,
  );
  return result;
}
