import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppRuntimeController } from '@/application/runtime/app-runtime-controller';
import type { AppRuntimeContract } from '@/application/runtime/app-runtime-ports';
import type { AppData } from '@/models/app-data';
import {
  cancelAllAlarmPyoAlarms,
  getAlarmPyoAlarmStatus,
  isAlarmPyoWidgetInstalled,
  requestAlarmPyoAlarmPermissions,
  syncAlarmPyoAlarms,
  syncAlarmPyoWidget,
  type AlarmPyoAlarmStatus,
} from '@/services/alarmpyo-alarm-service';
import type {
  AlarmPyoAlarmPlan,
  AlarmPyoAlarmSyncMetadata,
} from '@/services/alarm-planner';
import {
  readDeviceSafetyBackup,
  writeDeviceSafetyBackup,
  type DeviceSafetyBackup,
} from '@/services/device-safety-backup-service';
import {
  cancelAlarmPyoSleepReminders,
  requestAlarmPyoSleepReminderPermission,
  syncAlarmPyoSleepReminders,
  type SleepReminderStatus,
} from '@/services/sleep-reminder-service';
import type { SleepReminderPlan } from '@/services/sleep-reminder-planner';
import type { AlarmPyoWidgetSnapshot } from '@/services/widget-planner';

export interface NativeAppRuntimeContract extends AppRuntimeContract {
  data: AppData;
  alarmPlan: AlarmPyoAlarmPlan;
  alarmStatus: AlarmPyoAlarmStatus;
  alarmMetadata: AlarmPyoAlarmSyncMetadata;
  sleepPlan: SleepReminderPlan;
  sleepStatus: SleepReminderStatus;
  widgetSnapshot: AlarmPyoWidgetSnapshot;
  backup: DeviceSafetyBackup;
}

export type NativeAppRuntimeController =
  AppRuntimeController<NativeAppRuntimeContract>;

export function createNativeAppRuntimeController(): NativeAppRuntimeController {
  return new AppRuntimeController<NativeAppRuntimeContract>({
    dataRepository: AsyncStorage,
    alarms: {
      readStatus: getAlarmPyoAlarmStatus,
      requestPermissions: requestAlarmPyoAlarmPermissions,
      synchronize: syncAlarmPyoAlarms,
      cancelAll: cancelAllAlarmPyoAlarms,
    },
    sleepReminders: {
      synchronize: syncAlarmPyoSleepReminders,
      cancelAll: cancelAlarmPyoSleepReminders,
      requestPermission: requestAlarmPyoSleepReminderPermission,
    },
    widget: {
      isInstalled: isAlarmPyoWidgetInstalled,
      synchronize: syncAlarmPyoWidget,
    },
    backup: {
      readLatest: readDeviceSafetyBackup,
      write: writeDeviceSafetyBackup,
    },
    clock: {
      now: () => new Date(),
    },
  });
}
