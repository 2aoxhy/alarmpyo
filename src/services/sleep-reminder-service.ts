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

const STATUS_CACHE_TTL_MS = 750;
let cachedNativeModule: SleepReminderNativeModule | null = null;
let statusCacheGeneration = 0;
let statusCache: { cachedAt: number; value: SleepReminderStatus } | null = null;
let statusReadPromise: Promise<SleepReminderStatus> | null = null;

function unsupportedStatus(): SleepReminderStatus {
  return { ...UNSUPPORTED_STATUS };
}

function cloneStatus(status: SleepReminderStatus): SleepReminderStatus {
  return { ...status };
}

function prepareStatusCache(nativeModule: SleepReminderNativeModule): void {
  if (cachedNativeModule === nativeModule) return;
  cachedNativeModule = nativeModule;
  statusCacheGeneration += 1;
  statusCache = null;
  statusReadPromise = null;
}

function invalidateStatusCache(nativeModule: SleepReminderNativeModule): number {
  prepareStatusCache(nativeModule);
  statusCacheGeneration += 1;
  statusCache = null;
  statusReadPromise = null;
  return statusCacheGeneration;
}

function rememberStatus(
  status: SleepReminderStatus,
  generation = statusCacheGeneration,
): void {
  if (generation !== statusCacheGeneration) return;
  statusCache = { cachedAt: Date.now(), value: cloneStatus(status) };
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
  const generation = invalidateStatusCache(nativeModule);
  const snapshot = plans.map((plan) => ({ ...plan }));
  const status = normalizeStatus(await nativeModule.syncSleepRemindersAsync(snapshot));
  rememberStatus(status, generation);
  return cloneStatus(status);
}

export async function cancelAlarmPyoSleepReminders(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.cancelSleepRemindersAsync) return unsupportedStatus();
  const generation = invalidateStatusCache(nativeModule);
  const status = normalizeStatus(await nativeModule.cancelSleepRemindersAsync());
  rememberStatus(status, generation);
  return cloneStatus(status);
}

export async function getAlarmPyoSleepReminderStatus(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.getSleepReminderStatusAsync) return unsupportedStatus();
  prepareStatusCache(nativeModule);
  const now = Date.now();
  if (
    statusCache &&
    now >= statusCache.cachedAt &&
    now - statusCache.cachedAt < STATUS_CACHE_TTL_MS
  ) {
    return cloneStatus(statusCache.value);
  }
  if (statusReadPromise) return cloneStatus(await statusReadPromise);

  const generation = statusCacheGeneration;
  const task = Promise.resolve(nativeModule.getSleepReminderStatusAsync())
    .then(normalizeStatus)
    .then((status) => {
      rememberStatus(status, generation);
      return status;
    })
    .finally(() => {
      if (statusReadPromise === task) statusReadPromise = null;
    });
  statusReadPromise = task;
  return cloneStatus(await task);
}

export async function requestAlarmPyoSleepReminderPermission(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.requestSleepReminderPermissionAsync) return unsupportedStatus();
  const generation = invalidateStatusCache(nativeModule);
  const status = normalizeStatus(await nativeModule.requestSleepReminderPermissionAsync());
  rememberStatus(status, generation);
  return cloneStatus(status);
}

export async function openAlarmPyoSleepReminderSettings(): Promise<SleepReminderStatus> {
  const nativeModule = getSleepReminderNativeModule();
  if (!nativeModule?.openSleepReminderSettingsAsync) return unsupportedStatus();
  const generation = invalidateStatusCache(nativeModule);
  const status = normalizeStatus(await nativeModule.openSleepReminderSettingsAsync());
  rememberStatus(status, generation);
  return cloneStatus(status);
}
