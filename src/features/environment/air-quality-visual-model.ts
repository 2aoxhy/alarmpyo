import type { AirQualityGrade } from '../../application/environment/environment-types';

export type { AirQualityGrade } from '../../application/environment/environment-types';

export type AirQualityIconVariant =
  | 'clear-face'
  | 'particle-face'
  | 'kf-mask'
  | 'respirator'
  | 'unknown';

export type AirQualityVisualTone =
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';

export type AirQualityVisual = Readonly<{
  icon: AirQualityIconVariant;
  tone: AirQualityVisualTone;
}>;

const AIR_QUALITY_VISUALS: Readonly<Record<AirQualityGrade, AirQualityVisual>> = {
  good: { icon: 'clear-face', tone: 'info' },
  moderate: { icon: 'particle-face', tone: 'success' },
  bad: { icon: 'kf-mask', tone: 'warning' },
  'very-bad': { icon: 'respirator', tone: 'danger' },
  unknown: { icon: 'unknown', tone: 'neutral' },
};

export function resolveAirQualityVisual(
  grade: AirQualityGrade,
): AirQualityVisual {
  return AIR_QUALITY_VISUALS[grade];
}
