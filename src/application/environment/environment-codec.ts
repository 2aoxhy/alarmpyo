import {
  ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
  type AirQualityGrade,
  type AirQualityProviderResult,
  type EnvironmentBriefingPayload,
  type EnvironmentCacheEntry,
  type EnvironmentProviderFailureReason,
  type EnvironmentSettings,
  type WeatherForecastHour,
  type WeatherPrecipitationType,
  type WeatherProviderResult,
  type WeatherSky,
} from './environment-types';
import { isValidKmaGrid } from './kma-grid';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    Number.isFinite(Date.parse(value))
  );
}

function isShortText(value: unknown, maxLength = 80): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function nullableNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= minimum &&
      value <= maximum)
  );
}

const PROVIDER_FAILURE_REASONS = new Set<EnvironmentProviderFailureReason>([
  'auth',
  'invalid-response',
  'no-data',
  'quota',
  'timeout',
  'upstream',
]);
const PRECIPITATION_TYPES = new Set<WeatherPrecipitationType>([
  'none',
  'rain',
  'rain-snow',
  'snow',
  'shower',
  'unknown',
]);
const SKY_TYPES = new Set<WeatherSky>([
  'clear',
  'partly-cloudy',
  'overcast',
  'unknown',
]);
const AIR_QUALITY_GRADES = new Set<AirQualityGrade>([
  'good',
  'moderate',
  'bad',
  'very-bad',
  'unknown',
]);

function parseFailure(
  value: Record<string, unknown>,
): EnvironmentProviderFailureReason | null {
  return typeof value.reason === 'string' &&
    PROVIDER_FAILURE_REASONS.has(value.reason as EnvironmentProviderFailureReason)
    ? (value.reason as EnvironmentProviderFailureReason)
    : null;
}

function parseWeatherHour(value: unknown): WeatherForecastHour | null {
  const item = asRecord(value);
  if (
    !item ||
    !isIsoTimestamp(item.at) ||
    !nullableNumberInRange(item.temperatureCelsius, -100, 100) ||
    !nullableNumberInRange(item.precipitationProbability, 0, 100) ||
    typeof item.precipitationType !== 'string' ||
    !PRECIPITATION_TYPES.has(
      item.precipitationType as WeatherPrecipitationType,
    ) ||
    typeof item.sky !== 'string' ||
    !SKY_TYPES.has(item.sky as WeatherSky) ||
    !nullableNumberInRange(item.windSpeedMetersPerSecond, 0, 200)
  ) {
    return null;
  }
  return {
    at: item.at,
    temperatureCelsius: item.temperatureCelsius,
    precipitationProbability: item.precipitationProbability,
    precipitationType: item.precipitationType as WeatherPrecipitationType,
    sky: item.sky as WeatherSky,
    windSpeedMetersPerSecond: item.windSpeedMetersPerSecond,
  };
}

function parseWeather(value: unknown): WeatherProviderResult | null {
  const item = asRecord(value);
  if (!item || (item.status !== 'ready' && item.status !== 'unavailable')) {
    return null;
  }
  if (item.status === 'unavailable') {
    const reason = parseFailure(item);
    return reason ? { status: 'unavailable', reason } : null;
  }
  if (
    !isIsoTimestamp(item.issuedAt) ||
    !Array.isArray(item.hours) ||
    item.hours.length === 0 ||
    item.hours.length > 96
  ) {
    return null;
  }
  const parsedHours = item.hours.map(parseWeatherHour);
  if (parsedHours.some((hour) => hour === null)) return null;
  const hours = (parsedHours as WeatherForecastHour[]).sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  );
  if (new Set(hours.map((hour) => hour.at)).size !== hours.length) return null;
  return { status: 'ready', issuedAt: item.issuedAt, hours };
}

function parseAirQuality(value: unknown): AirQualityProviderResult | null {
  const item = asRecord(value);
  if (!item || (item.status !== 'ready' && item.status !== 'unavailable')) {
    return null;
  }
  if (item.status === 'unavailable') {
    const reason = parseFailure(item);
    return reason ? { status: 'unavailable', reason } : null;
  }
  if (
    !isShortText(item.stationName) ||
    !isIsoTimestamp(item.observedAt) ||
    typeof item.grade !== 'string' ||
    !AIR_QUALITY_GRADES.has(item.grade as AirQualityGrade) ||
    !nullableNumberInRange(item.overallIndex, 0, 10_000) ||
    !nullableNumberInRange(item.pm10MicrogramsPerCubicMeter, 0, 10_000) ||
    !nullableNumberInRange(item.pm25MicrogramsPerCubicMeter, 0, 10_000)
  ) {
    return null;
  }
  return {
    status: 'ready',
    stationName: item.stationName.trim(),
    observedAt: item.observedAt,
    grade: item.grade as AirQualityGrade,
    overallIndex: item.overallIndex,
    pm10MicrogramsPerCubicMeter: item.pm10MicrogramsPerCubicMeter,
    pm25MicrogramsPerCubicMeter: item.pm25MicrogramsPerCubicMeter,
  };
}

export function parseEnvironmentBriefingPayload(
  value: unknown,
): EnvironmentBriefingPayload | null {
  const item = asRecord(value);
  if (
    !item ||
    item.schemaVersion !== ENVIRONMENT_BRIEFING_SCHEMA_VERSION ||
    !isIsoTimestamp(item.fetchedAt)
  ) {
    return null;
  }
  const weather = parseWeather(item.weather);
  const airQuality = parseAirQuality(item.airQuality);
  if (!weather || !airQuality) return null;
  return {
    schemaVersion: ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
    fetchedAt: item.fetchedAt,
    weather,
    airQuality,
  };
}

export function parseEnvironmentSettings(
  value: unknown,
): EnvironmentSettings | null {
  const item = asRecord(value);
  if (
    !item ||
    item.schemaVersion !== ENVIRONMENT_BRIEFING_SCHEMA_VERSION ||
    (item.mode !== 'automatic' && item.mode !== 'manual') ||
    !isValidKmaGrid(item.grid) ||
    !isShortText(item.regionName)
  ) {
    return null;
  }
  return {
    schemaVersion: ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
    mode: item.mode,
    grid: { nx: item.grid.nx, ny: item.grid.ny },
    regionName: item.regionName.trim(),
  };
}

export function parseEnvironmentCacheEntry(
  value: unknown,
): EnvironmentCacheEntry | null {
  const item = asRecord(value);
  if (
    !item ||
    item.schemaVersion !== ENVIRONMENT_BRIEFING_SCHEMA_VERSION ||
    !isIsoTimestamp(item.savedAt) ||
    !isValidKmaGrid(item.grid) ||
    !isShortText(item.regionName)
  ) {
    return null;
  }
  const payload = parseEnvironmentBriefingPayload(item.payload);
  if (!payload) return null;
  return {
    schemaVersion: ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
    savedAt: item.savedAt,
    grid: { nx: item.grid.nx, ny: item.grid.ny },
    regionName: item.regionName.trim(),
    payload,
  };
}
