import type { AppData } from '../../../models/app-data';
import type { AlarmPyoAlarmStatus } from '../../../services/alarmpyo-alarm-service';
import type { AlarmPyoAlarmPlan, AlarmPyoAlarmSyncMetadata } from '../../../services/alarm-planner';
import type { DeviceSafetyBackup } from '../../../services/device-safety-backup-service';
import type { SleepReminderStatus } from '../../../services/sleep-reminder-service';
import type { SleepReminderPlan } from '../../../services/sleep-reminder-planner';
import type { AlarmPyoWidgetSnapshot } from '../../../services/widget-planner';
import type { AppRuntimeController } from '../app-runtime-controller';
import type { AppRuntimeContract } from '../app-runtime-ports';
import type { AppDataCodecPort } from '../../app-data-codec-port';
import type { AppStoreStoragePort } from './storage-port';

export interface AppStoreRuntimeContract extends AppRuntimeContract {
  data: AppData;
  alarmPlan: AlarmPyoAlarmPlan;
  alarmStatus: AlarmPyoAlarmStatus;
  alarmMetadata: AlarmPyoAlarmSyncMetadata;
  sleepPlan: SleepReminderPlan;
  sleepStatus: SleepReminderStatus;
  widgetSnapshot: AlarmPyoWidgetSnapshot;
  backup: DeviceSafetyBackup;
}

export type ResetCleanupInput = {
  persistedSnapshot: string | null;
  resetFallbackLoaded?: boolean;
  resetAlarmRuntime: () => Promise<void>;
  cancelTimer: () => Promise<void>;
  clearDeviceLocalData: () => Promise<void>;
};

/** Platform work is injected; coordinators never import a React or Expo runtime. */
export type AppStorePlatformPort = {
  quarantineCorruptAppData: (raw: string, now?: Date) => Promise<string | null>;
  clearPlayUpdatePromptSnooze: () => Promise<void>;
  clearQuickSetupDraft: () => Promise<void>;
  clearResetCleanupJournal: () => Promise<void>;
  prepareResetCleanupJournal: (snapshot: string) => Promise<void>;
  resumeResetCleanupJournal: (input: ResetCleanupInput) => Promise<{ completed: boolean }>;
  scheduleAlarmPyoTestAlarm: (seconds: number) => Promise<void>;
  cancelQuickTimerForResetCleanup: () => Promise<void>;
  resetAlarmRuntimeForResetCleanup: () => Promise<void>;
  widgetSupported: boolean;
  supportsGeneratedWidgetPreview: boolean;
};

export type AppStoreEnginePorts = {
  runtime: AppRuntimeController<AppStoreRuntimeContract>;
  platform: AppStorePlatformPort;
  storage: AppStoreStoragePort;
  codec: AppDataCodecPort;
};

export type AppStoreLifecycle = Readonly<{ active: boolean; transitionId: number }>;
