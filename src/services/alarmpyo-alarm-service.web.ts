import type { AlarmPyoAlarmPlan, AlarmPyoAlarmSyncMetadata } from './alarm-planner';
import type { AlarmPyoWidgetSnapshot } from './widget-planner';

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

export type AlarmPyoAlarmSafetyStatus = {
  nextCheckAt: number;
  lastCheckedAt: number;
  issueCodes: string[];
  lastNotifiedAt: number;
};

export type AlarmPyoAlarmStatus = {
  supported: boolean;
  enabled: boolean;
  triggerState: 'scheduled' | 'delivery-blocked' | 'exact-alarm-required' | 'not-scheduled';
  storageHealth: 'normal' | 'recovered' | 'corrupt';
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
  widgetInstalled: boolean;
  widgetSnapshotGeneratedAt: number;
  recentEvents: AlarmPyoAlarmHistoryEvent[];
};

export type AlarmPyoWidgetPinResult = {
  status: 'unsupported';
  supported: false;
  installed: false;
};

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

const WEB_STATUS: AlarmPyoAlarmStatus = {
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
  widgetInstalled: false,
  widgetSnapshotGeneratedAt: 0,
  recentEvents: [],
};

function webStatus(): AlarmPyoAlarmStatus {
  return { ...WEB_STATUS, scheduledAlarms: [], recentEvents: [] };
}

export async function getAlarmPyoAlarmStatus(): Promise<AlarmPyoAlarmStatus> {
  return webStatus();
}

export async function syncAlarmPyoAlarms(
  _plans: readonly AlarmPyoAlarmPlan[],
  _metadata?: AlarmPyoAlarmSyncMetadata,
): Promise<AlarmPyoAlarmStatus> {
  return webStatus();
}

export async function requestAlarmPyoAlarmPermissions(): Promise<AlarmPyoAlarmStatus> {
  return webStatus();
}

export function normalizeAlarmPyoPermissionSettingsLaunchResult(
  _value: unknown,
  _requestedTarget: AlarmPyoPermissionSettingsTarget,
): AlarmPyoPermissionSettingsLaunchResult | null {
  return null;
}

export async function openAlarmPyoPermissionSettings(
  requestedTarget: AlarmPyoPermissionSettingsTarget,
): Promise<AlarmPyoPermissionSettingsLaunchResult> {
  return {
    opened: false,
    requestedTarget,
    openedTarget: null,
    fallbackUsed: false,
  };
}

export async function openAlarmPyoAlarmPermissionSettings(): Promise<boolean> {
  return false;
}

export async function openAlarmPyoFullScreenPermissionSettings(): Promise<boolean> {
  return false;
}

export async function openAlarmPyoDoNotDisturbSettings(): Promise<boolean> {
  return false;
}

export async function openAlarmPyoBatterySettings(): Promise<boolean> {
  return false;
}

export async function scheduleAlarmPyoTestAlarm(_seconds = 5): Promise<void> {
  throw new Error('웹에서는 알람표 알람을 사용할 수 없어요.');
}

export async function cancelAllAlarmPyoAlarms(): Promise<AlarmPyoAlarmStatus> {
  return webStatus();
}

export function normalizeAlarmPyoRuntimeResetResult(
  _value: unknown,
): AlarmPyoAlarmRuntimeResetResult | null {
  return null;
}

export async function resetAlarmPyoRuntime(): Promise<AlarmPyoAlarmRuntimeResetResult | null> {
  return null;
}

export async function syncAlarmPyoWidget(_snapshot: AlarmPyoWidgetSnapshot): Promise<boolean> {
  return false;
}

export async function isAlarmPyoWidgetInstalled(): Promise<boolean> {
  return false;
}

export async function requestAlarmPyoWidgetPin(): Promise<AlarmPyoWidgetPinResult> {
  return { status: 'unsupported', supported: false, installed: false };
}
