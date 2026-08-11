export type AppDistribution = 'direct' | 'play';

export const GOOGLE_PLAY_PACKAGE_ID = 'com.personal.alarmpyo';

export function resolveAppDistribution(value: unknown): AppDistribution {
  return value === 'play' ? 'play' : 'direct';
}
