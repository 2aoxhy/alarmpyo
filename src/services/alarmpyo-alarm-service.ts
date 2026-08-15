import { getAlarmPyoNativeModule } from '../infrastructure/alarmpyo-native-module';
import { MAX_ALARM_MINUTES_BEFORE } from '../models/app-data';
import type { AlarmPyoAlarmPlan, AlarmPyoAlarmSyncMetadata } from './alarm-planner';
import {
  serializeAlarmPyoWidgetSnapshot,
  type AlarmPyoWidgetSnapshot,
} from './widget-planner';

export type { AlarmPyoAlarmPlan } from './alarm-planner';

export type AlarmPyoAlarmEventType =
  | 'playback_confirmed'
  | 'dismissed'
  | 'snoozed'
  | 'auto_repeat_scheduled'
  | 'auto_repeat_started'
  | 'playback_failed'
  | 'retry_started'
  | 'retry_scheduled'
  | 'retry_exhausted';

export type AlarmPyoAlarmHistoryEvent = {
  id: string;
  type: AlarmPyoAlarmEventType;
  occurredAt: number;
  planId: string;
  shiftName: string;
  alarmAt: number;
  isTest: boolean;
  deliveryAttempt: number;
  nextAlarmAt: number;
};

export type AlarmPyoAlarmRestoreResult = {
  expectedCount: number;
  scheduledCount: number;
  completed: boolean;
};

export type AlarmPyoAlarmSafetyStatus = {
  nextCheckAt: number;
  lastCheckedAt: number;
  issueCodes: string[];
  lastNotifiedAt: number;
};

export type AlarmPyoAlarmStatus = {
  supported: boolean;
  enabled: boolean;
  triggerState: AlarmPyoAlarmTriggerState;
  storageHealth: AlarmPyoAlarmStorageHealth;
  exactAlarmAllowed: boolean;
  fullScreenAllowed: boolean;
  notificationsAllowed: boolean;
  doNotDisturbActive: boolean;
  doNotDisturbMaySilenceAlarm: boolean;
  batteryOptimizationIgnored: boolean;
  alarmVolume: number;
  alarmSafety?: AlarmPyoAlarmSafetyStatus;
  plannedThroughAt: number;
  planRefreshRecommendedAt: number;
  planRefreshReminderPending: boolean;
  scheduledAlarms: AlarmPyoAlarmPlan[];
  scheduledCount: number;
  lastRestoreResult?: AlarmPyoAlarmRestoreResult | null;
  widgetInstalled: boolean;
  widgetSnapshotGeneratedAt: number;
  recentEvents: AlarmPyoAlarmHistoryEvent[];
};

export type AlarmPyoAlarmTriggerState =
  | 'scheduled'
  | 'delivery-blocked'
  | 'exact-alarm-required'
  | 'not-scheduled';

export type AlarmPyoAlarmStorageHealth = 'normal' | 'recovered' | 'corrupt';

export type AlarmPyoAlarmRuntimeResetIssueCode =
  | 'work-alarms'
  | 'sleep-reminders'
  | 'quick-timer'
  | 'active-alarm'
  | 'alarm-sound'
  | 'restore-journal'
  | 'alarm-history';

export type AlarmPyoAlarmRuntimeResetResult = {
  outcome: 'success' | 'partial' | 'failure';
  workAlarmsReset: boolean;
  sleepRemindersReset: boolean;
  quickTimerReset: boolean;
  activeAlarmStopped: boolean;
  alarmSoundReset: boolean;
  restoreJournalReset: boolean;
  alarmHistoryReset: boolean;
  issueCodes: AlarmPyoAlarmRuntimeResetIssueCode[];
};

export type AlarmPyoPermissionSettingsTarget =
  | 'exact-alarm'
  | 'alarm-notifications'
  | 'sleep-notifications'
  | 'full-screen'
  | 'do-not-disturb'
  | 'battery-optimization'
  | 'app-details';

export type AlarmPyoPermissionSettingsDestination =
  | 'exact-alarm'
  | 'app-notifications'
  | 'alarm-channel'
  | 'sleep-channel'
  | 'full-screen'
  | 'do-not-disturb'
  | 'sound'
  | 'battery-optimization'
  | 'app-details'
  | 'application-settings'
  | 'system-settings';

export type AlarmPyoPermissionSettingsLaunchResult = {
  opened: boolean;
  requestedTarget: AlarmPyoPermissionSettingsTarget;
  openedTarget: AlarmPyoPermissionSettingsDestination | null;
  fallbackUsed: boolean;
};

export type AlarmPyoWidgetPinStatus =
  | 'requested'
  | 'installed'
  | 'unsupported'
  | 'missing'
  | 'failed';

export type AlarmPyoWidgetPinResult = {
  status: AlarmPyoWidgetPinStatus;
  supported: boolean;
  installed: boolean;
};

const nativeModule = getAlarmPyoNativeModule();
const STATUS_CACHE_TTL_MS = 750;
const MAX_RECENT_EVENTS = 12;
const ALARM_EVENT_TYPES = new Set<AlarmPyoAlarmEventType>([
  'playback_confirmed',
  'dismissed',
  'snoozed',
  'auto_repeat_scheduled',
  'auto_repeat_started',
  'playback_failed',
  'retry_started',
  'retry_scheduled',
  'retry_exhausted',
]);
const ALARM_RUNTIME_RESET_ISSUE_CODES = new Set<AlarmPyoAlarmRuntimeResetIssueCode>([
  'work-alarms',
  'sleep-reminders',
  'quick-timer',
  'active-alarm',
  'alarm-sound',
  'restore-journal',
  'alarm-history',
]);
const PERMISSION_SETTINGS_DESTINATIONS = new Set<AlarmPyoPermissionSettingsDestination>([
  'exact-alarm',
  'app-notifications',
  'alarm-channel',
  'sleep-channel',
  'full-screen',
  'do-not-disturb',
  'sound',
  'battery-optimization',
  'app-details',
  'application-settings',
  'system-settings',
]);

const UNSUPPORTED_STATUS: AlarmPyoAlarmStatus = {
  supported: false,
  enabled: false,
  triggerState: 'not-scheduled',
  storageHealth: 'normal',
  exactAlarmAllowed: false,
  fullScreenAllowed: false,
  notificationsAllowed: false,
  doNotDisturbActive: false,
  doNotDisturbMaySilenceAlarm: false,
  batteryOptimizationIgnored: true,
  alarmVolume: 0,
  alarmSafety: undefined,
  plannedThroughAt: 0,
  planRefreshRecommendedAt: 0,
  planRefreshReminderPending: false,
  scheduledAlarms: [],
  scheduledCount: 0,
  lastRestoreResult: null,
  widgetInstalled: false,
  widgetSnapshotGeneratedAt: 0,
  recentEvents: [],
};

function unsupportedStatus(): AlarmPyoAlarmStatus {
  return { ...UNSUPPORTED_STATUS, scheduledAlarms: [], recentEvents: [] };
}

function cloneStatus(status: AlarmPyoAlarmStatus): AlarmPyoAlarmStatus {
  return {
    ...status,
    alarmSafety: status.alarmSafety
      ? {
          ...status.alarmSafety,
          issueCodes: [...status.alarmSafety.issueCodes],
        }
      : undefined,
    scheduledAlarms: status.scheduledAlarms.map((alarm) => ({ ...alarm })),
    lastRestoreResult: status.lastRestoreResult
      ? { ...status.lastRestoreResult }
      : null,
    recentEvents: status.recentEvents.map((event) => ({ ...event })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeAlarmPyoPermissionSettingsLaunchResult(
  value: unknown,
  requestedTarget: AlarmPyoPermissionSettingsTarget,
): AlarmPyoPermissionSettingsLaunchResult | null {
  if (!isRecord(value)) return null;
  const openedTarget = value.openedTarget;
  if (
    typeof value.opened !== 'boolean' ||
    value.requestedTarget !== requestedTarget ||
    typeof value.fallbackUsed !== 'boolean' ||
    !(
      openedTarget === null ||
      (typeof openedTarget === 'string' &&
        PERMISSION_SETTINGS_DESTINATIONS.has(
          openedTarget as AlarmPyoPermissionSettingsDestination,
        ))
    )
  ) {
    return null;
  }
  return {
    opened: value.opened,
    requestedTarget,
    openedTarget: openedTarget as AlarmPyoPermissionSettingsDestination | null,
    fallbackUsed: value.fallbackUsed,
  };
}

export function normalizeAlarmPyoRuntimeResetResult(
  value: unknown,
): AlarmPyoAlarmRuntimeResetResult | null {
  if (!isRecord(value)) return null;
  const outcome = value.outcome;
  const issueCodes = value.issueCodes;
  if (
    (outcome !== 'success' && outcome !== 'partial' && outcome !== 'failure') ||
    typeof value.workAlarmsReset !== 'boolean' ||
    typeof value.sleepRemindersReset !== 'boolean' ||
    typeof value.quickTimerReset !== 'boolean' ||
    typeof value.activeAlarmStopped !== 'boolean' ||
    typeof value.alarmSoundReset !== 'boolean' ||
    typeof value.restoreJournalReset !== 'boolean' ||
    typeof value.alarmHistoryReset !== 'boolean' ||
    !Array.isArray(issueCodes) ||
    !issueCodes.every(
      (code) =>
        typeof code === 'string' &&
        ALARM_RUNTIME_RESET_ISSUE_CODES.has(code as AlarmPyoAlarmRuntimeResetIssueCode),
    )
  ) {
    return null;
  }
  return {
    outcome,
    workAlarmsReset: value.workAlarmsReset,
    sleepRemindersReset: value.sleepRemindersReset,
    quickTimerReset: value.quickTimerReset,
    activeAlarmStopped: value.activeAlarmStopped,
    alarmSoundReset: value.alarmSoundReset,
    restoreJournalReset: value.restoreJournalReset,
    alarmHistoryReset: value.alarmHistoryReset,
    issueCodes: [...new Set(issueCodes as AlarmPyoAlarmRuntimeResetIssueCode[])],
  };
}

function normalizeAlarmPlan(value: unknown): AlarmPyoAlarmPlan | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.dateKey !== 'string' ||
    typeof value.shiftTypeId !== 'string' ||
    typeof value.shiftName !== 'string' ||
    typeof value.alarmAt !== 'number' ||
    !Number.isFinite(value.alarmAt) ||
    typeof value.startMinutes !== 'number' ||
    !Number.isInteger(value.startMinutes) ||
    value.startMinutes < 0 ||
    value.startMinutes > 1439 ||
    typeof value.alarmMinutesBefore !== 'number' ||
    !Number.isInteger(value.alarmMinutesBefore) ||
    value.alarmMinutesBefore < 0 ||
    value.alarmMinutesBefore > MAX_ALARM_MINUTES_BEFORE
  ) {
    return null;
  }
  return {
    id: value.id,
    dateKey: value.dateKey,
    shiftTypeId: value.shiftTypeId,
    shiftName: value.shiftName,
    alarmAt: value.alarmAt,
    startMinutes: value.startMinutes,
    alarmMinutesBefore: value.alarmMinutesBefore,
  };
}

function normalizeAlarmHistoryEvent(value: unknown): AlarmPyoAlarmHistoryEvent | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.type !== 'string' ||
    !ALARM_EVENT_TYPES.has(value.type as AlarmPyoAlarmEventType) ||
    typeof value.occurredAt !== 'number' ||
    !Number.isFinite(value.occurredAt) ||
    value.occurredAt <= 0 ||
    typeof value.planId !== 'string' ||
    typeof value.shiftName !== 'string' ||
    typeof value.alarmAt !== 'number' ||
    !Number.isFinite(value.alarmAt) ||
    value.alarmAt < 0 ||
    typeof value.isTest !== 'boolean' ||
    typeof value.deliveryAttempt !== 'number' ||
    !Number.isInteger(value.deliveryAttempt) ||
    value.deliveryAttempt < 0 ||
    typeof value.nextAlarmAt !== 'number' ||
    !Number.isFinite(value.nextAlarmAt) ||
    value.nextAlarmAt < 0
  ) {
    return null;
  }
  return {
    id: value.id,
    type: value.type as AlarmPyoAlarmEventType,
    occurredAt: value.occurredAt,
    planId: value.planId,
    shiftName: value.shiftName,
    alarmAt: value.alarmAt,
    isTest: value.isTest,
    deliveryAttempt: value.deliveryAttempt,
    nextAlarmAt: value.nextAlarmAt,
  };
}

function normalizeAlarmRestoreResult(value: unknown): AlarmPyoAlarmRestoreResult | null {
  if (!isRecord(value)) return null;
  const expectedCount =
    typeof value.expectedCount === 'number' && Number.isFinite(value.expectedCount)
      ? Math.max(0, Math.trunc(value.expectedCount))
      : -1;
  const scheduledCount =
    typeof value.scheduledCount === 'number' && Number.isFinite(value.scheduledCount)
      ? Math.max(0, Math.trunc(value.scheduledCount))
      : -1;
  if (
    expectedCount < 0 ||
    scheduledCount < 0 ||
    scheduledCount > expectedCount ||
    typeof value.completed !== 'boolean'
  ) {
    return null;
  }
  return {
    expectedCount,
    scheduledCount,
    completed: value.completed && scheduledCount === expectedCount,
  };
}

function normalizeAlarmSafetyStatus(value: unknown): AlarmPyoAlarmSafetyStatus | undefined {
  if (!isRecord(value) || !Array.isArray(value.issueCodes)) return undefined;
  const timestamps = [
    value.nextCheckAt,
    value.lastCheckedAt,
    value.lastNotifiedAt,
  ];
  if (
    timestamps.some(
      (timestamp) =>
        typeof timestamp !== 'number' ||
        !Number.isSafeInteger(timestamp) ||
        timestamp < 0,
    )
  ) {
    return undefined;
  }

  return {
    nextCheckAt: value.nextCheckAt as number,
    lastCheckedAt: value.lastCheckedAt as number,
    issueCodes: Array.from(
      new Set(
        value.issueCodes.filter(
          (code): code is string => typeof code === 'string' && code.length > 0,
        ),
      ),
    ),
    lastNotifiedAt: value.lastNotifiedAt as number,
  };
}

function normalizeStatus(value: unknown): AlarmPyoAlarmStatus {
  if (!isRecord(value)) {
    throw new TypeError('알람 상태 응답의 형식이 올바르지 않아요.');
  }

  const scheduledAlarms = Array.isArray(value.scheduledAlarms)
    ? value.scheduledAlarms
        .map(normalizeAlarmPlan)
        .filter((item): item is AlarmPyoAlarmPlan => item !== null)
        .sort((left, right) => left.alarmAt - right.alarmAt)
    : [];
  const nativeCount =
    typeof value.scheduledCount === 'number' && Number.isFinite(value.scheduledCount)
      ? Math.max(0, Math.trunc(value.scheduledCount))
      : scheduledAlarms.length;
  const exactAlarmAllowed = value.exactAlarmAllowed === true;
  const notificationsAllowed = value.notificationsAllowed === true;
  const triggerState: AlarmPyoAlarmTriggerState =
    value.triggerState === 'scheduled' ||
    value.triggerState === 'delivery-blocked' ||
    value.triggerState === 'exact-alarm-required' ||
    value.triggerState === 'not-scheduled'
      ? value.triggerState
      : !exactAlarmAllowed
        ? 'exact-alarm-required'
        : nativeCount === 0
          ? 'not-scheduled'
          : !notificationsAllowed
            ? 'delivery-blocked'
            : 'scheduled';
  const storageHealth: AlarmPyoAlarmStorageHealth =
    value.storageHealth === 'recovered' || value.storageHealth === 'corrupt'
      ? value.storageHealth
      : 'normal';
  const recentEvents = Array.isArray(value.recentEvents)
    ? value.recentEvents
        .map(normalizeAlarmHistoryEvent)
        .filter((item): item is AlarmPyoAlarmHistoryEvent => item !== null)
        .sort((left, right) => right.occurredAt - left.occurredAt)
        .filter((event, index, events) =>
          events.findIndex((candidate) => candidate.id === event.id) === index)
        .slice(0, MAX_RECENT_EVENTS)
    : [];

  return {
    supported: value.supported === true,
    enabled: value.enabled === true,
    triggerState,
    storageHealth,
    exactAlarmAllowed,
    fullScreenAllowed: value.fullScreenAllowed === true,
    notificationsAllowed,
    doNotDisturbActive: value.doNotDisturbActive === true,
    doNotDisturbMaySilenceAlarm: value.doNotDisturbMaySilenceAlarm === true,
    batteryOptimizationIgnored: value.batteryOptimizationIgnored !== false,
    alarmVolume:
      typeof value.alarmVolume === 'number' && Number.isFinite(value.alarmVolume)
        ? Math.max(0, value.alarmVolume)
        : 0,
    alarmSafety: normalizeAlarmSafetyStatus(value.alarmSafety),
    plannedThroughAt:
      typeof value.plannedThroughAt === 'number' &&
      Number.isFinite(value.plannedThroughAt) &&
      value.plannedThroughAt > 0
        ? value.plannedThroughAt
        : 0,
    planRefreshRecommendedAt:
      typeof value.planRefreshRecommendedAt === 'number' &&
      Number.isFinite(value.planRefreshRecommendedAt) &&
      value.planRefreshRecommendedAt > 0
        ? value.planRefreshRecommendedAt
        : 0,
    planRefreshReminderPending: value.planRefreshReminderPending === true,
    scheduledAlarms,
    scheduledCount: nativeCount,
    lastRestoreResult: normalizeAlarmRestoreResult(value.lastRestoreResult),
    // 이전 APK 응답에는 위젯 상태가 없어요. 선택 기능인 위젯을 설치하지 않은
    // 상태로 처리하면 OTA 전환 중에도 잘못된 경고를 표시하지 않아요.
    widgetInstalled: value.widgetInstalled === true,
    widgetSnapshotGeneratedAt:
      typeof value.widgetSnapshotGeneratedAt === 'number' &&
      Number.isFinite(value.widgetSnapshotGeneratedAt) &&
      value.widgetSnapshotGeneratedAt > 0
        ? value.widgetSnapshotGeneratedAt
        : 0,
    recentEvents,
  };
}

let statusCache: { cachedAt: number; value: AlarmPyoAlarmStatus } | null = null;
let statusReadPromise: Promise<AlarmPyoAlarmStatus> | null = null;
let statusCacheGeneration = 0;

function invalidateStatusCache(): number {
  statusCacheGeneration += 1;
  statusCache = null;
  statusReadPromise = null;
  return statusCacheGeneration;
}

function rememberStatus(status: AlarmPyoAlarmStatus, generation = statusCacheGeneration): void {
  if (generation !== statusCacheGeneration) return;
  statusCache = {
    cachedAt: Date.now(),
    value: cloneStatus(status),
  };
}

export async function getAlarmPyoAlarmStatus(): Promise<AlarmPyoAlarmStatus> {
  if (!nativeModule) return unsupportedStatus();
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
  const task = Promise.resolve(nativeModule.getStatusAsync())
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

let latestSyncGeneration = 0;
let nativeMutationTail: Promise<void> = Promise.resolve();

function enqueueNativeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const task = nativeMutationTail.then(mutation);
  nativeMutationTail = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export async function syncAlarmPyoAlarms(
  plans: readonly AlarmPyoAlarmPlan[],
  metadata?: AlarmPyoAlarmSyncMetadata,
): Promise<AlarmPyoAlarmStatus> {
  if (!nativeModule) return unsupportedStatus();
  const generation = ++latestSyncGeneration;
  const cacheGeneration = invalidateStatusCache();
  const snapshot = plans.map((plan) => ({ ...plan }));
  const metadataSnapshot = metadata
    ? {
        generatedAt: metadata.generatedAt,
        refreshRecommendedAt: metadata.refreshRecommendedAt,
        safetyThroughAt: metadata.safetyThroughAt,
      }
    : undefined;
  if (
    metadataSnapshot &&
    (
      !Number.isSafeInteger(metadataSnapshot.generatedAt) ||
      !Number.isSafeInteger(metadataSnapshot.refreshRecommendedAt) ||
      !Number.isSafeInteger(metadataSnapshot.safetyThroughAt) ||
      metadataSnapshot.generatedAt <= 0 ||
      metadataSnapshot.refreshRecommendedAt <= metadataSnapshot.generatedAt ||
      metadataSnapshot.safetyThroughAt <= metadataSnapshot.refreshRecommendedAt
    )
  ) {
    throw new RangeError('알람 안전 계획 메타데이터가 올바르지 않아요.');
  }

  return enqueueNativeMutation(async () => {
    // 빠르게 연속 변경된 근무표는 마지막 계획만 네이티브 계층에 전달해요.
    if (generation !== latestSyncGeneration) return getAlarmPyoAlarmStatus();
    const metadataCapableModule = nativeModule as typeof nativeModule & {
      syncAlarmsWithMetadataAsync?: (
        alarmPlans: AlarmPyoAlarmPlan[],
        syncMetadata: AlarmPyoAlarmSyncMetadata,
      ) => Promise<unknown>;
    };
    const response = metadataSnapshot && metadataCapableModule.syncAlarmsWithMetadataAsync
      ? await metadataCapableModule.syncAlarmsWithMetadataAsync(snapshot, metadataSnapshot)
      : await nativeModule.syncAlarmsAsync(snapshot);
    const status = normalizeStatus(response);
    rememberStatus(status, cacheGeneration);
    return cloneStatus(status);
  });
}

export async function requestAlarmPyoAlarmPermissions(): Promise<AlarmPyoAlarmStatus> {
  if (!nativeModule) return unsupportedStatus();
  const generation = invalidateStatusCache();
  const status = normalizeStatus(await nativeModule.requestAlarmPermissionsAsync());
  rememberStatus(status, generation);
  return cloneStatus(status);
}

function failedPermissionSettingsLaunch(
  requestedTarget: AlarmPyoPermissionSettingsTarget,
): AlarmPyoPermissionSettingsLaunchResult {
  return {
    opened: false,
    requestedTarget,
    openedTarget: null,
    fallbackUsed: false,
  };
}

async function openLegacyPermissionSettings(
  target: AlarmPyoPermissionSettingsTarget,
): Promise<boolean> {
  if (!nativeModule) return false;
  switch (target) {
    case 'exact-alarm':
    case 'alarm-notifications':
      await nativeModule.openAlarmPermissionSettingsAsync();
      return true;
    case 'sleep-notifications':
      if (!nativeModule.openSleepReminderSettingsAsync) return false;
      await nativeModule.openSleepReminderSettingsAsync();
      return true;
    case 'full-screen':
      await nativeModule.openFullScreenPermissionSettingsAsync();
      return true;
    case 'do-not-disturb':
      if (!nativeModule.openDoNotDisturbSettingsAsync) return false;
      return (await nativeModule.openDoNotDisturbSettingsAsync()) !== false;
    case 'battery-optimization':
      if (!nativeModule.openBatterySettingsAsync) return false;
      return (await nativeModule.openBatterySettingsAsync()) !== false;
    case 'app-details':
      return false;
  }
}

export async function openAlarmPyoPermissionSettings(
  target: AlarmPyoPermissionSettingsTarget,
): Promise<AlarmPyoPermissionSettingsLaunchResult> {
  if (!nativeModule) return failedPermissionSettingsLaunch(target);
  invalidateStatusCache();
  try {
    if (nativeModule.openPermissionSettingsAsync) {
      const normalized = normalizeAlarmPyoPermissionSettingsLaunchResult(
        await nativeModule.openPermissionSettingsAsync(target),
        target,
      );
      return normalized ?? failedPermissionSettingsLaunch(target);
    }
    const opened = await openLegacyPermissionSettings(target);
    return {
      opened,
      requestedTarget: target,
      openedTarget: null,
      fallbackUsed: false,
    };
  } finally {
    invalidateStatusCache();
  }
}

export async function openAlarmPyoAlarmPermissionSettings(): Promise<boolean> {
  if (!nativeModule) return false;
  // 구형 호출 계약은 네이티브 계층이 정확한 알람 → 알림 → 전체 화면 순서로 처리해요.
  invalidateStatusCache();
  await nativeModule.openAlarmPermissionSettingsAsync();
  invalidateStatusCache();
  return true;
}

export async function openAlarmPyoFullScreenPermissionSettings(): Promise<boolean> {
  return (await openAlarmPyoPermissionSettings('full-screen')).opened;
}

export async function openAlarmPyoDoNotDisturbSettings(): Promise<boolean> {
  return (await openAlarmPyoPermissionSettings('do-not-disturb')).opened;
}

export async function openAlarmPyoBatterySettings(): Promise<boolean> {
  return (await openAlarmPyoPermissionSettings('battery-optimization')).opened;
}

export async function scheduleAlarmPyoTestAlarm(seconds = 5): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60) {
    throw new RangeError('시험 알람 대기 시간은 5초 이상 60초 이하의 정수여야 해요.');
  }
  if (!nativeModule) throw new Error('이 기기에서는 알람표 알람을 사용할 수 없어요.');
  invalidateStatusCache();
  await enqueueNativeMutation(() => nativeModule.scheduleTestAlarmAsync(seconds));
  invalidateStatusCache();
}

export async function cancelAllAlarmPyoAlarms(): Promise<AlarmPyoAlarmStatus> {
  latestSyncGeneration += 1;
  if (!nativeModule) return unsupportedStatus();
  const cacheGeneration = invalidateStatusCache();
  return enqueueNativeMutation(async () => {
    const status = normalizeStatus(await nativeModule.cancelAllAsync());
    rememberStatus(status, cacheGeneration);
    return cloneStatus(status);
  });
}

/** 새 네이티브 런타임의 모든 알람 상태를 한 트랜잭션으로 초기화해요. */
export async function resetAlarmPyoRuntime(): Promise<AlarmPyoAlarmRuntimeResetResult | null> {
  if (!nativeModule?.resetAlarmRuntimeAsync) return null;
  latestSyncGeneration += 1;
  invalidateStatusCache();
  return enqueueNativeMutation(async () => {
    const result = normalizeAlarmPyoRuntimeResetResult(
      await nativeModule.resetAlarmRuntimeAsync!(),
    );
    invalidateStatusCache();
    if (result === null) {
      throw new Error('네이티브 알람 초기화 결과를 확인하지 못했어요.');
    }
    return result;
  });
}

export async function syncAlarmPyoWidget(snapshot: AlarmPyoWidgetSnapshot): Promise<boolean> {
  if (!nativeModule?.syncWidgetAsync) return false;
  const snapshotJson = serializeAlarmPyoWidgetSnapshot(snapshot);
  return enqueueNativeMutation(async () => {
    const result = await nativeModule.syncWidgetAsync!(snapshotJson);
    return result === true;
  });
}

/**
 * 위젯 스냅샷을 만들기 전에 사용하는 가벼운 설치 여부 조회예요.
 * 전용 설치 여부 함수가 없으면 상태 응답으로 안전하게 확인해요.
 */
export async function isAlarmPyoWidgetInstalled(): Promise<boolean> {
  if (!nativeModule) return false;
  if (nativeModule.isWidgetInstalledAsync) {
    return (await nativeModule.isWidgetInstalledAsync()) === true;
  }
  return (await getAlarmPyoAlarmStatus()).widgetInstalled;
}

export async function requestAlarmPyoWidgetPin(): Promise<AlarmPyoWidgetPinResult> {
  if (!nativeModule?.requestWidgetPinAsync) {
    return { status: 'unsupported', supported: false, installed: false };
  }
  try {
    const value = await nativeModule.requestWidgetPinAsync();
    if (!value || typeof value !== 'object') {
      return { status: 'failed', supported: true, installed: false };
    }
    const record = value as Record<string, unknown>;
    const allowed = new Set<AlarmPyoWidgetPinStatus>([
      'requested',
      'installed',
      'unsupported',
      'missing',
      'failed',
    ]);
    const status = allowed.has(record.status as AlarmPyoWidgetPinStatus)
      ? (record.status as AlarmPyoWidgetPinStatus)
      : 'failed';
    return {
      status,
      supported: record.supported === true,
      installed: record.installed === true,
    };
  } catch {
    return { status: 'failed', supported: true, installed: false };
  }
}
