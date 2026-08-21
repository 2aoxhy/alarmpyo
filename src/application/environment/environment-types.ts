export const ENVIRONMENT_BRIEFING_SCHEMA_VERSION = 1 as const;

export const ENVIRONMENT_SETTINGS_STORAGE_KEY =
  'alarmpyo:environment-settings:v1';
export const ENVIRONMENT_CACHE_STORAGE_KEY =
  'alarmpyo:environment-cache:v1';

export const ENVIRONMENT_FRESH_CACHE_MS = 30 * 60 * 1_000;
export const ENVIRONMENT_STALE_CACHE_MS = 6 * 60 * 60 * 1_000;
export const ENVIRONMENT_MANUAL_REFRESH_COOLDOWN_MS = 5 * 60 * 1_000;
export const ENVIRONMENT_LOCATION_TIMEOUT_MS = 5_000;

export type KmaGrid = Readonly<{
  nx: number;
  ny: number;
}>;

export type EnvironmentLocationMode = 'automatic' | 'manual';

/**
 * This record intentionally contains a 5 km KMA grid only. Raw latitude and
 * longitude must remain ephemeral inside the foreground location adapter.
 */
export type EnvironmentSettings = Readonly<{
  schemaVersion: typeof ENVIRONMENT_BRIEFING_SCHEMA_VERSION;
  mode: EnvironmentLocationMode;
  grid: KmaGrid;
  regionName: string;
}>;

export type AirQualityGrade =
  | 'good'
  | 'moderate'
  | 'bad'
  | 'very-bad'
  | 'unknown';

export type WeatherPrecipitationType =
  | 'none'
  | 'rain'
  | 'rain-snow'
  | 'snow'
  | 'shower'
  | 'unknown';

export type WeatherSky =
  | 'clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'unknown';

export type WeatherForecastHour = Readonly<{
  at: string;
  temperatureCelsius: number | null;
  precipitationProbability: number | null;
  precipitationType: WeatherPrecipitationType;
  sky: WeatherSky;
  windSpeedMetersPerSecond: number | null;
}>;

export type EnvironmentProviderFailureReason =
  | 'auth'
  | 'invalid-response'
  | 'no-data'
  | 'quota'
  | 'timeout'
  | 'upstream';

export type WeatherProviderResult =
  | Readonly<{
      status: 'ready';
      issuedAt: string;
      hours: readonly WeatherForecastHour[];
    }>
  | Readonly<{
      status: 'unavailable';
      reason: EnvironmentProviderFailureReason;
    }>;

export type AirQualityProviderResult =
  | Readonly<{
      status: 'ready';
      stationName: string;
      observedAt: string;
      grade: AirQualityGrade;
      overallIndex: number | null;
      pm10MicrogramsPerCubicMeter: number | null;
      pm25MicrogramsPerCubicMeter: number | null;
    }>
  | Readonly<{
      status: 'unavailable';
      reason: EnvironmentProviderFailureReason;
    }>;

export type EnvironmentBriefingPayload = Readonly<{
  schemaVersion: typeof ENVIRONMENT_BRIEFING_SCHEMA_VERSION;
  fetchedAt: string;
  weather: WeatherProviderResult;
  airQuality: AirQualityProviderResult;
}>;

export type EnvironmentCacheEntry = Readonly<{
  schemaVersion: typeof ENVIRONMENT_BRIEFING_SCHEMA_VERSION;
  savedAt: string;
  grid: KmaGrid;
  regionName: string;
  payload: EnvironmentBriefingPayload;
}>;

export type ForegroundLocationPermission =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'undetermined';

export type ForegroundApproximatePosition = Readonly<{
  latitude: number;
  longitude: number;
}>;

export interface ForegroundLocationGateway {
  getPermission(): Promise<ForegroundLocationPermission>;
  requestPermission(): Promise<ForegroundLocationPermission>;
  getApproximatePosition(timeoutMs: number): Promise<ForegroundApproximatePosition>;
}

export interface EnvironmentBriefingGateway {
  fetch(grid: KmaGrid): Promise<EnvironmentBriefingPayload>;
}

export interface EnvironmentLocalRepository {
  readSettings(): Promise<EnvironmentSettings | null>;
  writeSettings(settings: EnvironmentSettings): Promise<void>;
  readCache(): Promise<EnvironmentCacheEntry | null>;
  writeCache(entry: EnvironmentCacheEntry): Promise<void>;
  clear(): Promise<void>;
}

export interface EnvironmentClock {
  now(): Date;
}

export type EnvironmentBriefingStatus =
  | 'permission-required'
  | 'loading'
  | 'ready'
  | 'stale'
  | 'partial'
  | 'unavailable';

export type EnvironmentBriefingFailure =
  | 'location-outside-korea'
  | 'location-permission-denied'
  | 'location-unavailable'
  | 'network'
  | 'not-configured'
  | 'provider-unavailable'
  | 'storage';

export type EnvironmentBriefingSnapshot = Readonly<{
  status: EnvironmentBriefingStatus;
  enabled: boolean;
  mode: EnvironmentLocationMode | null;
  regionName: string | null;
  payload: EnvironmentBriefingPayload | null;
  updatedAt: string | null;
  isRefreshing: boolean;
  permission: ForegroundLocationPermission;
  failure: EnvironmentBriefingFailure | null;
  canRefresh: boolean;
}>;

export type ManualEnvironmentRegion = Readonly<{
  regionName: string;
  grid: KmaGrid;
}>;
