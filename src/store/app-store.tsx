import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { withAlarmRuntimeState } from '@/application/app-data-mutations';
import {
  applyDismissedUpdateVersionCode,
  applyInitialSetupValues,
  applyPatternSettings,
  applyPayrollSettings,
  applySetupCompletion,
  applyShiftSettings,
  applyThemeMode,
  hasOnlyKnownShiftTypeIds,
  isValidDayTimeOverride,
  tryApplyDayEditValues,
  toggleWidgetDisplaySelection,
} from '@/application/app-store-mutations';
import {
  applyCanonicalSnapshotIfSourceIsCurrent,
  createDataReplacementResult,
  getAutomaticSaveContentSignature,
  getResetAllDataResult,
  getSleepReminderProjectionKey,
  persistLatestCanonicalSnapshotAndSyncSleep,
  shouldFlushAutomaticSave,
  shouldSkipEquivalentExplicitSave,
  shouldSkipAutomaticSaveForAppliedCanonicalSnapshot,
  shouldSyncAlarmsAfterReplacement,
  shouldSyncSleepRemindersAfterReplacement,
  type DataReplacementResult,
  type ResetAllDataResult,
  withDeviceBackupResult,
} from '@/application/app-store-persistence';
import {
  selectNoteForDate,
  selectShiftForDate,
} from '@/application/app-store-selectors';
import {
  createAppSelectorSource,
  type AppSelectorEquality,
  type AppSelectorSource,
} from '@/application/runtime/app-selector-source';
import {
  analyzeAppDataScheduleSafety,
  enforceAppDataScheduleSafety,
  type EnforcedScheduleSafety,
} from '@/application/app-store-schedule-safety';
import type {
  AlarmAutoCheckState,
  AlarmSyncStatus,
  AppStore,
  AppStoreActions,
  AppStoreDataState,
  AppStoreStatusState,
  DaySelection,
  InitialSetupInput,
  LatestBackupRestoreResult,
  SaveIssueCode,
  SaveOutcome,
  SaveRetryAction,
  SaveStatus,
  SleepReminderSyncStatus,
  UpdatePatternOptions,
  UpdatePatternResult,
} from '@/application/app-store-contract';
import {
  clearSaveIssue,
  clearSaveIssuesByRetryAction,
  createSavedOutcome,
  mergeSaveIssue,
} from '@/application/save-outcome';

import type {
  AppData,
  DayAlarmOverride,
  DayExceptionType,
  DayTimeOverride,
  PayrollSettings,
  RotationPattern,
  ShiftType,
  ThemeMode,
  WidgetDisplayOptions,
  WorkRoutineProfiles,
} from '@/models/app-data';
import {
  createNativeAppRuntimeController,
  type NativeAppRuntimeController,
} from '@/infrastructure/runtime/native-app-runtime';
import { useAppLifecycle } from '@/hooks/use-app-active';
import {
  appDataFromImportPreview,
  canonicalizeAppData,
  createDefaultAppData,
  exportAppDataToJson,
  isValidDayAlarmOverride,
  isScheduleDate,
  pruneInvalidDayAlarmOverrides,
  previewAppDataImport,
  serializeAppData,
  tryParseAppDataJson,
  withoutAlarmRuntimeState,
  type AppDataImportPreview,
} from '@/services/app-data-service';
import { quarantineCorruptAppData } from '@/services/corrupt-data-quarantine-service';
import { getCheckedBackupContentsByteSize } from '@/services/backup-file-policy';
import {
  APP_DATA_STORAGE_KEY,
  canRecoverAppDataFromSafetyBackup,
  clearExplicitResetMarker,
  createLatestStorageValueCoordinator,
  createSerializedMutationCoordinator,
  createSerializedStorageWriter,
  findMatchingLastKnownGoodSnapshot,
  getSnapshotPersistenceOutcome,
  hasExplicitResetMarker,
  loadAppDataFromStorage,
  persistSnapshotWithLastKnownGood,
  protectPendingRestoreBackupBeforeDataChange,
  readAutomaticBackup,
  readPendingRestoreBackup,
  readRecoveryBackup,
  reconcilePendingRestoreBackup,
  retryPendingRestoreBackupCommit,
  restoreWithAutomaticBackupCommit,
  type AppDataLoadFailureReason,
  writeAutomaticBackup,
  writeExplicitResetMarker,
  writeLastKnownGoodBackup,
} from '@/services/app-storage-service';
import {
  cancelAllAlarmPyoAlarms,
  resetAlarmPyoRuntime,
  scheduleAlarmPyoTestAlarm,
} from '@/services/alarmpyo-alarm-service';
import {
  buildAlarmPyoAlarmPlan,
  buildAlarmPyoAlarmSyncMetadata,
  type AlarmPyoAlarmPlan,
  type AlarmPyoAlarmSyncMetadata,
} from '@/services/alarm-planner';
import { getAlarmScheduleSignature } from '@/services/alarm-schedule-signature';
import {
  buildSleepReminderPlans,
  getSleepReminderScheduleSignature,
} from '@/services/sleep-reminder-planner';
import {
  cancelAlarmPyoSleepReminders,
} from '@/services/sleep-reminder-service';
import { cancelQuickTimer } from '@/services/quick-timer-service';
import { resetAlarmSound } from '@/services/alarm-sound-service';
import {
  clearResetCleanupJournal,
  prepareResetCleanupJournal,
  resumeResetCleanupJournal,
} from '@/services/reset-cleanup-journal-service';
import {
  applyBulkDayChange,
  type BulkDayChange,
} from '@/services/bulk-day-update';
import {
  ALARM_DELIVERY_RETRY_GRACE_MS,
  canPreserveActiveAlarmDeliveryRetry,
  canSkipDisabledAlarmStatusCheck,
  isAlarmPyoAlarmPlanContentSynchronized,
  isAlarmPyoAlarmScheduleSynchronized,
  markAlarmDisableSyncPending,
  MAX_NATIVE_SCHEDULED_ALARMS,
  resolveCompletedAlarmAutoCheckStatus,
  shouldBlockAutomaticAlarmRepair,
  shouldSyncAlarmPyoAlarmSnapshot,
} from '@/services/alarm-sync-policy';
import {
  applyWorkSettingsTransaction,
  exportWorkSettingsToJson,
  previewWorkSettingsImport,
  type WorkSettingsSharePreview,
} from '@/services/work-settings-share-service';
import {
  buildPatternApplicationMutation,
  buildPatternRollbackMutation,
  createUserPatternId,
  deletePatternMutation,
  importValidatedPatternMutation,
  previewPatternApplication as previewPatternApplicationForData,
  runPatternPersistenceTransaction,
  saveUserPatternMutation,
  type PatternApplicationInput,
  type PatternApplyResult,
  type PatternRollbackResult,
  type PatternVaultSaveResult,
  type UserPatternInput,
} from '@/services/pattern-vault-service';
import type { ValidatedPatternDescriptor } from '@/services/shift-pattern-schema';
import { isValidWorkRoutineTiming } from '@/services/work-routine-settings';
import { isValidDateKey, toDateKey } from '@/utils/date';
import {
  DAY_EXCEPTION_TYPES,
} from '@/utils/day-exception';

import { applyNativeAlarmSnapshot, runAlarmSyncCheck } from './alarm-sync-runner';

export type {
  AlarmAutoCheckState,
  AlarmSyncStatus,
  AppStore,
  AppStoreActions,
  AppStoreDataState,
  AppStoreStatusState,
  DaySelection,
  InitialSetupInput,
  LatestBackupRestoreResult,
  PendingRestoreBackupPreview,
  SaveIssueCode,
  SaveOutcome,
  SaveStatus,
  UpdatePatternOptions,
} from '@/application/app-store-contract';
export type {
  PatternApplicationInput,
  PatternApplicationPreview,
  PatternApplicationPreviewResult,
  PatternApplicationPreviewRow,
  PatternApplyResult,
  PatternOverridePolicy,
  PatternRollbackResult,
  PatternVaultDeleteResult,
  PatternVaultSaveResult,
  UserPatternInput,
} from '@/services/pattern-vault-service';

export function createDefaultData(anchorDate = toDateKey(new Date())): AppData {
  return createDefaultAppData(anchorDate);
}

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

const AUTOMATIC_SAVE_DEBOUNCE_MS = 300;
const SLEEP_REMINDER_SYNC_SAVE_ERROR =
  '자료는 저장했지만 수면 알림을 갱신하지 못했습니다. 앱을 다시 열면 자동으로 다시 시도합니다.';

export function resolveShiftFromData(data: AppData, dateKey: string): ShiftType | null {
  return selectShiftForDate(data, dateKey);
}

const AppStoreDataContext = createContext<AppStoreDataState | null>(null);
const AppStoreStatusContext = createContext<AppStoreStatusState | null>(null);
const AppStoreActionsContext = createContext<AppStoreActions | null>(null);
const AppStoreSelectorContext = createContext<AppSelectorSource<AppStore> | null>(null);
const AppRuntimeContext = createContext<NativeAppRuntimeController | null>(null);

function AppStoreSelectorProvider({
  children,
  value,
}: PropsWithChildren<{ value: AppStore }>) {
  const [source] = useState(() => createAppSelectorSource(value));

  useLayoutEffect(() => {
    source.setSnapshot(value);
  }, [source, value]);

  return (
    <AppStoreSelectorContext.Provider value={source}>
      {children}
    </AppStoreSelectorContext.Provider>
  );
}

export function AppStoreProvider({ children }: PropsWithChildren) {
  const appLifecycle = useAppLifecycle();
  const [runtime] = useState(createNativeAppRuntimeController);
  const [data, setData] = useState<AppData>(() => createDefaultData());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadFailureReason, setLoadFailureReason] =
    useState<AppDataLoadFailureReason | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveOutcome, setSaveOutcome] = useState<SaveOutcome | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessRevision, setSaveSuccessRevision] = useState(0);
  const [alarmSyncStatus, setAlarmSyncStatus] =
    useState<AlarmSyncStatus>('idle');
  const [alarmSyncError, setAlarmSyncError] = useState<string | null>(null);
  const [sleepReminderSyncStatus, setSleepReminderSyncStatus] =
    useState<SleepReminderSyncStatus>('idle');
  const [sleepReminderSyncError, setSleepReminderSyncError] =
    useState<string | null>(null);
  const [sleepReminderSyncRevision, setSleepReminderSyncRevision] = useState(0);
  const [corruptBackupKey, setCorruptBackupKey] = useState<string | null>(null);
  const [alarmAutoCheckState, setAlarmAutoCheckState] =
    useState<AlarmAutoCheckState>({ checkedAt: null, status: 'idle' });
  const [storageWriter] = useState(() =>
    createSerializedStorageWriter(runtime.dataRepository),
  );
  const [appDataWriter] = useState(() =>
    createLatestStorageValueCoordinator(storageWriter, APP_DATA_STORAGE_KEY),
  );
  const [mutationCoordinator] = useState(() => createSerializedMutationCoordinator());

  const mountedRef = useRef(true);
  const readyRef = useRef(false);
  const dataRef = useRef(data);
  const loadAttemptRef = useRef(0);
  const saveRevisionRef = useRef(0);
  const automaticSaveGenerationRef = useRef(0);
  const automaticSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const automaticSaveAppliedCanonicalSnapshotRef = useRef<AppData | null>(null);
  const lastPersistedAutomaticSaveSignatureRef = useRef<string | null>(null);
  const lastKnownGoodSnapshotRef = useRef<string | null>(null);
  const alarmResumeSyncRef = useRef<Promise<boolean> | null>(null);
  const sleepReminderSyncTailRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const sleepReminderSyncAttemptRef = useRef(0);
  const lastAlarmSyncSignatureRef = useRef<string | null>(null);
  const failedAlarmSyncSignatureRef = useRef<string | null>(null);
  const lastSleepReminderSyncSignatureRef = useRef<string | null>(null);
  const lastSleepReminderProjectionKeyRef = useRef<string | null>(null);
  const failedSleepReminderSyncSignatureRef = useRef<string | null>(null);
  const sleepReminderFailureSaveRevisionRef = useRef<number | null>(null);
  const saveOutcomeRef = useRef<SaveOutcome | null>(null);
  const lastTimeZoneOffsetRef = useRef(new Date().getTimezoneOffset());
  const backupRequestRef = useRef<Promise<string> | null>(null);
  const missingPrimaryRecoveryRawRef = useRef<string | null>(null);
  const explicitResetMarkerPendingRef = useRef(false);
  const lastSleepReminderLifecycleTransitionRef = useRef(
    appLifecycle.transitionId,
  );

  const recordSaveOutcome = useCallback((outcome: SaveOutcome | null) => {
    saveOutcomeRef.current = outcome;
    if (!mountedRef.current) return;
    setSaveOutcome(outcome);
    setSaveError(
      outcome !== null && outcome.status !== 'success' ? outcome.message : null,
    );
  }, []);

  const reportSaveIssue = useCallback((
    issueCode: SaveIssueCode,
    message: string,
  ) => {
    const outcome = mergeSaveIssue(saveOutcomeRef.current, issueCode, message);
    recordSaveOutcome(outcome);
    if (mountedRef.current) setSaveStatus('error');
  }, [recordSaveOutcome]);

  const clearReportedSaveIssue = useCallback((issueCode: SaveIssueCode) => {
    const current = saveOutcomeRef.current;
    if (!current?.issues.some((issue) => issue.issueCode === issueCode)) return;
    const outcome = clearSaveIssue(current, issueCode);
    recordSaveOutcome(outcome);
    if (mountedRef.current) {
      setSaveStatus(outcome.status === 'success' ? 'saved' : 'error');
    }
  }, [recordSaveOutcome]);

  const reportUnsafeAlarmSchedule = useCallback((
    enforced: EnforcedScheduleSafety,
  ) => {
    if (enforced.safety.canEnableAlarms) {
      clearReportedSaveIssue('unsafe-alarm-schedule');
      clearReportedSaveIssue('invalid-work-schedule');
      return;
    }
    const hasUnsupportedShift = enforced.safety.unsupportedShiftTypeIds.length > 0;
    reportSaveIssue(
      'unsafe-alarm-schedule',
      hasUnsupportedShift
        ? '자료는 보존했지만 이전 형식의 근무가 포함되어 근무 알람을 껐습니다. 근무 방식을 다시 확인해야 합니다.'
        : '자료는 저장되었지만 이전 근무 중 알람이 울릴 수 있어 근무 알람을 껐습니다. 근무 시간과 순서를 확인한 뒤 알람을 다시 켜야 합니다.',
    );
  }, [clearReportedSaveIssue, reportSaveIssue]);

  const reportInvalidWorkSchedule = useCallback(() => {
    reportSaveIssue(
      'invalid-work-schedule',
      '근무 시간이 이전 일정과 겹치거나 올바르지 않아 저장하지 못했습니다. 근무 시간과 순서를 확인해야 합니다.',
    );
  }, [reportSaveIssue]);

  const reportAlarmEnableBlocked = useCallback(() => {
    reportSaveIssue(
      'invalid-work-schedule',
      '이전 근무 중 알람이 울리거나 근무 시간이 겹칠 수 있어 알람을 켜지 않았습니다. 근무 시간과 순서를 먼저 확인해야 합니다.',
    );
  }, [reportSaveIssue]);

  const finalizeScheduleMutation = useCallback((
    enforced: EnforcedScheduleSafety | null,
    saved: boolean,
  ): boolean => {
    if (enforced === null || enforced.data === null) {
      reportInvalidWorkSchedule();
      return false;
    }
    if (!saved) return false;
    reportUnsafeAlarmSchedule(enforced);
    return true;
  }, [reportInvalidWorkSchedule, reportUnsafeAlarmSchedule]);

  const clearReportedSaveIssues = useCallback((
    retryAction: SaveRetryAction,
    markSaved = false,
  ) => {
    const current = saveOutcomeRef.current;
    if (
      !markSaved &&
      !current?.issues.some((issue) => issue.retryAction === retryAction)
    ) {
      return;
    }
    const outcome = clearSaveIssuesByRetryAction(
      current,
      retryAction,
    );
    recordSaveOutcome(outcome);
    if (mountedRef.current) {
      setSaveStatus(outcome.status === 'success' ? 'saved' : 'error');
    }
  }, [recordSaveOutcome]);

  const reportSaveSuccess = useCallback(() => {
    clearReportedSaveIssues('retry-save', true);
  }, [clearReportedSaveIssues]);

  const getPersistedDataForPendingRestore = useCallback((): AppData => {
    const persistedSnapshot = appDataWriter.getPersistedValue();
    if (persistedSnapshot === null) return dataRef.current;
    const parsed = tryParseAppDataJson(persistedSnapshot);
    return parsed.ok ? parsed.value.data : dataRef.current;
  }, [appDataWriter]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      if (automaticSaveTimerRef.current !== null) {
        clearTimeout(automaticSaveTimerRef.current);
        automaticSaveTimerRef.current = null;
      }
      mountedRef.current = false;
      readyRef.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    const attempt = loadAttemptRef.current + 1;
    loadAttemptRef.current = attempt;
    readyRef.current = false;
    setReady(false);
    setLoadError(null);
    setLoadFailureReason(null);
    setCorruptBackupKey(null);
    setSaveStatus('idle');
    setSaveOutcome(null);
    setSaveError(null);
    setAlarmSyncStatus('idle');
    setAlarmSyncError(null);
    setSleepReminderSyncStatus('idle');
    setSleepReminderSyncError(null);
    setAlarmAutoCheckState({ checkedAt: null, status: 'idle' });
    lastKnownGoodSnapshotRef.current = null;
    missingPrimaryRecoveryRawRef.current = null;
    explicitResetMarkerPendingRef.current = false;
    lastAlarmSyncSignatureRef.current = null;
    failedAlarmSyncSignatureRef.current = null;
    lastSleepReminderSyncSignatureRef.current = null;
    lastSleepReminderProjectionKeyRef.current = null;
    failedSleepReminderSyncSignatureRef.current = null;
    sleepReminderSyncAttemptRef.current += 1;
    sleepReminderFailureSaveRevisionRef.current = null;
    saveOutcomeRef.current = null;
    lastPersistedAutomaticSaveSignatureRef.current = null;

    let result = await loadAppDataFromStorage(
      runtime.dataRepository,
      createDefaultData(),
      runtime.now(),
      quarantineCorruptAppData,
    );
    let deviceBackup: Awaited<ReturnType<typeof runtime.readLatestBackup>> = null;
    const shouldInspectDeviceBackup =
      (result.ok && result.source === 'empty') ||
      (!result.ok &&
        (result.reason === 'corrupt' || result.reason === 'recovery-required'));
    if (shouldInspectDeviceBackup) {
      try {
        deviceBackup = await runtime.readLatestBackup();
      } catch {
        // 독립 파일 백업을 읽지 못해도 AsyncStorage의 정상 백업을 계속 확인합니다.
      }
    }
    if (
      deviceBackup &&
      ((result.ok && result.source === 'empty') ||
        (!result.ok && result.reason === 'recovery-required'))
    ) {
      const deviceBackupRaw = deviceBackup.exportedAt
        ? exportAppDataToJson(deviceBackup.data, new Date(deviceBackup.exportedAt))
        : serializeAppData(deviceBackup.data);
      result = await loadAppDataFromStorage(
        runtime.dataRepository,
        createDefaultData(),
        runtime.now(),
        quarantineCorruptAppData,
        {
          missingPrimaryRecoveryCandidates: [
            { raw: deviceBackupRaw, source: 'device-safety' },
          ],
        },
      );
    }
    let recoveredFromDeviceBackup = false;
    if (canRecoverAppDataFromSafetyBackup(result)) {
      try {
        if (deviceBackup) {
          const recoveredSnapshot = serializeAppData(deviceBackup.data);
          await storageWriter.write(APP_DATA_STORAGE_KEY, recoveredSnapshot);
          result = await loadAppDataFromStorage(
            runtime.dataRepository,
            createDefaultData(),
            runtime.now(),
            quarantineCorruptAppData,
          );
          recoveredFromDeviceBackup = result.ok;
          if (recoveredFromDeviceBackup) {
            try {
              await writeLastKnownGoodBackup(storageWriter, recoveredSnapshot);
            } catch {
              // 본문 복구가 끝났다면 최근 정상 저장본 갱신 실패로 복구를 되돌리지 않습니다.
            }
          }
        }
      } catch {
        // 기기 파일 백업을 읽거나 복구하지 못하면 보존한 손상 원본과 복구 화면을 유지합니다.
      }
    }
    const matchingLastKnownGoodSnapshot = result.ok
      ? await findMatchingLastKnownGoodSnapshot(
          runtime.dataRepository,
          result.persistedSnapshot,
        )
      : null;
    const explicitResetMarkerPending = result.ok
      ? result.source === 'reset' || await hasExplicitResetMarker(runtime.dataRepository).catch(() => false)
      : false;
    if (!mountedRef.current || loadAttemptRef.current !== attempt) return false;
    let resetCleanupCompleted = true;
    if (result.ok) {
      await reconcilePendingRestoreBackup(
        runtime.dataRepository,
        storageWriter,
        result.data,
      );
      try {
        const cleanup = await resumeResetCleanupJournal({
          persistedSnapshot: result.persistedSnapshot,
          resetFallbackLoaded: result.source === 'reset',
          resetAlarmRuntime: resetAlarmRuntimeForResetCleanup,
          cancelTimer: cancelQuickTimerForResetCleanup,
        });
        resetCleanupCompleted = cleanup.completed;
      } catch {
        resetCleanupCompleted = false;
      }
    }
    if (!mountedRef.current || loadAttemptRef.current !== attempt) return false;

    if (!result.ok) {
      if (result.reason === 'recovery-required') {
        missingPrimaryRecoveryRawRef.current = result.recovery.raw;
      }
      setLoadError(result.error);
      setLoadFailureReason(result.reason);
      setCorruptBackupKey(result.corruptBackupKey);
      return false;
    }

    const loadedScheduleSafety = enforceAppDataScheduleSafety(result.data, {
      mode: 'ingress',
    });
    const loadedData = loadedScheduleSafety.data ?? result.data;
    lastPersistedAutomaticSaveSignatureRef.current =
      getAutomaticSaveContentSignature(result.data);
    dataRef.current = loadedData;
    explicitResetMarkerPendingRef.current = explicitResetMarkerPending;
    appDataWriter.setPersistedValue(result.persistedSnapshot);
    lastKnownGoodSnapshotRef.current = matchingLastKnownGoodSnapshot;
    setData(loadedData);
    readyRef.current = true;
    setReady(true);
    setSaveStatus(
      recoveredFromDeviceBackup || result.source === 'stored'
        ? 'saved'
        : 'idle',
    );
    if (recoveredFromDeviceBackup || result.source === 'stored') {
      const outcome = createSavedOutcome();
      saveOutcomeRef.current = outcome;
      setSaveOutcome(outcome);
    }
    if (recoveredFromDeviceBackup) {
      setSaveSuccessRevision((current) => current + 1);
    }
    if (!resetCleanupCompleted) {
      reportSaveIssue(
        'reset-marker-cleanup-failed',
        '자료는 초기화되었지만 알람 상태 또는 이전 설정 초안 정리가 남았습니다. 앱을 다시 열면 자동으로 재시도합니다.',
      );
    }
    reportUnsafeAlarmSchedule(loadedScheduleSafety);
    return true;
  }, [appDataWriter, reportSaveIssue, reportUnsafeAlarmSchedule, runtime, storageWriter]);

  useEffect(() => {
    const timeout = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(timeout);
  }, [loadData]);

  const updateData = useCallback((update: (current: AppData) => AppData): boolean => {
    if (!readyRef.current) return false;
    const current = dataRef.current;
    const next = update(current);
    if (Object.is(next, current)) return true;
    dataRef.current = next;
    setData(next);
    return true;
  }, []);

  const reportAlarmSyncFailure = useCallback((notificationsEnabled = true) => {
    if (!mountedRef.current) return;
    setAlarmSyncStatus('error');
    setAlarmSyncError(
      notificationsEnabled
        ? '변경 내용은 저장했지만 알람을 다시 예약하지 못했습니다. 알람 화면에서 권한을 확인한 뒤 다시 예약해야 합니다.'
        : '알람을 끄는 설정은 저장했지만 기존 예약을 취소하지 못했습니다. 알람 화면에서 다시 시도해야 합니다.',
    );
    reportSaveIssue(
      'alarm-sync-failed',
      notificationsEnabled
        ? '변경 내용은 저장되었지만 알람을 다시 예약하지 못했습니다. 알람 화면에서 권한을 확인한 뒤 다시 예약해야 합니다.'
        : '알람을 끄는 설정은 저장되었지만 기존 예약을 취소하지 못했습니다. 알람 화면에서 다시 시도해야 합니다.',
    );
  }, [reportSaveIssue]);

  const syncAlarmsForSnapshot = useCallback(async (
    snapshot: AppData,
    preparedPlan?: readonly AlarmPyoAlarmPlan[],
    preparedMetadata?: AlarmPyoAlarmSyncMetadata,
  ) => {
    const signature = getAlarmScheduleSignature(snapshot);
    const enforcedScheduleSafety = enforceAppDataScheduleSafety(snapshot, {
      mode: 'ingress',
    });
    const syncSnapshot = enforcedScheduleSafety.data ?? snapshot;
    const scheduleSafetyBlocked = !enforcedScheduleSafety.safety.canEnableAlarms;
    if (scheduleSafetyBlocked) reportUnsafeAlarmSchedule(enforcedScheduleSafety);
    if (mountedRef.current) {
      setAlarmSyncStatus('syncing');
      setAlarmSyncError(null);
    }
    try {
      const plan = syncSnapshot.settings.notificationsEnabled
        ? preparedPlan ?? buildAlarmPyoAlarmPlan(
        syncSnapshot,
        (dateKey) =>
          resolveShiftFromData(syncSnapshot, dateKey),
      )
        : [];
      const status = await applyNativeAlarmSnapshot({
        notificationsEnabled: syncSnapshot.settings.notificationsEnabled,
        plan,
        synchronize: (alarms) => runtime.synchronizeAlarms(
          alarms,
          preparedMetadata ?? buildAlarmPyoAlarmSyncMetadata(),
        ),
        cancelAll: () => runtime.cancelAllAlarms(),
      });
      if (
        status.supported &&
        (!isAlarmPyoAlarmScheduleSynchronized({
          actualScheduledCount: status.scheduledCount,
          exactAlarmAllowed: status.exactAlarmAllowed,
          notificationsAllowed: status.notificationsAllowed,
          plannedAlarmCount: plan.length,
        }) ||
          !isAlarmPyoAlarmPlanContentSynchronized({
            actualScheduledAlarms: status.scheduledAlarms,
            exactAlarmAllowed: status.exactAlarmAllowed,
            notificationsAllowed: status.notificationsAllowed,
            plannedAlarms: plan,
          }))
      ) {
        throw new Error('알람 예약 내용이 계획과 일치하지 않습니다.');
      }
      lastTimeZoneOffsetRef.current = runtime.now().getTimezoneOffset();
      lastAlarmSyncSignatureRef.current = signature;
      if (failedAlarmSyncSignatureRef.current === signature) {
        failedAlarmSyncSignatureRef.current = null;
      }
      if (mountedRef.current) {
        setAlarmSyncStatus('synced');
        setAlarmSyncError(null);
        clearReportedSaveIssues('retry-alarms');
      }
      updateData((current) => {
        if (getAlarmScheduleSignature(current) !== signature) return current;
        const safeCurrent = scheduleSafetyBlocked
          ? enforceAppDataScheduleSafety(current, { mode: 'ingress' }).data ?? current
          : current;
        return withAlarmRuntimeState(
          safeCurrent,
          status.scheduledCount,
          runtime.now().toISOString(),
        );
      });
      return true;
    } catch {
      failedAlarmSyncSignatureRef.current = signature;
      reportAlarmSyncFailure(syncSnapshot.settings.notificationsEnabled);
      return false;
    }
  }, [
    clearReportedSaveIssues,
    reportAlarmSyncFailure,
    reportUnsafeAlarmSchedule,
    runtime,
    updateData,
  ]);

  const syncSleepRemindersForSnapshot = useCallback(
    (snapshot: AppData, force = false): Promise<boolean> => {
      const signature = getSleepReminderScheduleSignature(snapshot);
      const syncNow = runtime.now();
      const projectionKey = getSleepReminderProjectionKey(syncNow);
      const attempt = sleepReminderSyncAttemptRef.current + 1;
      sleepReminderSyncAttemptRef.current = attempt;
      const task = sleepReminderSyncTailRef.current
        .catch(() => false)
        .then(async () => {
          if (
            !force &&
            lastSleepReminderSyncSignatureRef.current === signature &&
            (
              !snapshot.settings.sleepReminderEnabled ||
              lastSleepReminderProjectionKeyRef.current === projectionKey
            )
          ) {
            if (
              mountedRef.current &&
              sleepReminderSyncAttemptRef.current === attempt
            ) {
              setSleepReminderSyncStatus('synced');
              setSleepReminderSyncError(null);
              clearReportedSaveIssues('retry-sleep-reminders');
            }
            return true;
          }
          if (mountedRef.current) {
            setSleepReminderSyncStatus('syncing');
            setSleepReminderSyncError(null);
          }
          try {
            if (
              snapshot.settings.sleepReminderEnabled &&
              snapshot.settings.setupCompleted
            ) {
              await runtime.synchronizeSleepReminders(
                buildSleepReminderPlans(snapshot, { now: syncNow }),
              );
            } else {
              await runtime.cancelAllSleepReminders();
            }
            if (mountedRef.current) {
              setSleepReminderSyncRevision((current) => current + 1);
            }
            lastSleepReminderSyncSignatureRef.current = signature;
            lastSleepReminderProjectionKeyRef.current = projectionKey;
            failedSleepReminderSyncSignatureRef.current = null;
            sleepReminderFailureSaveRevisionRef.current = null;
            if (
              mountedRef.current &&
              sleepReminderSyncAttemptRef.current === attempt
            ) {
              setSleepReminderSyncStatus('synced');
              setSleepReminderSyncError(null);
              clearReportedSaveIssues('retry-sleep-reminders');
            }
            return true;
          } catch {
            if (mountedRef.current) {
              setSleepReminderSyncRevision((current) => current + 1);
            }
            failedSleepReminderSyncSignatureRef.current = signature;
            if (lastSleepReminderSyncSignatureRef.current === signature) {
              lastSleepReminderSyncSignatureRef.current = null;
              lastSleepReminderProjectionKeyRef.current = null;
            }
            if (
              mountedRef.current &&
              sleepReminderSyncAttemptRef.current === attempt
            ) {
              setSleepReminderSyncStatus('error');
              setSleepReminderSyncError(SLEEP_REMINDER_SYNC_SAVE_ERROR);
            }
            // 저장 결과 표시는 호출한 저장 흐름에서 결정하고, 앱 복귀·초기 동기화 실패가
            // unrelated 저장 오류를 덮어쓰지 않게 합니다.
            return false;
          }
        });
      sleepReminderSyncTailRef.current = task;
      return task;
    },
    [clearReportedSaveIssues, runtime],
  );

  const reportSleepReminderSaveFailure = useCallback((revision: number) => {
    sleepReminderFailureSaveRevisionRef.current = revision;
    if (mountedRef.current && saveRevisionRef.current === revision) {
      reportSaveIssue(
        'sleep-reminder-sync-failed',
        SLEEP_REMINDER_SYNC_SAVE_ERROR,
      );
    }
  }, [reportSaveIssue]);

  const persistSnapshot = useCallback(async (
    snapshot: string,
    force = false,
    announceSuccess = false,
    canonicalData?: AppData,
  ) => {
    if (!readyRef.current) {
      return {
        ...getSnapshotPersistenceOutcome(false, false),
        deviceBackupSaved: false,
      };
    }

    const previousSnapshot = appDataWriter.getPersistedValue();
    if (previousSnapshot !== null && previousSnapshot !== snapshot) {
      const previous = tryParseAppDataJson(previousSnapshot);
      const next = tryParseAppDataJson(snapshot);
      let pendingRestoreProtected = false;
      if (previous.ok && next.ok) {
        try {
          pendingRestoreProtected = await protectPendingRestoreBackupBeforeDataChange(
            runtime.dataRepository,
            storageWriter,
            previous.value.data,
            next.value.data,
          );
        } catch {
          pendingRestoreProtected = false;
        }
      }
      if (!pendingRestoreProtected) {
        if (mountedRef.current) {
          reportSaveIssue(
            'restore-protection-failed',
            '복원 전 원본 백업을 아직 안전하게 보호하지 못했습니다. 저장 공간을 확인한 뒤 다시 저장해야 합니다.',
          );
        }
        return {
          ...getSnapshotPersistenceOutcome(false, false),
          deviceBackupSaved: false,
          persistedSnapshot: previousSnapshot,
          lastKnownGoodSnapshot: lastKnownGoodSnapshotRef.current,
        };
      }
    }

    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    if (mountedRef.current) {
      recordSaveOutcome(
        clearSaveIssuesByRetryAction(
          saveOutcomeRef.current,
          'retry-save',
        ),
      );
      setSaveStatus('saving');
    }

    const outcome = await persistSnapshotWithLastKnownGood(
      appDataWriter,
      storageWriter,
      snapshot,
      lastKnownGoodSnapshotRef.current,
      { force },
    );
    lastKnownGoodSnapshotRef.current = outcome.lastKnownGoodSnapshot;
    const parsedSnapshot = canonicalData === undefined
      ? tryParseAppDataJson(snapshot)
      : null;
    const savedData = canonicalData ?? (parsedSnapshot?.ok ? parsedSnapshot.value.data : null);
    if (outcome.primarySaved && savedData !== null) {
      lastPersistedAutomaticSaveSignatureRef.current =
        getAutomaticSaveContentSignature(savedData);
      if (automaticSaveTimerRef.current !== null) {
        clearTimeout(automaticSaveTimerRef.current);
        automaticSaveTimerRef.current = null;
      }
    }

    if (!outcome.operationSucceeded || outcome.partialFailure) {
      if (mountedRef.current && saveRevisionRef.current === revision) {
        reportSaveIssue(
          outcome.primarySaved
            ? 'safety-backup-failed'
            : 'primary-save-failed',
          outcome.primarySaved
            ? '근무표는 저장되었지만 안전 백업을 만들지 못했습니다. 다시 시도해야 합니다.'
            : '변경 내용을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
        );
      }
      // 본문 저장이 끝났다면 화면 상태도 같은 값으로 맞춥니다.
      // 안전 복사본 실패는 오류 배너로 알리되, 재실행 전후의 자료가 달라지지 않게 합니다.
      return { ...outcome, deviceBackupSaved: false };
    }

    let deviceBackupSaved = false;
    let resetMarkerCleared = true;
    if (savedData !== null) {
      try {
        deviceBackupSaved = await runtime.writeBackup(savedData);
      } catch {
        deviceBackupSaved = false;
      }
      if (
        savedData.settings.setupCompleted &&
        explicitResetMarkerPendingRef.current
      ) {
        try {
          await clearExplicitResetMarker(storageWriter);
          explicitResetMarkerPendingRef.current = false;
        } catch {
          resetMarkerCleared = false;
        }
      }
    }

    const followUpSaved = deviceBackupSaved && resetMarkerCleared;
    if (mountedRef.current && saveRevisionRef.current === revision) {
      if (followUpSaved) {
        reportSaveSuccess();
      } else {
        if (!deviceBackupSaved) {
          reportSaveIssue(
            'device-backup-failed',
            '근무표는 저장되었지만 기기 안전 백업 파일을 갱신하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
          );
        }
        if (!resetMarkerCleared) {
          reportSaveIssue(
            'reset-marker-cleanup-failed',
            '근무표는 저장되었지만 초기화 상태를 정리하지 못했습니다. 다시 시도해야 합니다.',
          );
        }
      }
      if (announceSuccess && outcome.announceSuccess && followUpSaved) {
        setSaveSuccessRevision((current) => current + 1);
      }
    }
    return withDeviceBackupResult(outcome, followUpSaved);
  }, [
    appDataWriter,
    recordSaveOutcome,
    reportSaveIssue,
    reportSaveSuccess,
    runtime,
    storageWriter,
  ]);

  const flushAutomaticSave = useCallback((generation: number) => {
    if (
      generation !== automaticSaveGenerationRef.current ||
      !readyRef.current ||
      !shouldFlushAutomaticSave(
        getAutomaticSaveContentSignature(dataRef.current),
        lastPersistedAutomaticSaveSignatureRef.current,
      )
    ) {
      return Promise.resolve(true);
    }
    return mutationCoordinator.run(async () => {
      try {
        if (
          generation !== automaticSaveGenerationRef.current ||
          !readyRef.current ||
          !shouldFlushAutomaticSave(
            getAutomaticSaveContentSignature(dataRef.current),
            lastPersistedAutomaticSaveSignatureRef.current,
          )
        ) {
          return true;
        }
        // 실행 시점의 최신 상태를 직렬화해 지연된 자동 저장이
        // 이후에 저장한 근무표를 덮어쓰지 않게 합니다.
        let sourceSnapshot: AppData | null = null;
        const result = await persistLatestCanonicalSnapshotAndSyncSleep({
          getLatestCanonicalSnapshot: () => {
            sourceSnapshot = dataRef.current;
            return canonicalizeAppData(sourceSnapshot);
          },
          persist: (canonicalData) => persistSnapshot(
            JSON.stringify(canonicalData),
            false,
            false,
            canonicalData,
          ),
          isPersistenceComplete: (persistence) =>
            persistence.operationSucceeded && !persistence.partialFailure,
          syncSleepReminders: syncSleepRemindersForSnapshot,
        });
        if (
          result.persistence.primarySaved &&
          sourceSnapshot !== null &&
          mountedRef.current &&
          readyRef.current
        ) {
          applyCanonicalSnapshotIfSourceIsCurrent({
            sourceSnapshot,
            canonicalSnapshot: result.canonicalSnapshot,
            getCurrentSnapshot: () => dataRef.current,
            applyCanonicalSnapshot: (canonicalSnapshot) => {
              automaticSaveAppliedCanonicalSnapshotRef.current = canonicalSnapshot;
              dataRef.current = canonicalSnapshot;
              setData(canonicalSnapshot);
            },
          });
        }
        if (result.sleepReminderSyncSucceeded === null) return false;
        const persistenceRevision = saveRevisionRef.current;
        const { sleepReminderSyncSucceeded } = result;
        if (!sleepReminderSyncSucceeded) {
          reportSleepReminderSaveFailure(persistenceRevision);
        }
        return sleepReminderSyncSucceeded;
      } catch {
        if (mountedRef.current) {
          reportSaveIssue(
            'invalid-data',
            '변경 내용의 형식이 올바르지 않아 저장하지 못했습니다.',
          );
        }
        return false;
      }
    });
  }, [
    mutationCoordinator,
    persistSnapshot,
    reportSaveIssue,
    reportSleepReminderSaveFailure,
    syncSleepRemindersForSnapshot,
  ]);

  useEffect(() => {
    if (!ready) return;
    if (
      shouldSkipAutomaticSaveForAppliedCanonicalSnapshot(
        data,
        automaticSaveAppliedCanonicalSnapshotRef.current,
      )
    ) {
      automaticSaveAppliedCanonicalSnapshotRef.current = null;
      return;
    }
    automaticSaveAppliedCanonicalSnapshotRef.current = null;
    if (
      !shouldFlushAutomaticSave(
        getAutomaticSaveContentSignature(data),
        lastPersistedAutomaticSaveSignatureRef.current,
      )
    ) {
      if (automaticSaveTimerRef.current !== null) {
        clearTimeout(automaticSaveTimerRef.current);
        automaticSaveTimerRef.current = null;
      }
      return;
    }
    const generation = automaticSaveGenerationRef.current;
    if (automaticSaveTimerRef.current !== null) {
      clearTimeout(automaticSaveTimerRef.current);
    }
    const timeout = setTimeout(() => {
      if (automaticSaveTimerRef.current === timeout) {
        automaticSaveTimerRef.current = null;
      }
      void flushAutomaticSave(generation);
    }, AUTOMATIC_SAVE_DEBOUNCE_MS);
    automaticSaveTimerRef.current = timeout;
    return () => {
      clearTimeout(timeout);
      if (automaticSaveTimerRef.current === timeout) {
        automaticSaveTimerRef.current = null;
      }
    };
  }, [data, flushAutomaticSave, ready]);

  useEffect(() => {
    if (!ready || appLifecycle.active) return;
    if (automaticSaveTimerRef.current !== null) {
      clearTimeout(automaticSaveTimerRef.current);
      automaticSaveTimerRef.current = null;
    }
    if (
      shouldFlushAutomaticSave(
        getAutomaticSaveContentSignature(dataRef.current),
        lastPersistedAutomaticSaveSignatureRef.current,
      )
    ) {
      void flushAutomaticSave(automaticSaveGenerationRef.current);
    }
  }, [appLifecycle.active, flushAutomaticSave, ready]);

  const retrySave = useCallback(async () => {
    if (!readyRef.current) return false;
    try {
      return await mutationCoordinator.run(async () => {
        const snapshot = canonicalizeAppData(dataRef.current);
        const persisted = await persistSnapshot(
          JSON.stringify(snapshot),
          true,
          false,
          snapshot,
        );
        if (!persisted.operationSucceeded || persisted.partialFailure) return false;
        const persistenceRevision = saveRevisionRef.current;
        updateData(() => snapshot);
        const sleepReminderSyncSucceeded = await syncSleepRemindersForSnapshot(
          snapshot,
          true,
        );
        if (!sleepReminderSyncSucceeded) {
          reportSleepReminderSaveFailure(persistenceRevision);
          automaticSaveGenerationRef.current += 1;
          return false;
        }
        if (mountedRef.current) setSaveSuccessRevision((current) => current + 1);
        return true;
      });
    } catch {
      if (mountedRef.current) {
        reportSaveIssue(
          'invalid-data',
          '변경 내용의 형식이 올바르지 않아 저장하지 못했습니다.',
        );
      }
      return false;
    }
  }, [
    mutationCoordinator,
    persistSnapshot,
    reportSaveIssue,
    reportSleepReminderSaveFailure,
    syncSleepRemindersForSnapshot,
    updateData,
  ]);

  const retrySleepReminderSync = useCallback(async () => {
    if (!readyRef.current) return false;
    return mutationCoordinator.run(async () => {
      const revision = saveRevisionRef.current;
      const synced = await syncSleepRemindersForSnapshot(
        dataRef.current,
        true,
      );
      if (!synced) {
        reportSleepReminderSaveFailure(revision);
      }
      return synced;
    });
  }, [
    mutationCoordinator,
    reportSleepReminderSaveFailure,
    syncSleepRemindersForSnapshot,
  ]);

  const replaceDataAndPersistDetailedInternal = useCallback(
    async (
      replacement: AppData | ((current: AppData) => AppData),
      announceSuccess = false,
      forceAlarmSync = false,
      afterPrimarySaveBeforeApply?: (snapshot: string) => Promise<void>,
      beforePrimarySave?: (snapshot: string) => Promise<void>,
    ): Promise<DataReplacementResult> => {
      const current = dataRef.current;
      const replacementData =
        typeof replacement === 'function' ? replacement(current) : replacement;
      if (Object.is(replacementData, current)) {
        return createDataReplacementResult({
          primarySaved: true,
          dataApplied: true,
          followUpSucceeded: true,
        });
      }
      let next: AppData;
      let snapshot: string;
      try {
        next = canonicalizeAppData(replacementData);
        snapshot = JSON.stringify(next);
      } catch {
        if (mountedRef.current) {
          reportSaveIssue(
            'invalid-data',
            '변경 내용의 형식이 올바르지 않아 저장하지 못했습니다.',
          );
        }
        return createDataReplacementResult({
          primarySaved: false,
          dataApplied: false,
          followUpSucceeded: false,
        });
      }

      if (shouldSkipEquivalentExplicitSave({
        currentSnapshot: JSON.stringify(canonicalizeAppData(current)),
        nextSnapshot: snapshot,
        forceAlarmSync,
        hasPersistenceCallback:
          beforePrimarySave !== undefined ||
          afterPrimarySaveBeforeApply !== undefined,
        hasPendingSaveRetry: Boolean(
          saveOutcomeRef.current?.issues.some(
            (issue) => issue.retryAction === 'retry-save',
          ),
        ),
      })) {
        return createDataReplacementResult({
          primarySaved: true,
          dataApplied: true,
          followUpSucceeded: true,
        });
      }

      if (beforePrimarySave) {
        try {
          await beforePrimarySave(snapshot);
        } catch {
          return createDataReplacementResult({
            primarySaved: false,
            dataApplied: false,
            followUpSucceeded: false,
          });
        }
      }

      automaticSaveGenerationRef.current += 1;
      const persisted = await persistSnapshot(snapshot, true, false, next);
      if (!persisted.primarySaved) {
        return createDataReplacementResult({
          primarySaved: false,
          dataApplied: false,
          followUpSucceeded: false,
        });
      }
      let preApplyFollowUpSucceeded = true;
      if (afterPrimarySaveBeforeApply) {
        try {
          await afterPrimarySaveBeforeApply(snapshot);
        } catch {
          preApplyFollowUpSucceeded = false;
        }
      }
      const dataApplied = updateData(() => next);
      if (!dataApplied) {
        return createDataReplacementResult({
          primarySaved: true,
          dataApplied: false,
          followUpSucceeded: false,
        });
      }

      const alarmSyncRequired = shouldSyncAlarmsAfterReplacement({
        current,
        next,
        failedSignature: failedAlarmSyncSignatureRef.current,
        force: forceAlarmSync,
      });
      const sleepReminderSyncRequired =
        shouldSyncSleepRemindersAfterReplacement({
          current,
          next,
          lastSyncedSignature: lastSleepReminderSyncSignatureRef.current,
          failedSignature: failedSleepReminderSyncSignatureRef.current,
          force: forceAlarmSync,
        });
      const sleepReminderSyncSucceeded =
        !sleepReminderSyncRequired || await syncSleepRemindersForSnapshot(next);
      const alarmSyncSucceeded =
        !alarmSyncRequired || await syncAlarmsForSnapshot(next);
      const persistenceFollowUpSucceeded =
        persisted.lastKnownGoodSaved && persisted.deviceBackupSaved;
      if (!sleepReminderSyncSucceeded) {
        reportSleepReminderSaveFailure(saveRevisionRef.current);
      }
      if (!preApplyFollowUpSucceeded) {
        reportSaveIssue(
          'reset-marker-cleanup-failed',
          '자료는 저장되었지만 초기 설정 임시 상태를 정리하지 못했습니다. 다시 시도해야 합니다.',
        );
      }
      const outcome = createDataReplacementResult({
        primarySaved: true,
        dataApplied: true,
        followUpSucceeded:
          preApplyFollowUpSucceeded &&
          persistenceFollowUpSucceeded &&
          alarmSyncSucceeded &&
          sleepReminderSyncSucceeded,
      });

      if (outcome.partialFailure) {
        // 상태 갱신으로 이미 예약된 자동 저장이 부분 실패 오류를
        // 곧바로 성공 상태로 덮어쓰지 않게 합니다.
        automaticSaveGenerationRef.current += 1;
      }

      if (announceSuccess && outcome.announceSuccess && mountedRef.current) {
        setSaveSuccessRevision((value) => value + 1);
      }
      return outcome;
    },
    [
      persistSnapshot,
      reportSaveIssue,
      reportSleepReminderSaveFailure,
      syncAlarmsForSnapshot,
      syncSleepRemindersForSnapshot,
      updateData,
    ],
  );

  const replaceDataAndPersistInternal = useCallback(
    async (
      replacement: AppData | ((current: AppData) => AppData),
      announceSuccess = false,
      forceAlarmSync = false,
    ) => {
      const result = await replaceDataAndPersistDetailedInternal(
        replacement,
        announceSuccess,
        forceAlarmSync,
      );
      return result.operationSucceeded;
    },
    [replaceDataAndPersistDetailedInternal],
  );

  const replaceDataAndPersist = useCallback(
    (
      replacement: AppData | ((current: AppData) => AppData),
      announceSuccess = false,
    ) => mutationCoordinator.run(() =>
      replaceDataAndPersistInternal(replacement, announceSuccess),
    ),
    [mutationCoordinator, replaceDataAndPersistInternal],
  );

  const alarmScheduleSignature = useMemo(
    () => getAlarmScheduleSignature(data),
    [data],
  );

  useEffect(() => {
    if (!ready) return;
    // ready가 된 시점의 자료는 loadData가 영속 저장에서 읽었거나 복구 쓰기까지
    // 마친 스냅샷입니다. 데이터 변경 signature에는 반응하지 않고 최초 로드·복구
    // 계획만 즉시 확인하여, 이후 변경은 반드시 저장 flush 뒤에 동기화되게 합니다.
    void mutationCoordinator.run(() =>
      syncSleepRemindersForSnapshot(dataRef.current),
    );
  }, [mutationCoordinator, ready, syncSleepRemindersForSnapshot]);

  useEffect(() => {
    if (!ready) {
      lastSleepReminderLifecycleTransitionRef.current =
        appLifecycle.transitionId;
      return;
    }
    if (
      !appLifecycle.active ||
      appLifecycle.transitionId <=
        lastSleepReminderLifecycleTransitionRef.current
    ) {
      return;
    }
    lastSleepReminderLifecycleTransitionRef.current =
      appLifecycle.transitionId;
    void mutationCoordinator.run(() =>
      syncSleepRemindersForSnapshot(dataRef.current),
    );
  }, [
    appLifecycle.active,
    appLifecycle.transitionId,
    mutationCoordinator,
    ready,
    syncSleepRemindersForSnapshot,
  ]);

  const getShiftForDate = useCallback(
    (dateKey: string) => resolveShiftFromData(data, dateKey),
    [data],
  );

  const getNoteForDate = useCallback(
    (dateKey: string) => selectNoteForDate(data, dateKey),
    [data],
  );

  const saveDay = useCallback(
    async (
      dateKey: string,
      selection: DaySelection,
      note: string,
      timeOverride: Pick<DayTimeOverride, 'startMinutes' | 'endMinutes'> | null = null,
      dayException: DayExceptionType | null = null,
      alarmOverride?: DayAlarmOverride | null,
    ) => {
      if (!readyRef.current) return false;
      if (!isValidDateKey(dateKey)) return false;
      if (!isScheduleDate(dataRef.current, dateKey)) return false;
      if (dayException !== null && !DAY_EXCEPTION_TYPES.includes(dayException)) return false;
      if (!isValidDayTimeOverride(timeOverride)) return false;
      if (
        alarmOverride !== undefined &&
        alarmOverride !== null &&
        !isValidDayAlarmOverride(alarmOverride)
      ) {
        return false;
      }

      let applied = false;
      let scheduleEnforcement: EnforcedScheduleSafety | null = null;
      const saved = await replaceDataAndPersist((current) => {
        const next = tryApplyDayEditValues(current, dateKey, {
          selection,
          note,
          timeOverride,
          dayException,
          alarmOverride,
        });
        if (!next) return current;
        applied = true;
        scheduleEnforcement = enforceAppDataScheduleSafety(next, {
          focusDateKeys: [dateKey],
        });
        return scheduleEnforcement.data ?? current;
      }, true);
      return applied && finalizeScheduleMutation(scheduleEnforcement, saved);
    },
    [finalizeScheduleMutation, replaceDataAndPersist],
  );

  const saveDays = useCallback(
    async (dateKeys: readonly string[], change: BulkDayChange) => {
      if (!readyRef.current) return false;
      let applied = false;
      let scheduleEnforcement: EnforcedScheduleSafety | null = null;
      const saved = await replaceDataAndPersist((current) => {
        const next = applyBulkDayChange(current, dateKeys, change);
        if (!next) return current;
        applied = true;
        scheduleEnforcement = enforceAppDataScheduleSafety(
          pruneInvalidDayAlarmOverrides(next),
          { focusDateKeys: dateKeys },
        );
        return scheduleEnforcement.data ?? current;
      }, true);
      return applied && finalizeScheduleMutation(scheduleEnforcement, saved);
    },
    [finalizeScheduleMutation, replaceDataAndPersist],
  );

  const updatePatternDetailed = useCallback(
    async (
      pattern: RotationPattern,
      shiftTypePatches: Record<string, Partial<ShiftType>> = {},
      options: UpdatePatternOptions = {},
    ): Promise<UpdatePatternResult> => {
      const failed = (): UpdatePatternResult => ({
        ...createDataReplacementResult({
          primarySaved: false,
          dataApplied: false,
          followUpSucceeded: false,
        }),
        saveOutcome: saveOutcomeRef.current,
      });
      if (pattern.shiftTypeIds.length === 0) return failed();
      if (
        !isValidDateKey(pattern.anchorDate) ||
        !isValidDateKey(pattern.scheduleStartDate ?? pattern.anchorDate)
      ) {
        return failed();
      }
      const clearFrom = options.clearFutureScheduleOverridesFrom;
      if (clearFrom !== undefined && !isValidDateKey(clearFrom)) return failed();
      if (
        !hasOnlyKnownShiftTypeIds(
          dataRef.current.shiftTypes,
          Object.keys(shiftTypePatches),
        )
      ) {
        return failed();
      }
      let scheduleEnforcement: EnforcedScheduleSafety | null = null;
      const result = await mutationCoordinator.run(() =>
        replaceDataAndPersistDetailedInternal(
          (current) => {
            const candidate = applyPatternSettings(
              current,
              pattern,
              shiftTypePatches,
              clearFrom,
            );
            scheduleEnforcement = enforceAppDataScheduleSafety(candidate);
            return scheduleEnforcement.data ?? current;
          },
          true,
        ),
      );
      const enforced = scheduleEnforcement as EnforcedScheduleSafety | null;
      if (enforced === null || enforced.data === null) {
        reportInvalidWorkSchedule();
        return failed();
      }
      if (result.operationSucceeded) reportUnsafeAlarmSchedule(enforced);
      return { ...result, saveOutcome: saveOutcomeRef.current };
    },
    [
      mutationCoordinator,
      replaceDataAndPersistDetailedInternal,
      reportInvalidWorkSchedule,
      reportUnsafeAlarmSchedule,
    ],
  );

  const updatePattern = useCallback(
    async (
      pattern: RotationPattern,
      shiftTypePatches: Record<string, Partial<ShiftType>> = {},
      options: UpdatePatternOptions = {},
    ) => (await updatePatternDetailed(pattern, shiftTypePatches, options)).operationSucceeded,
    [updatePatternDetailed],
  );

  const updateShiftTypes = useCallback(
    async (
      patches: Record<string, Partial<ShiftType>>,
      workRoutineProfiles?: WorkRoutineProfiles,
    ) => {
      const shiftTypeIds = new Set(Object.keys(patches));
      if (!readyRef.current) return false;
      if (
        workRoutineProfiles &&
        (!isValidWorkRoutineTiming(workRoutineProfiles.day) ||
          !isValidWorkRoutineTiming(workRoutineProfiles.evening) ||
          !isValidWorkRoutineTiming(workRoutineProfiles.night))
      ) {
        return false;
      }
      if (!hasOnlyKnownShiftTypeIds(dataRef.current.shiftTypes, shiftTypeIds)) {
        return false;
      }
      if (shiftTypeIds.size === 0 && !workRoutineProfiles) return true;
      let compatible = true;
      let scheduleEnforcement: EnforcedScheduleSafety | null = null;
      const saved = await replaceDataAndPersist((current) => {
        const result = applyShiftSettings(current, patches, workRoutineProfiles);
        compatible = result.compatible;
        if (!result.compatible) return current;
        scheduleEnforcement = enforceAppDataScheduleSafety(result.data);
        return scheduleEnforcement.data ?? current;
      }, true);
      return compatible && finalizeScheduleMutation(scheduleEnforcement, saved);
    },
    [finalizeScheduleMutation, replaceDataAndPersist],
  );

  const setThemeMode = useCallback(
    (themeMode: ThemeMode) => {
      void replaceDataAndPersist((current) => applyThemeMode(current, themeMode));
    },
    [replaceDataAndPersist],
  );

  const updatePayrollSettings = useCallback(
    async (settings: PayrollSettings) => {
      if (!readyRef.current) return false;
      let valid = true;
      const saved = await replaceDataAndPersist((current) => {
        const result = applyPayrollSettings(current, settings);
        valid = result.valid;
        return result.data;
      });
      return valid && saved;
    },
    [replaceDataAndPersist],
  );

  const dismissPlayUpdate = useCallback(
    async (versionCode: number) => {
      if (!readyRef.current) return false;
      let valid = true;
      const saved = await replaceDataAndPersist((current) => {
        const next = applyDismissedUpdateVersionCode(current, versionCode);
        valid = next !== null;
        return next ?? current;
      });
      return valid && saved;
    },
    [replaceDataAndPersist],
  );

  const toggleWidgetDisplayOption = useCallback(
    async (option: keyof WidgetDisplayOptions) => {
      let validSelection = true;
      const saved = await replaceDataAndPersist((current) => {
        const result = toggleWidgetDisplaySelection(current, option);
        validSelection = result.validSelection;
        return result.data;
      });
      return validSelection && saved;
    },
    [replaceDataAndPersist],
  );

  const completeSetup = useCallback(
    async (pattern?: RotationPattern) => {
      if (pattern && pattern.shiftTypeIds.length === 0) return false;
      let scheduleEnforcement: EnforcedScheduleSafety | null = null;
      const saved = await replaceDataAndPersist(
        (current) => {
          const candidate = applySetupCompletion(current, pattern);
          scheduleEnforcement = enforceAppDataScheduleSafety(candidate);
          return scheduleEnforcement.data ?? current;
        },
        true,
      );
      return finalizeScheduleMutation(scheduleEnforcement, saved);
    },
    [finalizeScheduleMutation, replaceDataAndPersist],
  );

  const completeInitialSetup = useCallback(
    async ({ pattern, notificationsEnabled, shiftTypePatches }: InitialSetupInput) => {
      if (pattern.shiftTypeIds.length === 0) return false;
      if (
        !isValidDateKey(pattern.anchorDate) ||
        !isValidDateKey(pattern.scheduleStartDate ?? pattern.anchorDate)
      ) {
        return false;
      }
      if (
        !hasOnlyKnownShiftTypeIds(
          dataRef.current.shiftTypes,
          Object.keys(shiftTypePatches),
        )
      ) {
        return false;
      }

      let scheduleEnforcement: EnforcedScheduleSafety | null = null;
      const saved = await replaceDataAndPersist(
        (current) => {
          const candidate = applyInitialSetupValues(current, {
            pattern,
            notificationsEnabled,
            shiftTypePatches,
          });
          scheduleEnforcement = enforceAppDataScheduleSafety(candidate);
          return scheduleEnforcement.data ?? current;
        },
        true,
      );
      return finalizeScheduleMutation(scheduleEnforcement, saved);
    },
    [finalizeScheduleMutation, replaceDataAndPersist],
  );

  const getAlarmStatus = useCallback(() => runtime.readAlarmStatus(), [runtime]);

  const requestAlarmAccess = useCallback(async () => {
    const status = await runtime.requestAlarmPermissions();
    return (
      status.supported &&
      status.exactAlarmAllowed &&
      status.fullScreenAllowed &&
      status.notificationsAllowed
    );
  }, [runtime]);

  const resyncAlarms = useCallback(async (force = false) => {
    if (!readyRef.current) return false;
    if (alarmResumeSyncRef.current) return alarmResumeSyncRef.current;

    const task = mutationCoordinator.run(async () => {
      const snapshot = dataRef.current;
      const signature = getAlarmScheduleSignature(snapshot);
      const enforcedScheduleSafety = enforceAppDataScheduleSafety(snapshot, {
        mode: 'ingress',
      });
      const syncSnapshot = enforcedScheduleSafety.data ?? snapshot;
      const scheduleSafetyBlocked = !enforcedScheduleSafety.safety.canEnableAlarms;
      if (scheduleSafetyBlocked) reportUnsafeAlarmSchedule(enforcedScheduleSafety);
      const retryPending = failedAlarmSyncSignatureRef.current === signature;
      const scheduleChanged =
        lastAlarmSyncSignatureRef.current !== null &&
        lastAlarmSyncSignatureRef.current !== signature;
      const syncCheckNow = new Date();
      let recentPlan: readonly AlarmPyoAlarmPlan[] | null = null;
      let repairNeeded = false;
      let alarmAccessMissing = false;
      let automaticRepairBlocked = false;
      if (mountedRef.current) {
        setAlarmAutoCheckState({ checkedAt: null, status: 'checking' });
      }
      try {
        const result = await runAlarmSyncCheck({
          skipStatusCheck:
            !scheduleSafetyBlocked &&
            !force &&
            !retryPending &&
            !scheduleChanged &&
            canSkipDisabledAlarmStatusCheck({
              notificationsEnabled: syncSnapshot.settings.notificationsEnabled,
              storedScheduledCount: syncSnapshot.settings.scheduledNotificationCount,
              lastSyncAt: syncSnapshot.settings.lastNotificationSyncAt,
            }),
          readStatus: () => runtime.readAlarmStatus(),
          createPlan: () => buildAlarmPyoAlarmPlan(
            syncSnapshot,
            (dateKey) => resolveShiftFromData(syncSnapshot, dateKey),
            {
              now: syncCheckNow,
              maxAlarms: MAX_NATIVE_SCHEDULED_ALARMS,
            },
          ),
          createSyncPlan: () => buildAlarmPyoAlarmPlan(
            syncSnapshot,
            (dateKey) => resolveShiftFromData(syncSnapshot, dateKey),
            { now: syncCheckNow },
          ),
          shouldSynchronize: (status, plan) => {
            alarmAccessMissing =
              status.supported &&
              (
                !status.exactAlarmAllowed ||
                !status.fullScreenAllowed ||
                !status.notificationsAllowed
              );
            automaticRepairBlocked = shouldBlockAutomaticAlarmRepair({
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              notificationsEnabled: syncSnapshot.settings.notificationsEnabled,
              supported: status.supported,
            });
            const countSynchronized = isAlarmPyoAlarmScheduleSynchronized({
              actualScheduledCount: status.scheduledCount,
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              plannedAlarmCount: plan.length,
            });
            const contentSynchronized = isAlarmPyoAlarmPlanContentSynchronized({
              actualScheduledAlarms: status.scheduledAlarms,
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              plannedAlarms: plan,
            });
            repairNeeded =
              !automaticRepairBlocked &&
              (!countSynchronized || !contentSynchronized);
            if (automaticRepairBlocked) return false;
            if (
              !contentSynchronized &&
              !force &&
              !retryPending &&
              !scheduleChanged
            ) {
              recentPlan ??= buildAlarmPyoAlarmPlan(
                syncSnapshot,
                (dateKey) => resolveShiftFromData(syncSnapshot, dateKey),
                {
                  now: new Date(
                    syncCheckNow.getTime() - ALARM_DELIVERY_RETRY_GRACE_MS,
                  ),
                  maxAlarms: MAX_NATIVE_SCHEDULED_ALARMS,
                },
              );
              if (canPreserveActiveAlarmDeliveryRetry({
                actualScheduledAlarms: status.scheduledAlarms,
                actualScheduledCount: status.scheduledCount,
                exactAlarmAllowed: status.exactAlarmAllowed,
                force,
                notificationsAllowed: status.notificationsAllowed,
                now: syncCheckNow,
                plannedAlarms: plan,
                recentPlannedAlarms: recentPlan,
                retryPending,
                scheduleChanged,
              })) {
                return false;
              }
            }
            return shouldSyncAlarmPyoAlarmSnapshot({
              force,
              retryPending,
              scheduleChanged: scheduleChanged || !contentSynchronized,
              actualScheduledCount: status.scheduledCount,
              exactAlarmAllowed: status.exactAlarmAllowed,
              notificationsAllowed: status.notificationsAllowed,
              plannedAlarmCount: plan.length,
              storedScheduledCount: syncSnapshot.settings.scheduledNotificationCount,
              lastSyncAt: syncSnapshot.settings.lastNotificationSyncAt,
              now: syncCheckNow,
              previousTimeZoneOffset: lastTimeZoneOffsetRef.current,
            });
          },
          synchronize: (plan) => syncAlarmsForSnapshot(
            snapshot,
            plan,
            buildAlarmPyoAlarmSyncMetadata(syncCheckNow),
          ),
        });
        if (!result.success) {
          if (mountedRef.current) {
            setAlarmAutoCheckState({
              checkedAt: syncCheckNow.toISOString(),
              status: 'error',
            });
          }
          return false;
        }

        if (!result.synchronized) {
          lastTimeZoneOffsetRef.current = new Date().getTimezoneOffset();
          lastAlarmSyncSignatureRef.current = signature;
          if (failedAlarmSyncSignatureRef.current === signature) {
            failedAlarmSyncSignatureRef.current = null;
          }
          if (
            automaticRepairBlocked &&
            result.status &&
            syncSnapshot.settings.scheduledNotificationCount !==
              result.status.scheduledCount
          ) {
            updateData((current) => {
              if (getAlarmScheduleSignature(current) !== signature) return current;
              return withAlarmRuntimeState(
                current,
                result.status!.scheduledCount,
                syncCheckNow.toISOString(),
              );
            });
          }
        }
        if (mountedRef.current) {
          setAlarmAutoCheckState({
            checkedAt: syncCheckNow.toISOString(),
            status: resolveCompletedAlarmAutoCheckStatus({
              accessMissing: alarmAccessMissing,
              repairNeeded,
              success: true,
              synchronized: result.synchronized,
            }),
          });
        }
        return true;
      } catch {
        failedAlarmSyncSignatureRef.current = signature;
        if (mountedRef.current) {
          setAlarmAutoCheckState({
            checkedAt: syncCheckNow.toISOString(),
            status: 'error',
          });
        }
        reportAlarmSyncFailure(syncSnapshot.settings.notificationsEnabled);
        return false;
      }
    });
    alarmResumeSyncRef.current = task;
    try {
      return await task;
    } finally {
      if (alarmResumeSyncRef.current === task) alarmResumeSyncRef.current = null;
    }
  }, [
    mutationCoordinator,
    reportAlarmSyncFailure,
    reportUnsafeAlarmSchedule,
    runtime,
    syncAlarmsForSnapshot,
    updateData,
  ]);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => {
      const signature = getAlarmScheduleSignature(dataRef.current);
      if (
        lastAlarmSyncSignatureRef.current === signature &&
        failedAlarmSyncSignatureRef.current !== signature
      ) {
        return;
      }
      void resyncAlarms();
    }, 500);
    return () => clearTimeout(timeout);
  }, [alarmScheduleSignature, ready, resyncAlarms]);

  const enableAlarms = useCallback(async () => {
    const scheduleSafety = analyzeAppDataScheduleSafety(dataRef.current);
    if (!scheduleSafety.canEnableAlarms) {
      reportAlarmEnableBlocked();
      return false;
    }
    const status = await runtime.requestAlarmPermissions();
    if (!status.supported) return false;

    // 사용자가 알람을 켜려는 의사와 Android 전달 권한의 준비 상태는 별개입니다.
    // 설정 화면에서 돌아오기 전의 권한 응답이 false여도 저장 실패로 표시하지 않고,
    // 알람 화면의 상태 카드가 다음으로 필요한 권한을 이어서 안내합니다.
    return mutationCoordinator.run(async () => {
      const current = dataRef.current;
      const candidate = {
        ...current,
        settings: { ...current.settings, notificationsEnabled: true },
      };
      const latestSafety = analyzeAppDataScheduleSafety(candidate);
      if (!latestSafety.canEnableAlarms) {
        const failClosed = enforceAppDataScheduleSafety(current, { mode: 'ingress' });
        if (failClosed.alarmsDisabled && failClosed.data) {
          await replaceDataAndPersistInternal(failClosed.data, false, true);
        }
        reportAlarmEnableBlocked();
        return false;
      }
      const saved = await replaceDataAndPersistInternal(candidate);
      if (saved) {
        clearReportedSaveIssue('invalid-work-schedule');
        clearReportedSaveIssue('unsafe-alarm-schedule');
      }
      return saved;
    });
  }, [
    clearReportedSaveIssue,
    mutationCoordinator,
    replaceDataAndPersistInternal,
    reportAlarmEnableBlocked,
    runtime,
  ]);

  const disableAlarms = useCallback(async () => {
    return mutationCoordinator.run(() => replaceDataAndPersistInternal(
      (current) => ({
        ...current,
        settings: {
          ...current.settings,
          notificationsEnabled: false,
          ...markAlarmDisableSyncPending(current.settings),
        },
      }),
      false,
      true,
    ));
  }, [mutationCoordinator, replaceDataAndPersistInternal]);

  const setSleepReminderEnabled = useCallback(
    async (enabled: boolean) => {
      const saved = await replaceDataAndPersist((current) => {
        if (current.settings.sleepReminderEnabled === enabled) return current;
        return {
          ...current,
          settings: {
            ...current.settings,
            sleepReminderEnabled: enabled,
          },
        };
      });
      if (!saved) return false;

      if (enabled) {
        await runtime.requestSleepReminderPermission().catch(() => undefined);
      }
      // 알림 권한이 없어도 설정 저장은 성공입니다. 권한이 준비되면
      // 앱 복귀 동기화가 같은 14일 계획을 다시 전달합니다.
      await syncSleepRemindersForSnapshot(dataRef.current, true);
      return true;
    },
    [replaceDataAndPersist, runtime, syncSleepRemindersForSnapshot],
  );

  const sendTestAlarm = useCallback(async () => {
    const status = await runtime.requestAlarmPermissions();
    if (
      !status.supported ||
      !status.exactAlarmAllowed ||
      !status.fullScreenAllowed ||
      !status.notificationsAllowed
    ) {
      return false;
    }
    await scheduleAlarmPyoTestAlarm(5);
    return true;
  }, [runtime]);

  const exportData = useCallback(() => {
    if (!readyRef.current) throw new Error('근무표를 모두 불러온 뒤 내보낼 수 있습니다.');
    const backup = exportAppDataToJson(dataRef.current);
    getCheckedBackupContentsByteSize(backup);
    return backup;
  }, []);
  const previewImportData = useCallback((raw: string) => {
    getCheckedBackupContentsByteSize(raw);
    return previewAppDataImport(raw);
  }, []);
  const exportSharedWorkSettings = useCallback(() => {
    if (!readyRef.current) throw new Error('근무표를 모두 불러온 뒤 공유할 수 있습니다.');
    return exportWorkSettingsToJson(dataRef.current);
  }, []);
  const previewSharedWorkSettings = useCallback(
    (raw: string) => previewWorkSettingsImport(raw),
    [],
  );

  const saveUserPattern = useCallback(
    async (input: UserPatternInput): Promise<PatternVaultSaveResult> => {
      if (!readyRef.current) {
        return { status: 'failure', reason: 'not-ready' };
      }
      const now = new Date();
      const id = input.id ?? createUserPatternId(
        now,
        Math.random().toString(36).slice(2),
      );
      const mutationRef: {
        current: ReturnType<typeof saveUserPatternMutation> | null;
      } = { current: null };
      const saved = await replaceDataAndPersist((current) => {
        mutationRef.current = saveUserPatternMutation(
          current,
          { ...input, id },
          now,
        );
        return mutationRef.current.status === 'failure'
          ? current
          : mutationRef.current.data;
      });
      const mutation = mutationRef.current;
      if (mutation === null || mutation.status === 'failure') {
        return {
          status: 'failure',
          reason: mutation?.reason ?? 'invalid-pattern',
        };
      }
      if (mutation.status === 'unchanged') {
        return { status: 'unchanged', patternId: mutation.patternId };
      }
      if (!saved) return { status: 'failure', reason: 'storage-failed' };
      return {
        status: 'saved',
        patternId: mutation.patternId,
        created: mutation.created,
      };
    },
    [replaceDataAndPersist],
  );

  const importValidatedPattern = useCallback(
    async (
      descriptor: ValidatedPatternDescriptor,
    ): Promise<PatternVaultSaveResult> => {
      if (!readyRef.current) {
        return { status: 'failure', reason: 'not-ready' };
      }
      const now = new Date();
      const mutationRef: {
        current: ReturnType<typeof importValidatedPatternMutation> | null;
      } = { current: null };
      const saved = await replaceDataAndPersist((current) => {
        mutationRef.current = importValidatedPatternMutation(
          current,
          descriptor,
          now,
        );
        return mutationRef.current.status === 'failure'
          ? current
          : mutationRef.current.data;
      });
      const mutation = mutationRef.current;
      if (mutation === null || mutation.status === 'failure') {
        return {
          status: 'failure',
          reason: mutation?.reason ?? 'invalid-pattern',
        };
      }
      if (mutation.status === 'unchanged') {
        return { status: 'unchanged', patternId: mutation.patternId };
      }
      if (!saved) return { status: 'failure', reason: 'storage-failed' };
      return {
        status: 'saved',
        patternId: mutation.patternId,
        created: mutation.created,
      };
    },
    [replaceDataAndPersist],
  );

  const deletePattern = useCallback(
    async (patternId: string) => {
      if (!readyRef.current) {
        return { status: 'failure', reason: 'not-ready' } as const;
      }
      const mutationRef: {
        current: ReturnType<typeof deletePatternMutation> | null;
      } = { current: null };
      const saved = await replaceDataAndPersist((current) => {
        mutationRef.current = deletePatternMutation(current, patternId);
        return mutationRef.current.status === 'deleted'
          ? mutationRef.current.data
          : current;
      });
      const mutation = mutationRef.current;
      if (mutation === null) {
        return { status: 'not-found', patternId } as const;
      }
      if (mutation.status === 'failure') {
        return { status: 'failure', reason: mutation.reason } as const;
      }
      if (mutation.status === 'not-found') {
        return { status: 'not-found', patternId } as const;
      }
      if (!saved) {
        return { status: 'failure', reason: 'storage-failed' } as const;
      }
      return { status: 'deleted', patternId } as const;
    },
    [replaceDataAndPersist],
  );

  const previewPatternApplication = useCallback(
    (input: PatternApplicationInput) => {
      if (!readyRef.current) {
        return { status: 'failure', reason: 'not-ready' } as const;
      }
      return previewPatternApplicationForData(dataRef.current, input);
    },
    [],
  );

  const createBackupInternal = useCallback(async () => {
    if (!readyRef.current) throw new Error('근무표를 모두 불러온 뒤 백업할 수 있습니다.');
    try {
      const backup = await writeAutomaticBackup(storageWriter, dataRef.current);
      const deviceBackupSaved = await runtime.writeBackup(dataRef.current);
      if (!deviceBackupSaved) {
        throw new Error('기기 안전 백업 파일을 만들지 못했습니다.');
      }
      return backup;
    } catch {
      // 사용자가 시작한 백업은 호출한 화면에서 작업 맥락에 맞게 안내합니다.
      throw new Error('안전 백업을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.');
    }
  }, [runtime, storageWriter]);

  const createBackup = useCallback(() => {
    if (backupRequestRef.current !== null) return backupRequestRef.current;

    const running = mutationCoordinator.run(() => createBackupInternal());
    const tracked = running.finally(() => {
      if (backupRequestRef.current === tracked) {
        backupRequestRef.current = null;
      }
    });
    backupRequestRef.current = tracked;
    return tracked;
  }, [createBackupInternal, mutationCoordinator]);

  const persistPatternTransaction = useCallback(
    async (
      current: AppData,
      candidate: AppData,
    ): Promise<
      | { status: 'success' }
      | {
          status: 'failure';
          reason:
            | 'backup-failed'
            | 'save-failed'
            | 'sync-failed'
            | 'rollback-failed';
          rolledBack: boolean;
        }
    > => {
      const candidateAlarmSignature = getAlarmScheduleSignature(candidate);
      const candidateSleepSignature = getSleepReminderScheduleSignature(candidate);
      return runPatternPersistenceTransaction({
        createSafetyBackup: async () => {
          await createBackupInternal();
        },
        persistCandidate: () => replaceDataAndPersistDetailedInternal(
          candidate,
          true,
          true,
        ),
        candidateSyncFailed: () =>
          failedAlarmSyncSignatureRef.current === candidateAlarmSignature ||
          failedSleepReminderSyncSignatureRef.current === candidateSleepSignature,
        persistRollback: () => replaceDataAndPersistDetailedInternal(
          current,
          false,
          true,
        ),
      });
    },
    [createBackupInternal, replaceDataAndPersistDetailedInternal],
  );

  const applyPatternFromVault = useCallback(
    async (input: PatternApplicationInput): Promise<PatternApplyResult> => {
      if (!readyRef.current) {
        return { status: 'failure', reason: 'not-ready', rolledBack: false };
      }
      return mutationCoordinator.run(async () => {
        const current = dataRef.current;
        const now = new Date();
        const historyId = `apply-${now.getTime().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 10)}`;
        const mutation = buildPatternApplicationMutation(
          current,
          input,
          now,
          historyId,
        );
        if (mutation.status === 'failure') {
          return {
            status: 'failure',
            reason: mutation.reason,
            rolledBack: false,
          };
        }
        const scheduleEnforcement = enforceAppDataScheduleSafety(mutation.data);
        if (
          scheduleEnforcement.data === null ||
          scheduleEnforcement.alarmsDisabled
        ) {
          reportInvalidWorkSchedule();
          return {
            status: 'failure',
            reason: 'invalid-schedule',
            rolledBack: false,
          };
        }
        const persisted = await persistPatternTransaction(
          current,
          scheduleEnforcement.data,
        );
        if (persisted.status === 'failure') return persisted;
        return {
          status: 'success',
          patternId: input.patternId,
          historyId,
          clearedOverrideDateKeys: mutation.preview.clearedOverrideDateKeys,
        };
      });
    },
    [
      mutationCoordinator,
      persistPatternTransaction,
      reportInvalidWorkSchedule,
    ],
  );

  const rollbackLastPatternApplication = useCallback(
    async (): Promise<PatternRollbackResult> => {
      if (!readyRef.current) {
        return { status: 'failure', reason: 'not-ready', rolledBack: false };
      }
      return mutationCoordinator.run(async () => {
        const current = dataRef.current;
        const mutation = buildPatternRollbackMutation(current);
        if (mutation.status === 'nothing-to-rollback') return mutation;
        if (mutation.status === 'failure') {
          return {
            status: 'failure',
            reason: mutation.reason,
            rolledBack: false,
          };
        }
        const scheduleEnforcement = enforceAppDataScheduleSafety(mutation.data);
        if (
          scheduleEnforcement.data === null ||
          scheduleEnforcement.alarmsDisabled
        ) {
          reportInvalidWorkSchedule();
          return {
            status: 'failure',
            reason: 'invalid-schedule',
            rolledBack: false,
          };
        }
        const persisted = await persistPatternTransaction(
          current,
          scheduleEnforcement.data,
        );
        if (persisted.status === 'failure') return persisted;
        return { status: 'success', historyId: mutation.history.id };
      });
    },
    [
      mutationCoordinator,
      persistPatternTransaction,
      reportInvalidWorkSchedule,
    ],
  );

  const applySharedWorkSettings = useCallback(
    async (preview: WorkSettingsSharePreview) => {
      if (!readyRef.current) {
        return { success: false, reason: 'not-ready' } as const;
      }
      const scheduleEnforcementRef: { current: EnforcedScheduleSafety | null } = {
        current: null,
      };
      const result = await mutationCoordinator.run(() =>
        applyWorkSettingsTransaction({
          current: dataRef.current,
          preview,
          // 개인 일정에 영향을 주는 작업이므로 적용 직전의 전체 데이터를 안전 백업합니다.
          createSafetyBackup: createBackupInternal,
          prepare: (next) => {
            scheduleEnforcementRef.current = enforceAppDataScheduleSafety(
              pruneInvalidDayAlarmOverrides(next),
            );
            return scheduleEnforcementRef.current.data;
          },
          save: (next) => replaceDataAndPersistInternal(next, false, true),
        }),
      );
      const scheduleEnforcement = scheduleEnforcementRef.current;
      if (scheduleEnforcement?.data === null) reportInvalidWorkSchedule();
      if (result.success && scheduleEnforcement !== null) {
        reportUnsafeAlarmSchedule(scheduleEnforcement);
      }
      return result;
    },
    [
      createBackupInternal,
      mutationCoordinator,
      replaceDataAndPersistInternal,
      reportInvalidWorkSchedule,
      reportUnsafeAlarmSchedule,
    ],
  );

  const importData = useCallback(
    async (preview: AppDataImportPreview) => {
      if (!readyRef.current) return false;
      let imported: AppData;
      try {
        // 예약 개수와 동기화 시각은 백업을 만든 휴대폰의 상태이므로 가져오지 않습니다.
        imported = withoutAlarmRuntimeState(appDataFromImportPreview(preview));
      } catch {
        throw new Error('가져올 근무표를 다시 확인해야 합니다.');
      }

      const scheduleEnforcement = enforceAppDataScheduleSafety(imported, {
        mode: 'ingress',
      });
      imported = scheduleEnforcement.data ?? imported;

      const importedSuccessfully = await mutationCoordinator.run(async () => {
        try {
          await createBackupInternal();
        } catch {
          return false;
        }
        return replaceDataAndPersistInternal(imported, false, true);
      });
      if (importedSuccessfully) reportUnsafeAlarmSchedule(scheduleEnforcement);
      return importedSuccessfully;
    },
    [
      createBackupInternal,
      mutationCoordinator,
      replaceDataAndPersistInternal,
      reportUnsafeAlarmSchedule,
    ],
  );

  const getLatestBackupPreview = useCallback(async () => {
    const raw = await readAutomaticBackup(runtime.dataRepository);
    return raw === null ? null : previewAppDataImport(raw);
  }, [runtime]);

  const getPendingRestoreBackupPreview = useCallback(async () => {
    if (!readyRef.current) return null;
    const pending = await readPendingRestoreBackup(
      runtime.dataRepository,
      getPersistedDataForPendingRestore(),
    );
    if (pending === null) return null;
    return {
      ...previewAppDataImport(pending.backup),
      recoveryState: pending.recoveryState,
    };
  }, [getPersistedDataForPendingRestore, runtime]);

  const retryPendingRestoreBackup = useCallback(async (allowUnverified = false) => {
    if (!readyRef.current) return { status: 'unavailable' } as const;
    return mutationCoordinator.run(() =>
      retryPendingRestoreBackupCommit(
        runtime.dataRepository,
        storageWriter,
        getPersistedDataForPendingRestore(),
        { allowUnverified },
      ),
    );
  }, [getPersistedDataForPendingRestore, mutationCoordinator, runtime, storageWriter]);

  const getRecoveryBackupPreview = useCallback(async () => {
    if (loadFailureReason === 'recovery-required') {
      const raw = missingPrimaryRecoveryRawRef.current;
      return raw === null ? null : previewAppDataImport(raw);
    }
    if (loadFailureReason !== 'corrupt' || corruptBackupKey === null) return null;
    const raw = await readRecoveryBackup(runtime.dataRepository);
    return raw === null ? null : previewAppDataImport(raw);
  }, [corruptBackupKey, loadFailureReason, runtime]);

  const restoreRecoveryBackup = useCallback(async () => {
    if (
      readyRef.current ||
      (loadFailureReason !== 'recovery-required' &&
        (loadFailureReason !== 'corrupt' || corruptBackupKey === null))
    ) {
      return false;
    }
    return mutationCoordinator.run(async () => {
      let preview: AppDataImportPreview | null;
      try {
        preview = await getRecoveryBackupPreview();
      } catch {
        return false;
      }
      if (preview === null) return false;

      try {
        const restored = withoutAlarmRuntimeState(appDataFromImportPreview(preview));
        const enforced = enforceAppDataScheduleSafety(restored, { mode: 'ingress' });
        await storageWriter.write(
          APP_DATA_STORAGE_KEY,
          serializeAppData(enforced.data ?? restored),
        );
        await clearExplicitResetMarker(storageWriter).catch(() => undefined);
      } catch {
        return false;
      }
      return loadData();
    });
  }, [
    corruptBackupKey,
    getRecoveryBackupPreview,
    loadData,
    loadFailureReason,
    mutationCoordinator,
    storageWriter,
  ]);

  const restoreLatestBackup = useCallback(async (): Promise<LatestBackupRestoreResult> => {
    return mutationCoordinator.run(async () => {
      let preview: AppDataImportPreview | null;
      try {
        preview = await getLatestBackupPreview();
      } catch {
        return { status: 'failure', reason: 'backup-unavailable' } as const;
      }
      if (preview === null) {
        return { status: 'failure', reason: 'backup-unavailable' } as const;
      }
      if (readyRef.current) {
        try {
          if (
            await readPendingRestoreBackup(
              runtime.dataRepository,
              getPersistedDataForPendingRestore(),
            )
          ) {
            return { status: 'partial', reason: 'backup-pending' } as const;
          }
        } catch {
          return { status: 'failure', reason: 'protection-failed' } as const;
        }
        let restored: AppData;
        let scheduleEnforcement: EnforcedScheduleSafety;
        try {
          restored = withoutAlarmRuntimeState(appDataFromImportPreview(preview));
          scheduleEnforcement = enforceAppDataScheduleSafety(restored, {
            mode: 'ingress',
          });
          restored = scheduleEnforcement.data ?? restored;
        } catch {
          return { status: 'failure', reason: 'backup-unavailable' } as const;
        }
        const transaction = await restoreWithAutomaticBackupCommit(
          storageWriter,
          dataRef.current,
          restored,
          () => replaceDataAndPersistDetailedInternal(restored, false, true),
        );
        if (!transaction.restoreStarted) {
          return { status: 'failure', reason: 'protection-failed' } as const;
        }
        if (!transaction.restoreResult?.operationSucceeded) {
          return { status: 'failure', reason: 'restore-failed' } as const;
        }
        reportUnsafeAlarmSchedule(scheduleEnforcement);
        if (!transaction.automaticBackupSaved) {
          return { status: 'partial', reason: 'backup-pending' } as const;
        }
        if (transaction.restoreResult.partialFailure) {
          return { status: 'partial', reason: 'follow-up-failed' } as const;
        }
        return { status: 'success' } as const;
      }

      try {
        const restored = withoutAlarmRuntimeState(preview.data);
        const scheduleEnforcement = enforceAppDataScheduleSafety(restored, {
          mode: 'ingress',
        });
        await storageWriter.write(
          APP_DATA_STORAGE_KEY,
          serializeAppData(scheduleEnforcement.data ?? restored),
        );
      } catch {
        return { status: 'failure', reason: 'restore-failed' } as const;
      }
      return (await loadData())
        ? ({ status: 'success' } as const)
        : ({ status: 'failure', reason: 'restore-failed' } as const);
    });
  }, [
    getLatestBackupPreview,
    getPersistedDataForPendingRestore,
    loadData,
    mutationCoordinator,
    replaceDataAndPersistDetailedInternal,
    reportUnsafeAlarmSchedule,
    runtime,
    storageWriter,
  ]);

  const startFreshAfterLoadError = useCallback(async () => {
    if (
      readyRef.current ||
      (loadFailureReason !== 'recovery-required' &&
        (loadFailureReason !== 'corrupt' || corruptBackupKey === null))
    ) {
      return false;
    }
    return mutationCoordinator.run(async () => {
      try {
        await writeExplicitResetMarker(storageWriter);
        explicitResetMarkerPendingRef.current = true;
        await storageWriter.write(APP_DATA_STORAGE_KEY, serializeAppData(createDefaultData()));
      } catch {
        await clearExplicitResetMarker(storageWriter).catch(() => undefined);
        explicitResetMarkerPendingRef.current = false;
        return false;
      }
      return loadData();
    });
  }, [
    corruptBackupKey,
    loadData,
    loadFailureReason,
    mutationCoordinator,
    storageWriter,
  ]);

  const retryLoad = useCallback(
    () => mutationCoordinator.run(() => loadData()),
    [loadData, mutationCoordinator],
  );

  const resetAllDataDetailed = useCallback(async (): Promise<ResetAllDataResult> => {
    if (!readyRef.current) {
      return { status: 'failure', dataReset: false, reason: 'reset-failed' };
    }
    return mutationCoordinator.run(async () => {
      try {
        await createBackupInternal();
      } catch {
        return { status: 'failure', dataReset: false, reason: 'backup-failed' } as const;
      }
      try {
        await writeExplicitResetMarker(storageWriter);
        explicitResetMarkerPendingRef.current = true;
      } catch {
        return { status: 'failure', dataReset: false, reason: 'reset-failed' } as const;
      }
      const reset = await replaceDataAndPersistDetailedInternal(
        createDefaultData(),
        false,
        true,
        async (snapshot) => {
          const cleanup = await resumeResetCleanupJournal({
            persistedSnapshot: snapshot,
            resetAlarmRuntime: resetAlarmRuntimeForResetCleanup,
            cancelTimer: cancelQuickTimerForResetCleanup,
          });
          if (!cleanup.completed) {
            throw new Error('초기화 후속 정리를 완료하지 못했습니다.');
          }
        },
        (snapshot) => prepareResetCleanupJournal(snapshot),
      );
      const result = getResetAllDataResult(reset);
      if (!result.dataReset) {
        await clearResetCleanupJournal().catch(() => undefined);
        await clearExplicitResetMarker(storageWriter).catch(() => undefined);
        explicitResetMarkerPendingRef.current = false;
      }
      return result;
    });
  }, [
    createBackupInternal,
    replaceDataAndPersistDetailedInternal,
    mutationCoordinator,
    storageWriter,
  ]);

  const resetAllData = useCallback(async () => {
    const result = await resetAllDataDetailed();
    return result.status === 'success';
  }, [resetAllDataDetailed]);

  const dataValue = useMemo<AppStoreDataState>(
    () => ({
      data,
      ready,
      getShiftForDate,
      getNoteForDate,
    }),
    [data, getNoteForDate, getShiftForDate, ready],
  );

  const statusValue = useMemo<AppStoreStatusState>(
    () => ({
      loadError,
      loadFailureReason,
      saveStatus,
      saveOutcome,
      saveError,
      saveSuccessRevision,
      alarmSyncStatus,
      alarmSyncError,
      sleepReminderSyncStatus,
      sleepReminderSyncError,
      sleepReminderSyncRevision,
      corruptBackupKey,
      alarmAutoCheckState,
    }),
    [
      corruptBackupKey,
      alarmAutoCheckState,
      loadError,
      loadFailureReason,
      saveOutcome,
      saveError,
      saveStatus,
      saveSuccessRevision,
      alarmSyncStatus,
      alarmSyncError,
      sleepReminderSyncStatus,
      sleepReminderSyncError,
      sleepReminderSyncRevision,
    ],
  );

  const actionsValue = useMemo<AppStoreActions>(
    () => ({
      retryLoad,
      retrySave,
      retrySleepReminderSync,
      saveDay,
      saveDays,
      updatePattern,
      updatePatternDetailed,
      updateShiftTypes,
      updatePayrollSettings,
      dismissPlayUpdate,
      setThemeMode,
      toggleWidgetDisplayOption,
      completeSetup,
      completeInitialSetup,
      getAlarmStatus,
      requestAlarmAccess,
      resyncAlarms,
      enableAlarms,
      disableAlarms,
      setSleepReminderEnabled,
      sendTestAlarm,
      exportData,
      previewImportData,
      importData,
      exportSharedWorkSettings,
      previewSharedWorkSettings,
      applySharedWorkSettings,
      saveUserPattern,
      importValidatedPattern,
      deletePattern,
      previewPatternApplication,
      applyPatternFromVault,
      rollbackLastPatternApplication,
      createBackup,
      createBackupBeforeReset: createBackup,
      getLatestBackupPreview,
      getPendingRestoreBackupPreview,
      getRecoveryBackupPreview,
      restoreLatestBackup,
      retryPendingRestoreBackup,
      restoreRecoveryBackup,
      startFreshAfterLoadError,
      resetAllData,
      resetAllDataDetailed,
    }),
    [
      completeSetup,
      completeInitialSetup,
      createBackup,
      dismissPlayUpdate,
      disableAlarms,
      enableAlarms,
      exportData,
      exportSharedWorkSettings,
      getLatestBackupPreview,
      getPendingRestoreBackupPreview,
      getRecoveryBackupPreview,
      getAlarmStatus,
      importData,
      previewImportData,
      previewSharedWorkSettings,
      resetAllData,
      resetAllDataDetailed,
      retryLoad,
      retryPendingRestoreBackup,
      retrySave,
      retrySleepReminderSync,
      restoreLatestBackup,
      restoreRecoveryBackup,
      requestAlarmAccess,
      resyncAlarms,
      saveDay,
      saveDays,
      sendTestAlarm,
      setSleepReminderEnabled,
      setThemeMode,
      updatePayrollSettings,
      toggleWidgetDisplayOption,
      startFreshAfterLoadError,
      applySharedWorkSettings,
      applyPatternFromVault,
      deletePattern,
      importValidatedPattern,
      previewPatternApplication,
      rollbackLastPatternApplication,
      saveUserPattern,
      updatePattern,
      updatePatternDetailed,
      updateShiftTypes,
    ],
  );

  const storeValue = useMemo<AppStore>(
    () => ({ ...dataValue, ...statusValue, ...actionsValue }),
    [actionsValue, dataValue, statusValue],
  );

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <AppStoreSelectorProvider value={storeValue}>
        <AppStoreDataContext.Provider value={dataValue}>
          <AppStoreStatusContext.Provider value={statusValue}>
            <AppStoreActionsContext.Provider value={actionsValue}>
              {children}
            </AppStoreActionsContext.Provider>
          </AppStoreStatusContext.Provider>
        </AppStoreDataContext.Provider>
      </AppStoreSelectorProvider>
    </AppRuntimeContext.Provider>
  );
}

export function useAppSelector<TSelected>(
  selector: (store: AppStore) => TSelected,
  equality: AppSelectorEquality<TSelected> = Object.is,
): TSelected {
  const source = useContext(AppStoreSelectorContext);
  if (!source) throw new Error('앱 선택자 저장소가 준비되지 않았습니다.');

  const subscription = useMemo(
    () => source.createSubscription(selector, equality),
    [equality, selector, source],
  );
  useEffect(() => subscription.destroy, [subscription]);
  return useSyncExternalStore(
    subscription.subscribe,
    subscription.getSnapshot,
    subscription.getSnapshot,
  );
}

export function useAppCommands(): AppStoreActions {
  return useAppStoreActions();
}

export function useAppRuntimeController(): NativeAppRuntimeController {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime) throw new Error('앱 실행 환경이 준비되지 않았습니다.');
  return runtime;
}

export function useAppStoreData() {
  const value = useContext(AppStoreDataContext);
  if (!value) throw new Error('앱 데이터 저장소가 준비되지 않았습니다.');
  return value;
}

export function useAppStoreStatus() {
  const value = useContext(AppStoreStatusContext);
  if (!value) throw new Error('앱 상태 저장소가 준비되지 않았습니다.');
  return value;
}

export function useAppStoreActions() {
  const value = useContext(AppStoreActionsContext);
  if (!value) throw new Error('앱 작업 저장소가 준비되지 않았습니다.');
  return value;
}

export function useAppStore(): AppStore {
  const data = useAppStoreData();
  const status = useAppStoreStatus();
  const actions = useAppStoreActions();
  return { ...data, ...status, ...actions };
}
