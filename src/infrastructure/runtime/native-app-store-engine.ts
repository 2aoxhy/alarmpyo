import { Platform } from 'react-native';
import { AppStoreEngine } from '@/application/runtime/app-store-engine';
import {
  clearPlayUpdatePromptSnooze,
  clearQuickSetupDraft,
} from '@/application/device-local-state';
import { quarantineCorruptAppData } from '@/services/corrupt-data-quarantine-service';
import {
  clearResetCleanupJournal,
  prepareResetCleanupJournal,
  resumeResetCleanupJournal,
} from '@/services/reset-cleanup-journal-service';
import {
  cancelAllAlarmPyoAlarms,
  resetAlarmPyoRuntime,
  scheduleAlarmPyoTestAlarm,
} from '@/services/alarmpyo-alarm-service';
import { cancelAlarmPyoSleepReminders } from '@/services/sleep-reminder-service';
import { cancelQuickTimer } from '@/services/quick-timer-service';
import { resetAlarmSound } from '@/services/alarm-sound-service';
import { createNativeAppRuntimeController } from './native-app-runtime';
import { createAppStoreStoragePort } from './app-store-storage-adapter';
import { appDataCodec } from './app-data-codec-adapter';

async function cancelQuickTimerForResetCleanup(): Promise<void> {
  const status = await cancelQuickTimer();
  if (status.supported && (status.active || status.state === 'error')) {
    throw new Error('타이머를 취소하지 못했습니다.');
  }
}

async function resetAlarmRuntimeForResetCleanup(): Promise<void> {
  const unified = await resetAlarmPyoRuntime();
  if (unified !== null) {
    if (
      unified.outcome !== 'success' ||
      unified.issueCodes.length > 0 ||
      !unified.workAlarmsReset ||
      !unified.sleepRemindersReset ||
      !unified.quickTimerReset ||
      !unified.activeAlarmStopped ||
      !unified.alarmSoundReset ||
      !unified.restoreJournalReset ||
      !unified.alarmHistoryReset
    ) {
      throw new Error('네이티브 알람 상태 일부를 초기화하지 못했습니다.');
    }
    return;
  }

  // OTA 뒤 구형 네이티브 모듈이 잠시 실행되는 경우에도 기존 API로 최대한 정리합니다.
  await cancelQuickTimerForResetCleanup();
  const work = await cancelAllAlarmPyoAlarms();
  if (work.supported && (work.enabled || work.scheduledCount > 0)) {
    throw new Error('근무 알람을 초기화하지 못했습니다.');
  }
  const sleep = await cancelAlarmPyoSleepReminders();
  if (sleep.supported && (sleep.enabled || sleep.scheduledCount > 0)) {
    throw new Error('수면 알림을 초기화하지 못했습니다.');
  }
  const sound = await resetAlarmSound();
  if (sound.supported && sound.selected) {
    throw new Error('알람음을 초기화하지 못했습니다.');
  }
}

/** App composition root; application state receives platform implementations through ports. */
export function createNativeAppStoreEngine(): AppStoreEngine {
  const runtime = createNativeAppRuntimeController();
  return new AppStoreEngine({
    runtime,
    storage: createAppStoreStoragePort(runtime.dataRepository, quarantineCorruptAppData),
    codec: appDataCodec,
    platform: {
      quarantineCorruptAppData,
      clearPlayUpdatePromptSnooze: () => clearPlayUpdatePromptSnooze(runtime.dataRepository),
      clearQuickSetupDraft: () => clearQuickSetupDraft(runtime.dataRepository),
      clearResetCleanupJournal: () => clearResetCleanupJournal(runtime.dataRepository),
      prepareResetCleanupJournal: (snapshot) =>
        prepareResetCleanupJournal(snapshot, runtime.dataRepository),
      resumeResetCleanupJournal: (input) =>
        resumeResetCleanupJournal({ ...input, storage: runtime.dataRepository }),
      scheduleAlarmPyoTestAlarm,
      cancelQuickTimerForResetCleanup,
      resetAlarmRuntimeForResetCleanup,
      widgetSupported: Platform.OS === 'android',
      supportsGeneratedWidgetPreview:
        Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 35,
    },
  });
}
