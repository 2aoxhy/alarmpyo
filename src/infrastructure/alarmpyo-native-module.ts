import { requireOptionalNativeModule } from 'expo-modules-core';

import type { AlarmPyoAlarmPlan } from '../services/alarm-planner';

export type NativeAlarmPyoRuntimeResetResult = {
  outcome: 'success' | 'partial' | 'failure';
  workAlarmsReset: boolean;
  sleepRemindersReset: boolean;
  quickTimerReset: boolean;
  activeAlarmStopped: boolean;
  alarmSoundReset: boolean;
  restoreJournalReset: boolean;
  alarmHistoryReset: boolean;
  issueCodes: string[];
};

/**
 * AlarmPyo 앱과 네이티브 알람 모듈이 함께 사용하는 계약이에요.
 * 화면과 서비스는 이 경계만 사용해 네이티브 모듈 이름과 타입을 한곳에서 관리해요.
 */
export type NativeAlarmPyoModule = {
  syncAlarmsAsync(plans: AlarmPyoAlarmPlan[]): Promise<unknown>;
  getStatusAsync(): Promise<unknown>;
  scheduleTestAlarmAsync(seconds?: number): Promise<unknown>;
  requestAlarmPermissionsAsync(): Promise<unknown>;
  openAlarmPermissionSettingsAsync(): Promise<unknown>;
  openFullScreenPermissionSettingsAsync(): Promise<unknown>;
  openDoNotDisturbSettingsAsync?(): Promise<unknown>;
  openBatterySettingsAsync?(): Promise<unknown>;
  cancelAllAsync(): Promise<unknown>;
  resetAlarmRuntimeAsync?(): Promise<unknown>;
  getQuickTimerStatusAsync?(): Promise<unknown>;
  scheduleQuickTimerAsync?(durationMinutes: 30 | 60): Promise<unknown>;
  cancelQuickTimerAsync?(): Promise<unknown>;
  syncWidgetAsync?(snapshotJson: string): Promise<unknown>;
  isWidgetInstalledAsync?(): Promise<unknown>;
  requestWidgetPinAsync?(): Promise<unknown>;
  getAppInstallInfoAsync?(): Promise<unknown>;
  openApkInstallPermissionSettingsAsync?(): Promise<unknown>;
  verifyApkUpdateAsync?(
    fileUri: string,
    expectedSha256: string,
    expectedVersionCode: number,
  ): Promise<unknown>;
  verifyAndOpenApkInstallerAsync?(
    fileUri: string,
    expectedSha256: string,
    expectedVersionCode: number,
  ): Promise<unknown>;
};

const nativeModule = requireOptionalNativeModule<NativeAlarmPyoModule>('AlarmPyoAlarm');

export function getAlarmPyoNativeModule(): NativeAlarmPyoModule | null {
  return nativeModule;
}
