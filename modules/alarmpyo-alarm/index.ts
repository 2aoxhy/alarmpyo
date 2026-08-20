import { requireNativeModule } from 'expo-modules-core';

export type AlarmPyoAlarmPlan = {
  id: string;
  dateKey: string;
  shiftTypeId: string;
  shiftName: string;
  alarmAt: number;
  startMinutes: number;
  alarmMinutesBefore: number;
};

export type AlarmPyoAlarmSyncMetadata = {
  generatedAt: number;
  refreshRecommendedAt: number;
  safetyThroughAt: number;
};

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
  alarmSafety?: {
    nextCheckAt: number;
    lastCheckedAt: number;
    issueCodes: string[];
    lastNotifiedAt: number;
  };
  plannedThroughAt: number;
  planRefreshRecommendedAt: number;
  planRefreshReminderPending: boolean;
  scheduledAlarms: AlarmPyoAlarmPlan[];
  scheduledCount: number;
  lastRestoreResult?: {
    expectedCount: number;
    scheduledCount: number;
    completed: boolean;
  } | null;
  widgetInstalled: boolean;
  widgetSnapshotGeneratedAt: number;
  recentEvents: AlarmPyoAlarmHistoryEvent[];
};

export type AlarmPyoAlarmSoundStatus = {
  supported: boolean;
  selected: boolean;
  label: string;
  available: boolean;
};

export type AlarmPyoSleepReminderPlan = {
  id: string;
  reminderAt: number;
  shiftDate: string;
  shiftName: string;
  title: string;
  body: string;
};

export type AlarmPyoSleepReminderStatus = {
  supported: boolean;
  enabled: boolean;
  notificationsAllowed: boolean;
  scheduledCount: number;
  storageHealth?: 'normal' | 'recovered' | 'corrupt';
};

export type AlarmPyoQuickTimerStatus = {
  supported: boolean;
  state:
    | 'idle'
    | 'scheduled'
    | 'paused'
    | 'ringing'
    | 'expired'
    | 'action-required'
    | 'error';
  active: boolean;
  durationMinutes: 30 | 45 | 60 | null;
  startedAt: number;
  fireAt: number;
  remainingMillis: number;
  isRepeat: boolean;
  storageHealth: 'normal' | 'recovered' | 'corrupt';
  requiredAction: 'none' | 'exact-alarm' | 'notifications' | 'full-screen';
};

export type AlarmPyoPlayUpdateInstallStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'canceled';

export type AlarmPyoPlayUpdateStatus = {
  supported: boolean;
  state:
    | 'unsupported'
    | 'idle'
    | 'available'
    | 'in-progress'
    | 'downloaded'
    | 'installing'
    | 'installed'
    | 'failed'
    | 'canceled';
  updateAvailable: boolean;
  flexibleAllowed: boolean;
  availableVersionCode: number;
  installStatus: AlarmPyoPlayUpdateInstallStatus;
  bytesDownloaded: number;
  totalBytesToDownload: number;
  errorCode: number;
};

export type AlarmPyoPlayUpdateStartResult = {
  started: boolean;
  resultCode: number;
  status: AlarmPyoPlayUpdateStatus;
};

export type AlarmPyoPlayUpdateCompleteResult = {
  completed: boolean;
  status: AlarmPyoPlayUpdateStatus;
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

export type AlarmPyoAlarmRuntimeResetResult = {
  outcome: 'success' | 'partial' | 'failure';
  workAlarmsReset: boolean;
  sleepRemindersReset: boolean;
  quickTimerReset: boolean;
  activeAlarmStopped: boolean;
  alarmSoundReset: boolean;
  restoreJournalReset: boolean;
  alarmHistoryReset: boolean;
  issueCodes: (
    | 'work-alarms'
    | 'sleep-reminders'
    | 'quick-timer'
    | 'active-alarm'
    | 'alarm-sound'
    | 'restore-journal'
    | 'alarm-history'
  )[];
};

type AlarmPyoAlarmNativeModule = {
  syncAlarmsAsync(plans: AlarmPyoAlarmPlan[]): Promise<AlarmPyoAlarmStatus>;
  syncAlarmsWithMetadataAsync?(
    plans: AlarmPyoAlarmPlan[],
    metadata: AlarmPyoAlarmSyncMetadata,
  ): Promise<AlarmPyoAlarmStatus>;
  getStatusAsync(): Promise<AlarmPyoAlarmStatus>;
  requestAlarmPermissionsAsync(): Promise<AlarmPyoAlarmStatus>;
  openPermissionSettingsAsync?(
    target: AlarmPyoPermissionSettingsTarget,
  ): Promise<AlarmPyoPermissionSettingsLaunchResult>;
  openAlarmPermissionSettingsAsync(): Promise<AlarmPyoAlarmStatus>;
  openFullScreenPermissionSettingsAsync(): Promise<AlarmPyoAlarmStatus>;
  openDoNotDisturbSettingsAsync(): Promise<boolean>;
  openBatterySettingsAsync(): Promise<boolean>;
  scheduleTestAlarmAsync(seconds?: number): Promise<AlarmPyoAlarmStatus>;
  cancelAllAsync(): Promise<AlarmPyoAlarmStatus>;
  resetAlarmRuntimeAsync?(): Promise<AlarmPyoAlarmRuntimeResetResult>;
  getQuickTimerStatusAsync?(): Promise<AlarmPyoQuickTimerStatus>;
  scheduleQuickTimerAsync?(durationMinutes: 30 | 45 | 60): Promise<AlarmPyoQuickTimerStatus>;
  pauseQuickTimerAsync?(): Promise<AlarmPyoQuickTimerStatus>;
  resumeQuickTimerAsync?(): Promise<AlarmPyoQuickTimerStatus>;
  resetQuickTimerAsync?(): Promise<AlarmPyoQuickTimerStatus>;
  cancelQuickTimerAsync?(): Promise<AlarmPyoQuickTimerStatus>;
  syncSleepRemindersAsync?(
    plans: AlarmPyoSleepReminderPlan[],
  ): Promise<AlarmPyoSleepReminderStatus>;
  cancelSleepRemindersAsync?(): Promise<AlarmPyoSleepReminderStatus>;
  getSleepReminderStatusAsync?(): Promise<AlarmPyoSleepReminderStatus>;
  requestSleepReminderPermissionAsync?(): Promise<AlarmPyoSleepReminderStatus>;
  openSleepReminderSettingsAsync?(): Promise<AlarmPyoSleepReminderStatus>;
  getAlarmSoundAsync?(): Promise<AlarmPyoAlarmSoundStatus>;
  selectAlarmSoundAsync?(): Promise<AlarmPyoAlarmSoundStatus>;
  previewAlarmSoundAsync?(): Promise<boolean>;
  stopAlarmSoundPreviewAsync?(): Promise<boolean>;
  resetAlarmSoundAsync?(): Promise<AlarmPyoAlarmSoundStatus>;
  syncWidgetAsync(snapshotJson: string): Promise<boolean>;
  isWidgetInstalledAsync(): Promise<boolean>;
  requestWidgetPinAsync(): Promise<{
    status: 'requested' | 'installed' | 'unsupported' | 'missing' | 'failed';
    supported: boolean;
    installed: boolean;
  }>;
  getPlayUpdateStatusAsync?(): Promise<AlarmPyoPlayUpdateStatus>;
  startPlayUpdateAsync?(): Promise<AlarmPyoPlayUpdateStartResult>;
  completePlayUpdateAsync?(): Promise<AlarmPyoPlayUpdateCompleteResult>;
  getAppInstallInfoAsync(): Promise<{
    supported: boolean;
    packageName: string;
    versionName: string;
    versionCode: number;
    installPermissionAllowed: boolean;
  }>;
  openApkInstallPermissionSettingsAsync(): Promise<boolean>;
  verifyApkUpdateAsync(
    fileUri: string,
    expectedSha256: string,
    expectedVersionCode: number,
  ): Promise<{
    valid: boolean;
    versionCode: number;
    sha256: string;
  }>;
  verifyAndOpenApkInstallerAsync(
    fileUri: string,
    expectedSha256: string,
    expectedVersionCode: number,
  ): Promise<{
    opened: boolean;
    permissionRequired: boolean;
    versionCode: number;
    sha256: string;
  }>;
};

const AlarmPyoAlarm = requireNativeModule<AlarmPyoAlarmNativeModule>('AlarmPyoAlarm');

export default AlarmPyoAlarm;
