import { useCallback } from 'react';
import { Platform } from 'react-native';

import { useAlarmRuntimeStatus } from '../../hooks/use-alarm-runtime-status';
import {
  openAlarmPyoAlarmPermissionSettings,
  openAlarmPyoPermissionSettings,
  type AlarmPyoAlarmEventType,
  type AlarmPyoAlarmHistoryEvent,
  type AlarmPyoAlarmStatus,
  type AlarmPyoPermissionSettingsTarget,
} from '../../services/alarmpyo-alarm-service';
import { isSleepReminderNativeSupported } from '../../services/sleep-reminder-service';

export type UseAlarmSettingsRuntimeControllerOptions = {
  enabled: boolean;
  sleepReminderEnabled: boolean;
  revisionKey?: string;
};

/**
 * Feature boundary for alarm-settings platform work. The route owns dialog
 * presentation while this controller owns Android/native capability calls.
 */
export function useAlarmSettingsRuntimeController({
  enabled,
  sleepReminderEnabled,
  revisionKey = '',
}: UseAlarmSettingsRuntimeControllerOptions) {
  const alarmPlatformSupported = Platform.OS === 'android';
  const sleepReminderSupported =
    alarmPlatformSupported && isSleepReminderNativeSupported();
  const runtimeStatus = useAlarmRuntimeStatus({
    enabled,
    includeSleepReminder: sleepReminderSupported && sleepReminderEnabled,
    revisionKey,
  });

  const openAlarmPermissionSettings = useCallback(
    () => openAlarmPyoAlarmPermissionSettings(),
    [],
  );
  const openPermissionSettings = useCallback(
    (target: AlarmPyoPermissionSettingsTarget) =>
      openAlarmPyoPermissionSettings(target),
    [],
  );

  return {
    alarmPlatformSupported,
    sleepReminderSupported,
    runtimeStatus,
    openAlarmPermissionSettings,
    openPermissionSettings,
  };
}

export type {
  AlarmPyoAlarmEventType,
  AlarmPyoAlarmHistoryEvent,
  AlarmPyoAlarmStatus,
  AlarmPyoPermissionSettingsTarget,
};
