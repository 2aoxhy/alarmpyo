import { getAlarmPyoNativeModule } from '../infrastructure/alarmpyo-native-module';
import type { SleepReminderPlan } from './sleep-reminder-planner';

export type SleepReminderStatus = {
  supported: boolean;
  enabled: boolean;
  notificationsAllowed: boolean;
  scheduledCount: number;
  storageHealth?: 'normal' | 'recovered' | 'corrupt';
};

type SleepReminderNativeModule = {
  syncSleepRemindersAsync?: (plans: SleepReminderPlan[]) => Promise<unknown>;
  cancelSleepRemindersAsync?: () => Promise<unknown>;
  getSleepReminderStatusAsync?: () => Promise<unknown>;
  requestSleepReminderPermissionAsync?: () => Promise<unknown>;
  openSleepReminderSettingsAsync?: () => Promise<unknown>;
};

function getSleepReminderNativeModule():
  | (ReturnType<typeof getAlarmPyoNativeModule> & SleepReminderNativeModule)
  | null {
  return getAlarmPyoNativeModule() as
    | (ReturnType<typeof getAlarmPyoNativeModule> & SleepReminderNativeModule)
    | null;
}

const UNSUPPORTED_STATUS: Readonly<SleepReminderStatus> = {
  supported: false,
  enabled: false,
  notificationsAllowed: false,
  scheduledCount: 0,
  storageHealth: 'normal',
};

function unsupportedStatus(): SleepReminderStatus {
  return { ...UNSUPPORTED_STATUS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStatus(value: unknown): SleepReminderStatus {
  if (!isRecord(value)) return unsupportedStatus();
  const scheduledCount =
    Number.isInteger(value.scheduledCount) &&
    (value.scheduledCount as number) >= 0
      ? (value.scheduledCount as number)
      : 0;
  const storageHealth =
    value.storageHealth === 'recovered' || value.storageHealth === 'corrupt'
      ? value.storageHealth
      : 'normal';
  return {
    supported: value.supported === true,
    enabled: value.enabled === true,
    notificationsAllowed: value.notificationsAllowed === true,
    scheduledCount,
    storageHealth,
  };
}

export function isSleepReminderNativeSupported(): boolean {
  const nativeModule = getSleepReminderNativeModule();
  return Boolean(
    nativeModule?.syncSleepRemindersAsync &&
      nativeModule.cancelSleepRemindersAsync &&
      nativeModule.getSleepReminderStatusAsync &&
      nativeModule.requestSleepReminderPermissionAsync &&
      nativeModule.openSleepReminderSettingsAsync,
  );
}

export async function syncAlarmPyoSleepReminders(
  plans: readonly SleepReminderPlan[],
): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.syncSleepRemindersAsync) return unsupportedStatus();
  const snapshot = plans.map((plan) => ({ ...plan }));
  return normalizeStatus(await nativeModule.syncSleepRemindersAsync(snapshot));
}

export async function cancelAlarmPyoSleepReminders(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.cancelSleepRemindersAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.cancelSleepRemindersAsync());
}

export async function getAlarmPyoSleepReminderStatus(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.getSleepReminderStatusAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.getSleepReminderStatusAsync());
}

export async function requestAlarmPyoSleepReminderPermission(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.requestSleepReminderPermissionAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.requestSleepReminderPermissionAsync());
}

export async function openAlarmPyoSleepReminderSettings(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.openSleepReminderSettingsAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.openSleepReminderSettingsAsync());
}
