import type {
  AirQualityGrade,
  AirQualityProviderResult,
  EnvironmentBriefingPayload,
  WeatherForecastHour,
} from './environment-types';

const HOUR_MS = 60 * 60 * 1_000;
const KOREA_OFFSET_MS = 9 * HOUR_MS;
const MAX_FORECAST_DISTANCE_MS = 90 * 60 * 1_000;
const MAX_AIR_QUALITY_AGE_MS = 6 * HOUR_MS;
const DELAYED_AIR_QUALITY_AGE_MS = 2 * HOUR_MS;

export type EnvironmentBriefingTarget = Readonly<{
  kind: 'depart' | 'return' | 'current';
  at: number;
}>;

export type EnvironmentWeatherPresentation = Readonly<{
  label: '출근' | '퇴근' | '현재';
  at: string;
  timeLabel: string;
  temperatureLabel: string | null;
  precipitationLabel: string | null;
  umbrellaRecommended: boolean;
  line: string;
}>;

export type EnvironmentAirQualityPresentation = Readonly<{
  grade: AirQualityGrade;
  gradeLabel: '좋음' | '보통' | '나쁨' | '매우 나쁨' | '정보 없음';
  stationName: string;
  observedAt: string;
  observedTimeLabel: string;
  delayed: boolean;
  line: string;
  detailLine: string | null;
}>;

export type EnvironmentBriefingViewModel = Readonly<{
  weather: EnvironmentWeatherPresentation | null;
  airQuality: EnvironmentAirQualityPresentation | null;
  attribution: '기상청 · 한국환경공단 에어코리아';
}>;

function formatKoreaClock(timestamp: number): string {
  const koreaDate = new Date(timestamp + KOREA_OFFSET_MS);
  return `${String(koreaDate.getUTCHours()).padStart(2, '0')}:${String(
    koreaDate.getUTCMinutes(),
  ).padStart(2, '0')}`;
}

function getTargetLabel(
  kind: EnvironmentBriefingTarget['kind'],
): EnvironmentWeatherPresentation['label'] {
  if (kind === 'depart') return '출근';
  if (kind === 'return') return '퇴근';
  return '현재';
}

function getGradeLabel(
  grade: AirQualityGrade,
): EnvironmentAirQualityPresentation['gradeLabel'] {
  switch (grade) {
    case 'good':
      return '좋음';
    case 'moderate':
      return '보통';
    case 'bad':
      return '나쁨';
    case 'very-bad':
      return '매우 나쁨';
    default:
      return '정보 없음';
  }
}

function selectForecastHour(
  hours: readonly WeatherForecastHour[],
  targetAt: number,
): WeatherForecastHour | null {
  let selected: WeatherForecastHour | null = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const hour of hours) {
    const at = Date.parse(hour.at);
    if (!Number.isFinite(at)) continue;
    const distance = Math.abs(at - targetAt);
    if (distance < selectedDistance) {
      selected = hour;
      selectedDistance = distance;
    }
  }
  return selectedDistance <= MAX_FORECAST_DISTANCE_MS ? selected : null;
}

function hasPrecipitation(hour: WeatherForecastHour): boolean {
  return hour.precipitationType !== 'none' && hour.precipitationType !== 'unknown';
}

function buildWeatherPresentation(
  hour: WeatherForecastHour,
  target: EnvironmentBriefingTarget,
): EnvironmentWeatherPresentation {
  const label = getTargetLabel(target.kind);
  const forecastAt = Date.parse(hour.at);
  const timeLabel = formatKoreaClock(target.at);
  const temperatureLabel =
    hour.temperatureCelsius === null
      ? null
      : `${Math.round(hour.temperatureCelsius)}°C`;
  const precipitationLabel =
    hour.precipitationProbability === null
      ? hasPrecipitation(hour)
        ? '비 예보'
        : null
      : `비 ${Math.round(hour.precipitationProbability)}%`;
  const umbrellaRecommended =
    hasPrecipitation(hour) ||
    (hour.precipitationProbability !== null &&
      hour.precipitationProbability >= 50);
  const parts = [
    `${label} ${timeLabel}`,
    temperatureLabel,
    precipitationLabel,
    umbrellaRecommended ? '우산 권장' : null,
  ].filter((part): part is string => Boolean(part));
  return {
    label,
    at: new Date(forecastAt).toISOString(),
    timeLabel,
    temperatureLabel,
    precipitationLabel,
    umbrellaRecommended,
    line: parts.join(' · '),
  };
}

function buildAirQualityPresentation(
  airQuality: AirQualityProviderResult,
  nowAt: number,
): EnvironmentAirQualityPresentation | null {
  if (airQuality.status !== 'ready') return null;
  const observedAt = Date.parse(airQuality.observedAt);
  if (!Number.isFinite(observedAt)) return null;
  const age = Math.max(0, nowAt - observedAt);
  if (age > MAX_AIR_QUALITY_AGE_MS) return null;
  const gradeLabel = getGradeLabel(airQuality.grade);
  const observedTimeLabel = formatKoreaClock(observedAt);
  const delayed = age > DELAYED_AIR_QUALITY_AGE_MS;
  const pm10 = airQuality.pm10MicrogramsPerCubicMeter;
  const pm25 = airQuality.pm25MicrogramsPerCubicMeter;
  const detailLine =
    pm10 !== null && pm25 !== null
      ? `미세 ${Math.round(pm10)} · 초미세 ${Math.round(pm25)}㎍/㎥`
      : pm10 !== null
        ? `미세먼지 ${Math.round(pm10)}㎍/㎥`
        : pm25 !== null
          ? `초미세먼지 ${Math.round(pm25)}㎍/㎥`
          : null;
  return {
    grade: airQuality.grade,
    gradeLabel,
    stationName: airQuality.stationName,
    observedAt: airQuality.observedAt,
    observedTimeLabel,
    delayed,
    line: `현재 공기 ${gradeLabel} · ${observedTimeLabel} 측정${
      delayed ? ' · 정보 지연' : ''
    }`,
    detailLine,
  };
}

export function buildEnvironmentBriefingViewModel(
  payload: EnvironmentBriefingPayload,
  options: Readonly<{
    now: Date;
    target?: EnvironmentBriefingTarget | null;
  }>,
): EnvironmentBriefingViewModel {
  const nowAt = options.now.getTime();
  const target = options.target ?? { kind: 'current' as const, at: nowAt };
  const forecast =
    payload.weather.status === 'ready'
      ? selectForecastHour(payload.weather.hours, target.at)
      : null;
  return {
    weather: forecast ? buildWeatherPresentation(forecast, target) : null,
    airQuality: buildAirQualityPresentation(payload.airQuality, nowAt),
    attribution: '기상청 · 한국환경공단 에어코리아',
  };
}
