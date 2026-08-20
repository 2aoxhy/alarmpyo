import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { useAppLifecycle } from '../../hooks/use-app-active';
import { useAlarmRuntimeStatus } from '../../hooks/use-alarm-runtime-status';
import { openGooglePlayListing } from '../../services/app-distribution';
import {
  completeFlexiblePlayUpdate,
  getPlayUpdateStatusForTransition,
  shouldPollPlayUpdate,
  shouldShowPlayUpdate,
  startFlexiblePlayUpdate,
  type PlayUpdateStatus,
} from '../../services/play-app-update-service';
import { isSleepReminderNativeSupported } from '../../services/sleep-reminder-service';

export type UseTodayRuntimeControllerOptions = {
  enabled: boolean;
  dismissedUpdateVersionCode: number | null;
  sleepReminderEnabled: boolean;
  runtimeRevisionKey?: string;
  dismissUpdate(versionCode: number): Promise<boolean>;
};

/**
 * Owns Today-screen native/update effects. Presentation receives stable
 * commands and state without importing distribution or native services.
 */
export function useTodayRuntimeController({
  enabled,
  dismissedUpdateVersionCode,
  sleepReminderEnabled,
  runtimeRevisionKey = '',
  dismissUpdate,
}: UseTodayRuntimeControllerOptions) {
  const appLifecycle = useAppLifecycle();
  const [playUpdateStatus, setPlayUpdateStatus] =
    useState<PlayUpdateStatus | null>(null);
  const [playUpdateBusy, setPlayUpdateBusy] = useState(false);
  const alarmPlatformSupported = Platform.OS === 'android';
  const sleepReminderSupported =
    alarmPlatformSupported && isSleepReminderNativeSupported();
  const runtimeStatus = useAlarmRuntimeStatus({
    enabled,
    includeSleepReminder: sleepReminderEnabled && sleepReminderSupported,
    revisionKey: runtimeRevisionKey,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getPlayUpdateStatusForTransition(appLifecycle.transitionId).then(
      (status) => {
        if (cancelled) return;
        setPlayUpdateStatus(
          shouldShowPlayUpdate(status, dismissedUpdateVersionCode)
            ? status
            : null,
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [appLifecycle.transitionId, dismissedUpdateVersionCode, enabled]);

  useEffect(() => {
    if (
      !enabled ||
      playUpdateBusy ||
      !playUpdateStatus ||
      !shouldPollPlayUpdate(playUpdateStatus)
    ) {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void getPlayUpdateStatusForTransition(
        appLifecycle.transitionId,
        true,
      ).then((status) => {
        if (!cancelled) {
          setPlayUpdateStatus(
            shouldShowPlayUpdate(status, dismissedUpdateVersionCode)
              ? status
              : null,
          );
        }
      });
    }, 1_500);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    appLifecycle.transitionId,
    dismissedUpdateVersionCode,
    enabled,
    playUpdateBusy,
    playUpdateStatus,
  ]);

  const startPlayUpdate = useCallback(async () => {
    if (!playUpdateStatus || playUpdateBusy) return;
    setPlayUpdateBusy(true);
    try {
      if (!playUpdateStatus.flexibleAllowed) {
        await openGooglePlayListing();
        return;
      }
      const status = await startFlexiblePlayUpdate();
      setPlayUpdateStatus(
        shouldShowPlayUpdate(status, dismissedUpdateVersionCode)
          ? status
          : null,
      );
      if (status.state === 'failed') {
        void AccessibilityInfo.announceForAccessibility(
          '업데이트를 시작하지 못했습니다. 다시 시도할 수 있습니다.',
        );
      }
    } catch {
      void AccessibilityInfo.announceForAccessibility(
        'Google Play 업데이트를 열지 못했습니다.',
      );
    } finally {
      setPlayUpdateBusy(false);
    }
  }, [dismissedUpdateVersionCode, playUpdateBusy, playUpdateStatus]);

  const installPlayUpdate = useCallback(async () => {
    if (!playUpdateStatus || playUpdateBusy) return;
    setPlayUpdateBusy(true);
    try {
      const status = await completeFlexiblePlayUpdate();
      setPlayUpdateStatus(
        shouldShowPlayUpdate(status, dismissedUpdateVersionCode)
          ? status
          : null,
      );
    } finally {
      setPlayUpdateBusy(false);
    }
  }, [dismissedUpdateVersionCode, playUpdateBusy, playUpdateStatus]);

  const dismissPlayUpdate = useCallback(async () => {
    const versionCode = playUpdateStatus?.availableVersionCode ?? 0;
    if (versionCode <= 0 || playUpdateBusy) return;
    setPlayUpdateBusy(true);
    try {
      const saved = await dismissUpdate(versionCode);
      if (saved) setPlayUpdateStatus(null);
    } finally {
      setPlayUpdateBusy(false);
    }
  }, [dismissUpdate, playUpdateBusy, playUpdateStatus?.availableVersionCode]);

  return {
    installPlayUpdate,
    dismissPlayUpdate,
    playUpdateBusy,
    playUpdateStatus,
    alarmPlatformSupported,
    runtimeStatus,
    sleepReminderSupported,
    startPlayUpdate,
  };
}
