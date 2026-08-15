import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import {
  createAppLifecycleCoordinator,
} from '@/services/app-lifecycle-coordinator';
import { getAlarmPyoAlarmStatus } from '@/services/alarmpyo-alarm-service';
import { getAlarmPyoSleepReminderStatus } from '@/services/sleep-reminder-service';

import { useAppLifecycle } from './use-app-active';

const runtimeCoordinator = createAppLifecycleCoordinator({
  readAlarmStatus: getAlarmPyoAlarmStatus,
  readSleepReminderStatus: getAlarmPyoSleepReminderStatus,
});

export function useAlarmRuntimeStatus({
  enabled,
  includeSleepReminder,
  revisionKey = '',
}: {
  enabled: boolean;
  includeSleepReminder: boolean;
  revisionKey?: string;
}) {
  const lifecycle = useAppLifecycle();
  const snapshot = useSyncExternalStore(
    runtimeCoordinator.subscribe,
    runtimeCoordinator.getSnapshot,
    runtimeCoordinator.getSnapshot,
  );

  useEffect(() => {
    if (
      !enabled ||
      !lifecycle.active ||
      Platform.OS !== 'android'
    ) {
      return;
    }
    void runtimeCoordinator.refresh({
      transitionId: lifecycle.transitionId,
      includeSleepReminder,
      revisionKey,
    });
  }, [
    enabled,
    includeSleepReminder,
    lifecycle.active,
    lifecycle.transitionId,
    revisionKey,
  ]);

  const refresh = useCallback(async (force = false) => {
    if (Platform.OS !== 'android') return runtimeCoordinator.getSnapshot();
    if (force) runtimeCoordinator.invalidate();
    return runtimeCoordinator.refresh({
      transitionId: lifecycle.transitionId,
      includeSleepReminder,
      revisionKey,
      force,
    });
  }, [includeSleepReminder, lifecycle.transitionId, revisionKey]);

  return { ...snapshot, refresh };
}
