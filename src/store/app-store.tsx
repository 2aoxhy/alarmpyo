import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { withAlarmRuntimeState } from '@/application/app-data-mutations';
import {
  applyInitialSetupValues,
  applyPatternSettings,
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
  clearSetupDraftBeforeApplyingReset,
  createDataReplacementResult,
  getSleepReminderSyncModeForAppState,
  getResetAllDataResult,
  persistLatestCanonicalSnapshotAndSyncSleep,
  shouldClearSleepReminderSaveError,
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
  SaveStatus,
  UpdatePatternOptions,
} from '@/application/app-store-contract';

import type {
  AppData,
  DayAlarmOverride,
  DayExceptionType,
  DayTimeOverride,
  RotationPattern,
  ShiftType,
  ThemeMode,
  WidgetDisplayOptions,
  WorkRoutineProfiles,
} from '@/models/app-data';
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
import {
  readDeviceSafetyBackup,
  writeDeviceSafetyBackup,
} from '@/services/device-safety-backup-service';
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
  getAlarmPyoAlarmStatus,
  requestAlarmPyoAlarmPermissions,
  scheduleAlarmPyoTestAlarm,
  syncAlarmPyoAlarms,
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
  requestAlarmPyoSleepReminderPermission,
  syncAlarmPyoSleepReminders,
} from '@/services/sleep-reminder-service';
import { clearSetupDraft } from '@/services/setup-draft-service';
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
  SaveStatus,
  UpdatePatternOptions,
} from '@/application/app-store-contract';

export function createDefaultData(anchorDate = toDateKey(new Date())): AppData {
  return createDefaultAppData(anchorDate);
}

const AUTOMATIC_SAVE_DEBOUNCE_MS = 300;
const SLEEP_REMINDER_SYNC_SAVE_ERROR =
  '자료는 저장했지만 수면 알림을 갱신하지 못했어요. 앱을 다시 열면 자동으로 다시 시도해요.';

export function resolveShiftFromData(data: AppData, dateKey: string): ShiftType | null {
  return selectShiftForDate(data, dateKey);
}

const AppStoreDataContext = createContext<AppStoreDataState | null>(null);
const AppStoreStatusContext = createContext<AppStoreStatusState | null>(null);
const AppStoreActionsContext = createContext<AppStoreActions | null>(null);

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<AppData>(() => createDefaultData());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadFailureReason, setLoadFailureReason] =
    useState<AppDataLoadFailureReason | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessRevision, setSaveSuccessRevision] = useState(0);
  const [alarmSyncStatus, setAlarmSyncStatus] =
    useState<AlarmSyncStatus>('idle');
  const [alarmSyncError, setAlarmSyncError] = useState<string | null>(null);
  const [corruptBackupKey, setCorruptBackupKey] = useState<string | null>(null);
  const [alarmAutoCheckState, setAlarmAutoCheckState] =
    useState<AlarmAutoCheckState>({ checkedAt: null, status: 'idle' });
  const [storageWriter] = useState(() => createSerializedStorageWriter(AsyncStorage));
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
  const lastKnownGoodSnapshotRef = useRef<string | null>(null);
  const alarmResumeSyncRef = useRef<Promise<boolean> | null>(null);
  const sleepReminderSyncTailRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const lastAlarmSyncSignatureRef = useRef<string | null>(null);
  const failedAlarmSyncSignatureRef = useRef<string | null>(null);
  const lastSleepReminderSyncSignatureRef = useRef<string | null>(null);
  const failedSleepReminderSyncSignatureRef = useRef<string | null>(null);
  const sleepReminderFailureSaveRevisionRef = useRef<number | null>(null);
  const saveErrorSourceRef = useRef<'sleep-reminder' | 'other' | null>(null);
  const lastTimeZoneOffsetRef = useRef(new Date().getTimezoneOffset());
  const backupRequestRef = useRef<Promise<string> | null>(null);
  const missingPrimaryRecoveryRawRef = useRef<string | null>(null);
  const explicitResetMarkerPendingRef = useRef(false);

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
    setSaveError(null);
    setAlarmSyncStatus('idle');
    setAlarmSyncError(null);
    setAlarmAutoCheckState({ checkedAt: null, status: 'idle' });
    lastKnownGoodSnapshotRef.current = null;
    missingPrimaryRecoveryRawRef.current = null;
    explicitResetMarkerPendingRef.current = false;
    lastAlarmSyncSignatureRef.current = null;
    failedAlarmSyncSignatureRef.current = null;
    lastSleepReminderSyncSignatureRef.current = null;
    failedSleepReminderSyncSignatureRef.current = null;
    sleepReminderFailureSaveRevisionRef.current = null;
    saveErrorSourceRef.current = null;

    let result = await loadAppDataFromStorage(
      AsyncStorage,
      createDefaultData(),
      new Date(),
      quarantineCorruptAppData,
    );
    let deviceBackup: Awaited<ReturnType<typeof readDeviceSafetyBackup>> = null;
    const shouldInspectDeviceBackup =
      (result.ok && result.source === 'empty') ||
      (!result.ok &&
        (result.reason === 'corrupt' || result.reason === 'recovery-required'));
    if (shouldInspectDeviceBackup) {
      try {
        deviceBackup = await readDeviceSafetyBackup();
      } catch {
        // 독립 파일 백업을 읽지 못해도 AsyncStorage의 정상 백업을 계속 확인해요.
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
        AsyncStorage,
        createDefaultData(),
        new Date(),
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
            AsyncStorage,
            createDefaultData(),
            new Date(),
            quarantineCorruptAppData,
          );
          recoveredFromDeviceBackup = result.ok;
          if (recoveredFromDeviceBackup) {
            try {
              await writeLastKnownGoodBackup(storageWriter, recoveredSnapshot);
            } catch {
              // 본문 복구가 끝났다면 최근 정상 저장본 갱신 실패로 복구를 되돌리지 않아요.
            }
          }
        }
      } catch {
        // 기기 파일 백업을 읽거나 복구하지 못하면 보존한 손상 원본과 복구 화면을 유지해요.
      }
    }
    const matchingLastKnownGoodSnapshot = result.ok
      ? await findMatchingLastKnownGoodSnapshot(
          AsyncStorage,
          result.persistedSnapshot,
        )
      : null;
    const explicitResetMarkerPending = result.ok
      ? result.source === 'reset' || await hasExplicitResetMarker(AsyncStorage).catch(() => false)
      : false;
    if (!mountedRef.current || loadAttemptRef.current !== attempt) return false;
    if (result.ok) {
      await reconcilePendingRestoreBackup(
        AsyncStorage,
        storageWriter,
        result.data,
      );
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

    dataRef.current = result.data;
    explicitResetMarkerPendingRef.current = explicitResetMarkerPending;
    appDataWriter.setPersistedValue(result.persistedSnapshot);
    lastKnownGoodSnapshotRef.current = matchingLastKnownGoodSnapshot;
    setData(result.data);
    readyRef.current = true;
    setReady(true);
    setSaveStatus(
      recoveredFromDeviceBackup || result.source === 'stored'
        ? 'saved'
        : 'idle',
    );
    if (recoveredFromDeviceBackup) {
      setSaveSuccessRevision((current) => current + 1);
    }
    return true;
  }, [appDataWriter, storageWriter]);

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
        ? '변경 내용은 저장했지만 알람을 다시 예약하지 못했어요. 알람 화면에서 권한을 확인한 뒤 다시 예약해 주세요.'
        : '알람을 끄는 설정은 저장했지만 기존 예약을 취소하지 못했어요. 알람 화면에서 다시 시도해 주세요.',
    );
  }, []);

  const syncAlarmsForSnapshot = useCallback(async (
    snapshot: AppData,
    preparedPlan?: readonly AlarmPyoAlarmPlan[],
    preparedMetadata?: AlarmPyoAlarmSyncMetadata,
  ) => {
    const signature = getAlarmScheduleSignature(snapshot);
    if (mountedRef.current) {
      setAlarmSyncStatus('syncing');
      setAlarmSyncError(null);
    }
    try {
      const plan = preparedPlan ?? buildAlarmPyoAlarmPlan(
        snapshot,
        (dateKey) =>
          resolveShiftFromData(snapshot, dateKey),
      );
      const status = await applyNativeAlarmSnapshot({
        notificationsEnabled: snapshot.settings.notificationsEnabled,
        plan,
        synchronize: (alarms) => syncAlarmPyoAlarms(
          alarms,
          preparedMetadata ?? buildAlarmPyoAlarmSyncMetadata(),
        ),
        cancelAll: cancelAllAlarmPyoAlarms,
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
        throw new Error('알람 예약 내용이 계획과 일치하지 않아요.');
      }
      lastTimeZoneOffsetRef.current = new Date().getTimezoneOffset();
      lastAlarmSyncSignatureRef.current = signature;
      if (failedAlarmSyncSignatureRef.current === signature) {
        failedAlarmSyncSignatureRef.current = null;
      }
      if (mountedRef.current) {
        setAlarmSyncStatus('synced');
        setAlarmSyncError(null);
      }
      updateData((current) => {
        if (getAlarmScheduleSignature(current) !== signature) return current;
        return withAlarmRuntimeState(
          current,
          status.scheduledCount,
          new Date().toISOString(),
        );
      });
      return true;
    } catch {
      failedAlarmSyncSignatureRef.current = signature;
      reportAlarmSyncFailure(snapshot.settings.notificationsEnabled);
      return false;
    }
  }, [reportAlarmSyncFailure, updateData]);

  const syncSleepRemindersForSnapshot = useCallback(
    (snapshot: AppData, force = false): Promise<boolean> => {
      const signature = getSleepReminderScheduleSignature(snapshot);
      const task = sleepReminderSyncTailRef.current
        .catch(() => false)
        .then(async () => {
          if (
            !force &&
            lastSleepReminderSyncSignatureRef.current === signature
          ) {
            return true;
          }
          try {
            if (
              snapshot.settings.sleepReminderEnabled &&
              snapshot.settings.setupCompleted
            ) {
              await syncAlarmPyoSleepReminders(
                buildSleepReminderPlans(snapshot, { now: new Date() }),
              );
            } else {
              await cancelAlarmPyoSleepReminders();
            }
            lastSleepReminderSyncSignatureRef.current = signature;
            const failureRevision = sleepReminderFailureSaveRevisionRef.current;
            failedSleepReminderSyncSignatureRef.current = null;
            sleepReminderFailureSaveRevisionRef.current = null;
            if (
              mountedRef.current &&
              shouldClearSleepReminderSaveError({
                failureRevision,
                currentRevision: saveRevisionRef.current,
                currentErrorSource: saveErrorSourceRef.current,
              })
            ) {
              saveErrorSourceRef.current = null;
              setSaveStatus('saved');
              setSaveError(null);
            }
            return true;
          } catch {
            failedSleepReminderSyncSignatureRef.current = signature;
            if (lastSleepReminderSyncSignatureRef.current === signature) {
              lastSleepReminderSyncSignatureRef.current = null;
            }
            // 저장 결과 표시는 호출한 저장 흐름에서 결정하고, 앱 복귀·초기 동기화 실패가
            // unrelated 저장 오류를 덮어쓰지 않게 해요.
            return false;
          }
        });
      sleepReminderSyncTailRef.current = task;
      return task;
    },
    [],
  );

  const reportSleepReminderSaveFailure = useCallback((revision: number) => {
    sleepReminderFailureSaveRevisionRef.current = revision;
    if (mountedRef.current && saveRevisionRef.current === revision) {
      saveErrorSourceRef.current = 'sleep-reminder';
      setSaveStatus('error');
      setSaveError(SLEEP_REMINDER_SYNC_SAVE_ERROR);
    }
  }, []);

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
            AsyncStorage,
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
          saveErrorSourceRef.current = 'other';
          setSaveStatus('error');
          setSaveError(
            '복원 전 원본 백업을 아직 안전하게 보호하지 못했어요. 저장 공간을 확인한 뒤 다시 저장해 주세요.',
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
      saveErrorSourceRef.current = null;
      setSaveStatus('saving');
      setSaveError(null);
    }

    const outcome = await persistSnapshotWithLastKnownGood(
      appDataWriter,
      storageWriter,
      snapshot,
      lastKnownGoodSnapshotRef.current,
      { force },
    );
    lastKnownGoodSnapshotRef.current = outcome.lastKnownGoodSnapshot;

    if (!outcome.operationSucceeded || outcome.partialFailure) {
      if (mountedRef.current && saveRevisionRef.current === revision) {
        saveErrorSourceRef.current = 'other';
        setSaveStatus('error');
        setSaveError(
          outcome.primarySaved
            ? '근무표는 저장했지만 안전 복사본을 만들지 못했어요. 다시 저장해 주세요.'
            : '변경 내용을 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.',
        );
      }
      // 본문 저장이 끝났다면 화면 상태도 같은 값으로 맞춰요.
      // 안전 복사본 실패는 오류 배너로 알리되, 재실행 전후의 자료가 달라지지 않게 해요.
      return { ...outcome, deviceBackupSaved: false };
    }

    let deviceBackupSaved = false;
    let resetMarkerCleared = true;
    const parsedSnapshot = canonicalData === undefined
      ? tryParseAppDataJson(snapshot)
      : null;
    const savedData = canonicalData ?? (parsedSnapshot?.ok ? parsedSnapshot.value.data : null);
    if (savedData !== null) {
      try {
        deviceBackupSaved = await writeDeviceSafetyBackup(
          savedData,
        );
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
      saveErrorSourceRef.current = followUpSaved ? null : 'other';
      setSaveStatus(followUpSaved ? 'saved' : 'error');
      setSaveError(
        followUpSaved
          ? null
          : deviceBackupSaved
            ? '근무표는 저장했지만 초기화 상태를 정리하지 못했어요. 다시 저장해 주세요.'
            : '근무표는 저장했지만 기기 안전 백업 파일을 갱신하지 못했어요. 저장 공간을 확인한 뒤 다시 저장해 주세요.',
      );
      if (announceSuccess && outcome.announceSuccess && followUpSaved) {
        setSaveSuccessRevision((current) => current + 1);
      }
    }
    return withDeviceBackupResult(outcome, followUpSaved);
  }, [appDataWriter, storageWriter]);

  const flushAutomaticSave = useCallback((generation: number) => {
    if (generation !== automaticSaveGenerationRef.current || !readyRef.current) {
      return Promise.resolve(false);
    }
    return mutationCoordinator.run(async () => {
      try {
        if (generation !== automaticSaveGenerationRef.current || !readyRef.current) {
          return false;
        }
        // 실행 시점의 최신 상태를 직렬화해 지연된 자동 저장이
        // 이후에 저장한 근무표를 덮어쓰지 않게 해요.
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
          saveErrorSourceRef.current = 'other';
          setSaveStatus('error');
          setSaveError('변경 내용의 형식이 올바르지 않아 저장하지 못했어요.');
        }
        return false;
      }
    });
  }, [
    mutationCoordinator,
    persistSnapshot,
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
    if (!ready) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      if (automaticSaveTimerRef.current !== null) {
        clearTimeout(automaticSaveTimerRef.current);
        automaticSaveTimerRef.current = null;
      }
      void flushAutomaticSave(automaticSaveGenerationRef.current);
    });
    return () => subscription.remove();
  }, [flushAutomaticSave, ready]);

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
        const alarmSyncSucceeded = await syncAlarmsForSnapshot(snapshot);
        if (!alarmSyncSucceeded || !sleepReminderSyncSucceeded) {
          if (!sleepReminderSyncSucceeded) {
            reportSleepReminderSaveFailure(persistenceRevision);
          }
          automaticSaveGenerationRef.current += 1;
          return false;
        }
        if (mountedRef.current) setSaveSuccessRevision((current) => current + 1);
        return true;
      });
    } catch {
      if (mountedRef.current) {
        saveErrorSourceRef.current = 'other';
        setSaveStatus('error');
        setSaveError('변경 내용의 형식이 올바르지 않아 저장하지 못했어요.');
      }
      return false;
    }
  }, [
    mutationCoordinator,
    persistSnapshot,
    reportSleepReminderSaveFailure,
    syncAlarmsForSnapshot,
    syncSleepRemindersForSnapshot,
    updateData,
  ]);

  const replaceDataAndPersistDetailedInternal = useCallback(
    async (
      replacement: AppData | ((current: AppData) => AppData),
      announceSuccess = false,
      forceAlarmSync = false,
      afterPrimarySaveBeforeApply?: () => Promise<void>,
    ): Promise<DataReplacementResult> => {
      const current = dataRef.current;
      const replacementData =
        typeof replacement === 'function' ? replacement(current) : replacement;
      let next: AppData;
      let snapshot: string;
      try {
        next = canonicalizeAppData(replacementData);
        snapshot = JSON.stringify(next);
      } catch {
        if (mountedRef.current) {
          saveErrorSourceRef.current = 'other';
          setSaveStatus('error');
          setSaveError('변경 내용의 형식이 올바르지 않아 저장하지 못했어요.');
        }
        return createDataReplacementResult({
          primarySaved: false,
          dataApplied: false,
          followUpSucceeded: false,
        });
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
          await afterPrimarySaveBeforeApply();
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
      if (!sleepReminderSyncSucceeded && persistenceFollowUpSucceeded) {
        reportSleepReminderSaveFailure(saveRevisionRef.current);
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
        // 곧바로 성공 상태로 덮어쓰지 않게 해요.
        automaticSaveGenerationRef.current += 1;
      }

      if (announceSuccess && outcome.announceSuccess && mountedRef.current) {
        setSaveSuccessRevision((value) => value + 1);
      }
      return outcome;
    },
    [
      persistSnapshot,
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
    // 마친 스냅샷이에요. 데이터 변경 signature에는 반응하지 않고 최초 로드·복구
    // 계획만 즉시 확인해, 이후 변경은 반드시 저장 flush 뒤에 동기화되게 해요.
    void mutationCoordinator.run(() =>
      syncSleepRemindersForSnapshot(dataRef.current),
    );
  }, [mutationCoordinator, ready, syncSleepRemindersForSnapshot]);

  useEffect(() => {
    if (!ready) return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (state) => {
      const syncMode = getSleepReminderSyncModeForAppState(previousState, state);
      previousState = state;
      if (syncMode !== null) {
        void mutationCoordinator.run(() =>
          syncSleepRemindersForSnapshot(dataRef.current, true),
        );
      }
    });
    return () => subscription.remove();
  }, [mutationCoordinator, ready, syncSleepRemindersForSnapshot]);

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
        return next;
      }, true);
      return applied && saved;
    },
    [replaceDataAndPersist],
  );

  const saveDays = useCallback(
    async (dateKeys: readonly string[], change: BulkDayChange) => {
      if (!readyRef.current) return false;
      let applied = false;
      const saved = await replaceDataAndPersist((current) => {
        const next = applyBulkDayChange(current, dateKeys, change);
        if (!next) return current;
        applied = true;
        return pruneInvalidDayAlarmOverrides(next);
      }, true);
      return applied && saved;
    },
    [replaceDataAndPersist],
  );

  const updatePattern = useCallback(
    async (
      pattern: RotationPattern,
      shiftTypePatches: Record<string, Partial<ShiftType>> = {},
      options: UpdatePatternOptions = {},
    ) => {
      if (pattern.shiftTypeIds.length === 0) return false;
      if (
        !isValidDateKey(pattern.anchorDate) ||
        !isValidDateKey(pattern.scheduleStartDate ?? pattern.anchorDate)
      ) {
        return false;
      }
      const clearFrom = options.clearFutureScheduleOverridesFrom;
      if (clearFrom !== undefined && !isValidDateKey(clearFrom)) return false;
      if (
        !hasOnlyKnownShiftTypeIds(
          dataRef.current.shiftTypes,
          Object.keys(shiftTypePatches),
        )
      ) {
        return false;
      }
      return replaceDataAndPersist(
        (current) =>
          applyPatternSettings(
            current,
            pattern,
            shiftTypePatches,
            clearFrom,
          ),
        true,
      );
    },
    [replaceDataAndPersist],
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
          !isValidWorkRoutineTiming(workRoutineProfiles.night))
      ) {
        return false;
      }
      if (!hasOnlyKnownShiftTypeIds(dataRef.current.shiftTypes, shiftTypeIds)) {
        return false;
      }
      if (shiftTypeIds.size === 0 && !workRoutineProfiles) return true;
      let compatible = true;
      const saved = await replaceDataAndPersist((current) => {
        const result = applyShiftSettings(current, patches, workRoutineProfiles);
        compatible = result.compatible;
        return result.data;
      }, true);
      return compatible && saved;
    },
    [replaceDataAndPersist],
  );

  const setThemeMode = useCallback(
    (themeMode: ThemeMode) => {
      void replaceDataAndPersist((current) => applyThemeMode(current, themeMode));
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
      return replaceDataAndPersist(
        (current) => applySetupCompletion(current, pattern),
        true,
      );
    },
    [replaceDataAndPersist],
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

      return replaceDataAndPersist(
        (current) =>
          applyInitialSetupValues(current, {
            pattern,
            notificationsEnabled,
            shiftTypePatches,
          }),
        true,
      );
    },
    [replaceDataAndPersist],
  );

  const getAlarmStatus = useCallback(async () => getAlarmPyoAlarmStatus(), []);

  const requestAlarmAccess = useCallback(async () => {
    const status = await requestAlarmPyoAlarmPermissions();
    return (
      status.supported &&
      status.exactAlarmAllowed &&
      status.fullScreenAllowed &&
      status.notificationsAllowed
    );
  }, []);

  const resyncAlarms = useCallback(async (force = false) => {
    if (!readyRef.current) return false;
    if (alarmResumeSyncRef.current) return alarmResumeSyncRef.current;

    const task = mutationCoordinator.run(async () => {
      const snapshot = dataRef.current;
      const signature = getAlarmScheduleSignature(snapshot);
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
            !force &&
            !retryPending &&
            !scheduleChanged &&
            canSkipDisabledAlarmStatusCheck({
              notificationsEnabled: snapshot.settings.notificationsEnabled,
              storedScheduledCount: snapshot.settings.scheduledNotificationCount,
              lastSyncAt: snapshot.settings.lastNotificationSyncAt,
            }),
          readStatus: getAlarmPyoAlarmStatus,
          createPlan: () => buildAlarmPyoAlarmPlan(
            snapshot,
            (dateKey) => resolveShiftFromData(snapshot, dateKey),
            {
              now: syncCheckNow,
              maxAlarms: MAX_NATIVE_SCHEDULED_ALARMS,
            },
          ),
          createSyncPlan: () => buildAlarmPyoAlarmPlan(
            snapshot,
            (dateKey) => resolveShiftFromData(snapshot, dateKey),
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
              notificationsEnabled: snapshot.settings.notificationsEnabled,
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
                snapshot,
                (dateKey) => resolveShiftFromData(snapshot, dateKey),
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
              storedScheduledCount: snapshot.settings.scheduledNotificationCount,
              lastSyncAt: snapshot.settings.lastNotificationSyncAt,
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
            snapshot.settings.scheduledNotificationCount !==
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
        reportAlarmSyncFailure(snapshot.settings.notificationsEnabled);
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
    const status = await requestAlarmPyoAlarmPermissions();
    if (!status.supported) return false;

    // 사용자가 알람을 켜려는 의사와 Android 전달 권한의 준비 상태는 별개예요.
    // 설정 화면에서 돌아오기 전의 권한 응답이 false여도 저장 실패로 표시하지 않고,
    // 알람 화면의 상태 카드가 다음으로 필요한 권한을 이어서 안내해요.
    return replaceDataAndPersist((current) => ({
      ...current,
      settings: { ...current.settings, notificationsEnabled: true },
    }));
  }, [replaceDataAndPersist]);

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
        await requestAlarmPyoSleepReminderPermission().catch(() => undefined);
      }
      // 알림 권한이 없어도 설정 저장은 성공이에요. 권한이 준비되면
      // 앱 복귀 동기화가 같은 14일 계획을 다시 전달해요.
      await syncSleepRemindersForSnapshot(dataRef.current, true);
      return true;
    },
    [replaceDataAndPersist, syncSleepRemindersForSnapshot],
  );

  const sendTestAlarm = useCallback(async () => {
    const status = await requestAlarmPyoAlarmPermissions();
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
  }, []);

  const exportData = useCallback(() => {
    if (!readyRef.current) throw new Error('근무표를 모두 불러온 뒤 내보낼 수 있어요.');
    const backup = exportAppDataToJson(dataRef.current);
    getCheckedBackupContentsByteSize(backup);
    return backup;
  }, []);
  const previewImportData = useCallback((raw: string) => {
    getCheckedBackupContentsByteSize(raw);
    return previewAppDataImport(raw);
  }, []);
  const exportSharedWorkSettings = useCallback(() => {
    if (!readyRef.current) throw new Error('근무표를 모두 불러온 뒤 공유할 수 있어요.');
    return exportWorkSettingsToJson(dataRef.current);
  }, []);
  const previewSharedWorkSettings = useCallback(
    (raw: string) => previewWorkSettingsImport(raw),
    [],
  );

  const createBackupInternal = useCallback(async () => {
    if (!readyRef.current) throw new Error('근무표를 모두 불러온 뒤 백업할 수 있어요.');
    try {
      const backup = await writeAutomaticBackup(storageWriter, dataRef.current);
      const deviceBackupSaved = await writeDeviceSafetyBackup(dataRef.current);
      if (!deviceBackupSaved) {
        throw new Error('기기 안전 백업 파일을 만들지 못했어요.');
      }
      return backup;
    } catch {
      // 사용자가 시작한 백업은 호출한 화면에서 작업 맥락에 맞게 안내해요.
      throw new Error('안전 백업을 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.');
    }
  }, [storageWriter]);

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

  const applySharedWorkSettings = useCallback(
    async (preview: WorkSettingsSharePreview) => {
      if (!readyRef.current) {
        return { success: false, reason: 'not-ready' } as const;
      }
      return mutationCoordinator.run(() =>
        applyWorkSettingsTransaction({
          current: dataRef.current,
          preview,
          // 개인 일정에 영향을 주는 작업이므로 적용 직전의 전체 데이터를 안전 백업해요.
          createSafetyBackup: createBackupInternal,
          save: (next) => replaceDataAndPersistInternal(
            pruneInvalidDayAlarmOverrides(next),
            false,
            true,
          ),
        }),
      );
    },
    [createBackupInternal, mutationCoordinator, replaceDataAndPersistInternal],
  );

  const importData = useCallback(
    async (preview: AppDataImportPreview) => {
      if (!readyRef.current) return false;
      let imported: AppData;
      try {
        // 예약 개수와 동기화 시각은 백업을 만든 휴대폰의 상태이므로 가져오지 않아요.
        imported = withoutAlarmRuntimeState(appDataFromImportPreview(preview));
      } catch {
        throw new Error('가져올 근무표를 다시 확인해 주세요.');
      }

      return mutationCoordinator.run(async () => {
        try {
          await createBackupInternal();
        } catch {
          return false;
        }
        return replaceDataAndPersistInternal(imported, false, true);
      });
    },
    [createBackupInternal, mutationCoordinator, replaceDataAndPersistInternal],
  );

  const getLatestBackupPreview = useCallback(async () => {
    const raw = await readAutomaticBackup(AsyncStorage);
    return raw === null ? null : previewAppDataImport(raw);
  }, []);

  const getPendingRestoreBackupPreview = useCallback(async () => {
    if (!readyRef.current) return null;
    const pending = await readPendingRestoreBackup(
      AsyncStorage,
      getPersistedDataForPendingRestore(),
    );
    if (pending === null) return null;
    return {
      ...previewAppDataImport(pending.backup),
      recoveryState: pending.recoveryState,
    };
  }, [getPersistedDataForPendingRestore]);

  const retryPendingRestoreBackup = useCallback(async (allowUnverified = false) => {
    if (!readyRef.current) return { status: 'unavailable' } as const;
    return mutationCoordinator.run(() =>
      retryPendingRestoreBackupCommit(
        AsyncStorage,
        storageWriter,
        getPersistedDataForPendingRestore(),
        { allowUnverified },
      ),
    );
  }, [getPersistedDataForPendingRestore, mutationCoordinator, storageWriter]);

  const getRecoveryBackupPreview = useCallback(async () => {
    if (loadFailureReason === 'recovery-required') {
      const raw = missingPrimaryRecoveryRawRef.current;
      return raw === null ? null : previewAppDataImport(raw);
    }
    if (loadFailureReason !== 'corrupt' || corruptBackupKey === null) return null;
    const raw = await readRecoveryBackup(AsyncStorage);
    return raw === null ? null : previewAppDataImport(raw);
  }, [corruptBackupKey, loadFailureReason]);

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
        await storageWriter.write(APP_DATA_STORAGE_KEY, serializeAppData(restored));
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
              AsyncStorage,
              getPersistedDataForPendingRestore(),
            )
          ) {
            return { status: 'partial', reason: 'backup-pending' } as const;
          }
        } catch {
          return { status: 'failure', reason: 'protection-failed' } as const;
        }
        let restored: AppData;
        try {
          restored = withoutAlarmRuntimeState(appDataFromImportPreview(preview));
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
        if (!transaction.automaticBackupSaved) {
          return { status: 'partial', reason: 'backup-pending' } as const;
        }
        if (transaction.restoreResult.partialFailure) {
          return { status: 'partial', reason: 'follow-up-failed' } as const;
        }
        return { status: 'success' } as const;
      }

      try {
        await storageWriter.write(
          APP_DATA_STORAGE_KEY,
          serializeAppData(withoutAlarmRuntimeState(preview.data)),
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
        () => clearSetupDraftBeforeApplyingReset(clearSetupDraft),
      );
      const result = getResetAllDataResult(reset);
      if (!result.dataReset) {
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
      saveError,
      saveSuccessRevision,
      alarmSyncStatus,
      alarmSyncError,
      corruptBackupKey,
      alarmAutoCheckState,
    }),
    [
      corruptBackupKey,
      alarmAutoCheckState,
      loadError,
      loadFailureReason,
      saveError,
      saveStatus,
      saveSuccessRevision,
      alarmSyncStatus,
      alarmSyncError,
    ],
  );

  const actionsValue = useMemo<AppStoreActions>(
    () => ({
      retryLoad,
      retrySave,
      saveDay,
      saveDays,
      updatePattern,
      updateShiftTypes,
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
      restoreLatestBackup,
      restoreRecoveryBackup,
      requestAlarmAccess,
      resyncAlarms,
      saveDay,
      saveDays,
      sendTestAlarm,
      setSleepReminderEnabled,
      setThemeMode,
      toggleWidgetDisplayOption,
      startFreshAfterLoadError,
      applySharedWorkSettings,
      updatePattern,
      updateShiftTypes,
    ],
  );

  return (
    <AppStoreDataContext.Provider value={dataValue}>
      <AppStoreStatusContext.Provider value={statusValue}>
        <AppStoreActionsContext.Provider value={actionsValue}>
          {children}
        </AppStoreActionsContext.Provider>
      </AppStoreStatusContext.Provider>
    </AppStoreDataContext.Provider>
  );
}

export function useAppStoreData() {
  const value = useContext(AppStoreDataContext);
  if (!value) throw new Error('앱 데이터 저장소가 준비되지 않았어요.');
  return value;
}

export function useAppStoreStatus() {
  const value = useContext(AppStoreStatusContext);
  if (!value) throw new Error('앱 상태 저장소가 준비되지 않았어요.');
  return value;
}

export function useAppStoreActions() {
  const value = useContext(AppStoreActionsContext);
  if (!value) throw new Error('앱 작업 저장소가 준비되지 않았어요.');
  return value;
}

export function useAppStore(): AppStore {
  const data = useAppStoreData();
  const status = useAppStoreStatus();
  const actions = useAppStoreActions();
  return { ...data, ...status, ...actions };
}
