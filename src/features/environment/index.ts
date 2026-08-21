export {
  buildEnvironmentBriefingViewModel,
  type EnvironmentAirQualityPresentation,
  type EnvironmentBriefingTarget,
  type EnvironmentBriefingViewModel,
  type EnvironmentWeatherPresentation,
} from '../../application/environment/environment-presentation';
export {
  ENVIRONMENT_CACHE_STORAGE_KEY,
  ENVIRONMENT_SETTINGS_STORAGE_KEY,
  type AirQualityGrade,
  type EnvironmentBriefingPayload,
  type EnvironmentBriefingSnapshot,
  type ManualEnvironmentRegion,
} from '../../application/environment/environment-types';

export {
  createEnvironmentBriefingController,
  type EnvironmentBriefingController,
  type EnvironmentBriefingControllerDependencies,
} from './environment-briefing-controller';
export {
  AirQualityIcon,
  resolveAirQualityVisual,
  type AirQualityIconVariant,
  type AirQualityVisual,
  type AirQualityVisualTone,
} from './air-quality-visual';
export { useEnvironmentBriefingController } from './use-environment-briefing-controller';
