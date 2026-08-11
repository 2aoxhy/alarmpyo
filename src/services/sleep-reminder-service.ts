import { getAlarmPyoNativeModule } from '../infrastructure/alarmpyo-native-module';
import type { SleepReminderPlan } from './sleep-reminder-planner';

export type SleepReminderStatus = {
  supported: boolean;
  enabled: boolean;
  notificationsAllowed: boolean;
  scheduledCount: number;
};

type SleepReminderNativeModule = {
  syncSleepRemindersAsync?: (plans: SleepReminderPlan[]) => Promise<unknown>;
  cancelSleepRemindersAsync?: () => Promise<unknown>;
  getSleepReminderStatusAsync?: () => Promise<unknown>;
  requestSleepReminderPermissionAsync?: () => Promise<unknown>;
  openSleepReminderSettingsAsync?: () => Promise<unknown>;
};

const nativeModule = getAlarmPyoNativeModule() as
  | (ReturnType<typeof getAlarmPyoNativeModule> & SleepReminderNativeModule)
  | null;

const UNSUPPORTED_STATUS: Readonly<SleepReminderStatus> = {
  supported: false,
  enabled: false,
  notificationsAllowed: false,
  scheduledCount: 0,
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
  return {
    supported: value.supported === true,
    enabled: value.enabled === true,
    notificationsAllowed: value.notificationsAllowed === true,
    scheduledCount,
  };
}

export function isSleepReminderNativeSupported(): boolean {
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
  if (!nativeModule?.syncSleepRemindersAsync) return unsupportedStatus();
  const snapshot = plans.map((plan) => ({ ...plan }));
  return normalizeStatus(await nativeModule.syncSleepRemindersAsync(snapshot));
}

export async function cancelAlarmPyoSleepReminders(): Promise<SleepReminderStatus> {
  if (!nativeModule?.cancelSleepRemindersAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.cancelSleepRemindersAsync());
}

export async function getAlarmPyoSleepReminderStatus(): Promise<SleepReminderStatus> {
  if (!nativeModule?.getSleepReminderStatusAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.getSleepReminderStatusAsync());
}

export async function requestAlarmPyoSleepReminderPermission(): Promise<SleepReminderStatus> {
  if (!nativeModule?.requestSleepReminderPermissionAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.requestSleepReminderPermissionAsync());
}

export async function openAlarmPyoSleepReminderSettings(): Promise<SleepReminderStatus> {
  if (!nativeModule?.openSleepReminderSettingsAsync) return unsupportedStatus();
  return normalizeStatus(await nativeModule.openSleepReminderSettingsAsync());
}
