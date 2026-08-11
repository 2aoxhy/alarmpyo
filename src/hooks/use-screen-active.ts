import { useIsFocused } from 'expo-router';

import { useAppActive } from '@/hooks/use-app-active';

export function useScreenActive() {
  const isFocused = useIsFocused();
  const appActive = useAppActive();

  return isFocused && appActive;
}
