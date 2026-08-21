import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useAppLifecycle } from '../../hooks/use-app-active';

import type { EnvironmentBriefingController } from './environment-briefing-controller';
import { environmentBriefingController } from './environment-native-controller';

export type UseEnvironmentBriefingControllerOptions = Readonly<{
  enabled?: boolean;
  controller?: EnvironmentBriefingController;
}>;

/**
 * Today-screen React binding. Permission prompts remain action-only; returning
 * to the foreground merely refreshes an already configured location.
 */
export function useEnvironmentBriefingController({
  enabled = true,
  controller = environmentBriefingController,
}: UseEnvironmentBriefingControllerOptions = {}) {
  const lifecycle = useAppLifecycle();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    if (!enabled) return;
    void controller.initialize();
  }, [controller, enabled]);

  useEffect(() => {
    if (!enabled || !lifecycle.active || lifecycle.transitionId === 0) return;
    void controller.refresh({
      manual: false,
      reacquireLocation: true,
    });
  }, [controller, enabled, lifecycle.active, lifecycle.transitionId]);

  return {
    ...snapshot,
    requestAutomaticLocation: useCallback(
      () => controller.requestAutomaticLocation(),
      [controller],
    ),
    selectManualRegion: useCallback(
      (region: Parameters<EnvironmentBriefingController['selectManualRegion']>[0]) =>
        controller.selectManualRegion(region),
      [controller],
    ),
    refresh: useCallback(
      () => controller.refresh({ manual: true, reacquireLocation: true }),
      [controller],
    ),
    disable: useCallback(() => controller.disable(), [controller]),
  };
}
