import { Platform } from 'react-native';

import { useAlarmRuntimeStatus } from '../../hooks/use-alarm-runtime-status';
import { isSleepReminderNativeSupported } from '../../services/sleep-reminder-service';

export type UseTodayRuntimeControllerOptions = {
  enabled: boolean;
  sleepReminderEnabled: boolean;
  runtimeRevisionKey?: string;
};

/**
 * Owns Today-screen alarm and sleep-reminder effects. Play updates are global
 * so changing tabs never starts a second native update query.
 */
export function useTodayRuntimeController({
  enabled,
  sleepReminderEnabled,
  runtimeRevisionKey = '',
}: UseTodayRuntimeControllerOptions) {
  const alarmPlatformSupported = Platform.OS === 'android';
  const sleepReminderSupported =
    alarmPlatformSupported && isSleepReminderNativeSupported();
  const runtimeStatus = useAlarmRuntimeStatus({
    enabled,
    includeSleepReminder: sleepReminderEnabled && sleepReminderSupported,
    revisionKey: runtimeRevisionKey,
  });

  return {
    alarmPlatformSupported,
    runtimeStatus,
    sleepReminderSupported,
  };
}
