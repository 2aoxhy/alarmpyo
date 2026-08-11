import Constants from 'expo-constants';
import { Linking } from 'react-native';

import {
  GOOGLE_PLAY_PACKAGE_ID,
  resolveAppDistribution,
  type AppDistribution,
} from '@/services/app-distribution-policy';

export {
  GOOGLE_PLAY_PACKAGE_ID,
  resolveAppDistribution,
  type AppDistribution,
} from '@/services/app-distribution-policy';

export function getAppDistribution(): AppDistribution {
  return resolveAppDistribution(Constants.expoConfig?.extra?.distribution);
}

export async function openGooglePlayListing(): Promise<void> {
  const marketUrl = `market://details?id=${GOOGLE_PLAY_PACKAGE_ID}`;
  const webUrl = `https://play.google.com/store/apps/details?id=${GOOGLE_PLAY_PACKAGE_ID}`;

  try {
    await Linking.openURL(marketUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
}
