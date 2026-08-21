import type {
  AirQualityGrade,
  AirQualityProviderResult,
  EnvironmentBriefingPayload,
  EnvironmentProviderFailureReason,
  WeatherForecastHour,
  WeatherProviderResult,
} from '../../../src/application/environment/environment-types';

export type {
  AirQualityGrade,
  AirQualityProviderResult,
  EnvironmentBriefingPayload,
  EnvironmentProviderFailureReason,
  WeatherForecastHour,
  WeatherProviderResult,
};

export type EnvironmentWorkerEnv = Readonly<{
  KMA_SERVICE_KEY?: string;
  AIRKOREA_SERVICE_KEY?: string;
  ALLOWED_ORIGIN?: string;
  ENVIRONMENT_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}>;

export type EnvironmentExecutionContext = Readonly<{
  waitUntil(work: Promise<unknown>): void;
}>;

export type EnvironmentCache = Readonly<{
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}>;

export type EnvironmentWorkerDependencies = Readonly<{
  fetchImpl: typeof fetch;
  cache?: EnvironmentCache;
  now(): Date;
}>;

export class ProviderError extends Error {
  readonly reason: EnvironmentProviderFailureReason;

  constructor(reason: EnvironmentProviderFailureReason) {
    super(`Provider request failed: ${reason}`);
    this.name = 'ProviderError';
    this.reason = reason;
  }
}
