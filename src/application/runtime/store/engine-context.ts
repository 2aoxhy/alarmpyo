import { AppStoreMutationQueue } from './mutation-queue';
import { type DataReplacementResult, type ResetAllDataResult } from '../../app-store-persistence';
import { type EnforcedScheduleSafety } from '../../app-store-schedule-safety';
import type {
  AlarmAutoCheckState,
  AlarmSyncStatus,
  DaySelection,
  InitialSetupInput,
  LatestBackupRestoreResult,
  SaveIssueCode,
  SaveOutcome,
  SaveRetryAction,
  SaveStatus,
  SetupCommitInput,
  SetupCommitResult,
  UpdatePatternOptions,
  UpdatePatternResult,
} from '../../app-store-contract';
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
} from '../../../models/app-data';
import { createDefaultAppData } from '../../app-data-policy';
import type { AppDataImportPreview } from '../../app-data-codec-port';
import {
  type AlarmPyoAlarmPlan,
  type AlarmPyoAlarmSyncMetadata,
} from '../../../services/alarm-planner';
import { type BulkDayChange } from '../../../services/bulk-day-update';
import { type WorkSettingsSharePreview } from '../../../services/work-settings-share-service';
import {
  type PatternApplicationInput,
  type PatternApplyResult,
  type PatternRollbackResult,
  type PatternVaultSaveResult,
  type UserPatternInput,
} from '../../../services/pattern-vault-service';
import type { ValidatedPatternDescriptor } from '../../../services/shift-pattern-schema';
import { toDateKey } from '../../../utils/date';
import type { AppStoreEnginePorts } from './engine-ports';
import { AppStoreSnapshotCell } from './snapshot-cell';

export type AppStoreEngineState = {
  data: AppData;
  ready: boolean;
  loadError: string | null;
  loadFailureReason: 'recovery-required' | 'io' | 'corrupt' | null;
  saveStatus: SaveStatus;
  saveOutcome: SaveOutcome | null;
  saveError: string | null;
  saveSuccessRevision: number;
  alarmSyncStatus: AlarmSyncStatus;
  alarmSyncError: string | null;
  sleepReminderSyncStatus: AlarmSyncStatus;
  sleepReminderSyncError: string | null;
  sleepReminderSyncRevision: number;
  corruptBackupKey: string | null;
  alarmAutoCheckState: AlarmAutoCheckState;
};

export type AppStoreOperations = {
  clearDeviceLocalDataForResetCleanup: () => Promise<void>;
  recordSaveOutcome: (outcome: SaveOutcome | null) => void;
  reportSaveIssue: (issueCode: SaveIssueCode, message: string) => void;
  clearReportedSaveIssue: (issueCode: SaveIssueCode) => void;
  reportUnsafeAlarmSchedule: (enforced: EnforcedScheduleSafety) => void;
  reportInvalidWorkSchedule: () => void;
  reportAlarmEnableBlocked: () => void;
  finalizeScheduleMutation: (enforced: EnforcedScheduleSafety | null, saved: boolean) => boolean;
  clearReportedSaveIssues: (retryAction: SaveRetryAction, markSaved?: boolean) => void;
  reportSaveSuccess: () => void;
  getPersistedDataForPendingRestore: () => AppData;
  loadData: () => Promise<boolean>;
  updateData: (update: (current: AppData) => AppData) => boolean;
  reportAlarmSyncFailure: (notificationsEnabled?: boolean) => void;
  syncAlarmsForSnapshot: (
    snapshot: AppData,
    preparedPlan?: readonly AlarmPyoAlarmPlan[],
    preparedMetadata?: AlarmPyoAlarmSyncMetadata,
  ) => Promise<boolean>;
  syncSleepRemindersForSnapshot: (snapshot: AppData, force?: boolean) => Promise<boolean>;
  reportSleepReminderSaveFailure: (revision: number) => void;
  persistSnapshot: (
    snapshot: string,
    force?: boolean,
    announceSuccess?: boolean,
    canonicalData?: AppData,
  ) => Promise<
    | {
        deviceBackupSaved: boolean;
        operationSucceeded: boolean;
        announceSuccess: boolean;
        partialFailure: boolean;
        primarySaved: boolean;
        lastKnownGoodSaved: boolean;
      }
    | {
        deviceBackupSaved: boolean;
        persistedSnapshot: string;
        lastKnownGoodSnapshot: string | null;
        operationSucceeded: boolean;
        announceSuccess: boolean;
        partialFailure: boolean;
        primarySaved: boolean;
        lastKnownGoodSaved: boolean;
      }
    | {
        deviceBackupSaved: boolean;
        operationSucceeded: boolean;
        announceSuccess: boolean;
        partialFailure: boolean;
        primarySaved: boolean;
        lastKnownGoodSaved: boolean;
        primaryChanged: boolean;
        persistedSnapshot: string | null;
        lastKnownGoodSnapshot: string | null;
      }
  >;
  flushAutomaticSave: (generation: number) => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  retrySleepReminderSync: () => Promise<boolean>;
  replaceDataAndPersistDetailedInternal: (
    replacement: AppData | ((current: AppData) => AppData),
    announceSuccess?: boolean,
    forceAlarmSync?: boolean,
    afterPrimarySaveBeforeApply?: (snapshot: string) => Promise<void>,
    beforePrimarySave?: (snapshot: string) => Promise<void>,
  ) => Promise<DataReplacementResult>;
  replaceDataAndPersistInternal: (
    replacement: AppData | ((current: AppData) => AppData),
    announceSuccess?: boolean,
    forceAlarmSync?: boolean,
  ) => Promise<boolean>;
  replaceDataAndPersist: (
    replacement: AppData | ((current: AppData) => AppData),
    announceSuccess?: boolean,
  ) => Promise<boolean>;
  getShiftForDate: (dateKey: string) => ShiftType | null;
  getNoteForDate: (dateKey: string) => string;
  saveDay: (
    dateKey: string,
    selection: DaySelection,
    note: string,
    timeOverride?: Pick<DayTimeOverride, 'startMinutes' | 'endMinutes'> | null,
    dayException?: DayExceptionType | null,
    alarmOverride?: DayAlarmOverride | null,
  ) => Promise<boolean>;
  saveDays: (dateKeys: readonly string[], change: BulkDayChange) => Promise<boolean>;
  updatePatternDetailed: (
    pattern: RotationPattern,
    shiftTypePatches?: Record<string, Partial<ShiftType>>,
    options?: UpdatePatternOptions,
  ) => Promise<UpdatePatternResult>;
  updatePattern: (
    pattern: RotationPattern,
    shiftTypePatches?: Record<string, Partial<ShiftType>>,
    options?: UpdatePatternOptions,
  ) => Promise<boolean>;
  updateShiftTypes: (
    patches: Record<string, Partial<ShiftType>>,
    workRoutineProfiles?: WorkRoutineProfiles,
  ) => Promise<boolean>;
  updateShiftSettings: (
    patches: Record<string, Partial<ShiftType>>,
    workRoutineProfiles: WorkRoutineProfiles,
    payrollSettings: PayrollSettings,
  ) => Promise<boolean>;
  setThemeMode: (themeMode: ThemeMode) => void;
  updatePayrollSettings: (settings: PayrollSettings) => Promise<boolean>;
  dismissPlayUpdate: (versionCode: number) => Promise<boolean>;
  toggleWidgetDisplayOption: (option: keyof WidgetDisplayOptions) => Promise<boolean>;
  completeSetup: (pattern?: RotationPattern) => Promise<boolean>;
  completeInitialSetup: ({
    pattern,
    notificationsEnabled,
    shiftTypePatches,
  }: InitialSetupInput) => Promise<boolean>;
  commitSetup: ({
    mode,
    pattern,
    notificationsEnabled,
    shiftTypePatches,
  }: SetupCommitInput) => Promise<SetupCommitResult>;
  getAlarmStatus: () => Promise<
    import('../../../services/alarmpyo-alarm-service').AlarmPyoAlarmStatus
  >;
  requestAlarmAccess: () => Promise<boolean>;
  resyncAlarms: (force?: boolean) => Promise<boolean>;
  enableAlarms: () => Promise<boolean>;
  disableAlarms: () => Promise<boolean>;
  setSleepReminderEnabled: (enabled: boolean) => Promise<boolean>;
  sendTestAlarm: () => Promise<boolean>;
  exportData: () => string;
  previewImportData: (raw: string) => AppDataImportPreview;
  exportSharedWorkSettings: () => string;
  previewSharedWorkSettings: (raw: string) => WorkSettingsSharePreview;
  saveUserPattern: (input: UserPatternInput) => Promise<PatternVaultSaveResult>;
  importValidatedPattern: (
    descriptor: ValidatedPatternDescriptor,
  ) => Promise<PatternVaultSaveResult>;
  deletePattern: (
    patternId: string,
  ) => Promise<
    | {
        readonly status: 'not-found';
        readonly patternId: string;
        readonly reason?: undefined;
        readonly rolledBack?: undefined;
      }
    | {
        readonly status: 'deleted';
        readonly patternId: string;
        readonly reason?: undefined;
        readonly rolledBack?: undefined;
      }
    | {
        readonly status: 'failure';
        readonly reason: 'backup-failed' | 'sync-failed' | 'rollback-failed' | 'storage-failed';
        readonly rolledBack: boolean;
        readonly patternId?: undefined;
      }
    | { readonly status: 'failure'; readonly reason: 'not-ready' }
  >;
  previewPatternApplication: (
    input: PatternApplicationInput,
  ) =>
    | {
        status: 'ready';
        preview: import('../../../services/pattern-vault-service').PatternApplicationPreview;
      }
    | {
        status: 'failure';
        reason: 'not-ready' | 'pattern-not-found' | 'invalid-date' | 'invalid-policy';
      }
    | { readonly status: 'failure'; readonly reason: 'not-ready' };
  createBackupInternal: () => Promise<string>;
  createBackup: () => Promise<string>;
  persistPatternTransaction: (
    current: AppData,
    candidate: AppData,
  ) => Promise<
    | { status: 'success' }
    | {
        status: 'failure';
        reason: 'backup-failed' | 'save-failed' | 'sync-failed' | 'rollback-failed';
        rolledBack: boolean;
      }
  >;
  applyPatternFromVault: (input: PatternApplicationInput) => Promise<PatternApplyResult>;
  rollbackLastPatternApplication: () => Promise<PatternRollbackResult>;
  applySharedWorkSettings: (
    preview: WorkSettingsSharePreview,
  ) => Promise<
    | { success: true }
    | { success: false; reason: 'not-ready' | 'invalid-file' | 'backup-failed' | 'save-failed' }
    | { readonly success: false; readonly reason: 'not-ready' }
  >;
  importData: (preview: AppDataImportPreview) => Promise<boolean>;
  getLatestBackupPreview: () => Promise<AppDataImportPreview | null>;
  getPendingRestoreBackupPreview: () => Promise<{
    recoveryState: import('./storage-port').PendingRestoreBackupRecoveryState;
    data: AppData;
    exportedAt: string | null;
    migratedFromVersion: import('../../app-data-codec-port').PreviousAppDataVersion | null;
    source: 'backup' | 'data';
    summary: {
      patternName: string;
      anchorDate: string;
      scheduleStartDate: string;
      shiftTypeCount: number;
      changedDateCount: number;
      noteCount: number;
      notificationsEnabled: boolean;
    };
  } | null>;
  retryPendingRestoreBackup: (
    allowUnverified?: boolean,
  ) => Promise<
    | { status: 'saved' }
    | { status: 'confirmation-required' }
    | { status: 'failed' }
    | { readonly status: 'unavailable' }
  >;
  getRecoveryBackupPreview: () => Promise<AppDataImportPreview | null>;
  restoreRecoveryBackup: () => Promise<boolean>;
  restoreLatestBackup: () => Promise<LatestBackupRestoreResult>;
  startFreshAfterLoadError: () => Promise<boolean>;
  retryLoad: () => Promise<boolean>;
  resetAllDataDetailed: () => Promise<ResetAllDataResult>;
  resetAllData: () => Promise<boolean>;
};

export function createAppStoreEngineContext(ports: AppStoreEnginePorts) {
  const { runtime, platform, storage, codec } = ports;
  const state = new AppStoreSnapshotCell<AppStoreEngineState>({
    data: createDefaultAppData(toDateKey(runtime.now())),
    ready: false,
    loadError: null,
    loadFailureReason: null,
    saveStatus: 'idle',
    saveOutcome: null,
    saveError: null,
    saveSuccessRevision: 0,
    alarmSyncStatus: 'idle',
    alarmSyncError: null,
    sleepReminderSyncStatus: 'idle',
    sleepReminderSyncError: null,
    sleepReminderSyncRevision: 0,
    corruptBackupKey: null,
    alarmAutoCheckState: { checkedAt: null, status: 'idle' },
  });
  const mutationCoordinator = new AppStoreMutationQueue();
  return {
    state,
    runtime,
    platform,
    storage,
    codec,
    mutationCoordinator,
    setData: (value: AppData | ((previous: AppData) => AppData)) => state.set('data', value),
    setReady: (value: boolean | ((previous: boolean) => boolean)) => state.set('ready', value),
    setLoadError: (value: string | null | ((previous: string | null) => string | null)) =>
      state.set('loadError', value),
    setLoadFailureReason: (
      value:
        | 'recovery-required'
        | 'io'
        | 'corrupt'
        | null
        | ((
            previous: 'recovery-required' | 'io' | 'corrupt' | null,
          ) => 'recovery-required' | 'io' | 'corrupt' | null),
    ) => state.set('loadFailureReason', value),
    setSaveStatus: (value: SaveStatus | ((previous: SaveStatus) => SaveStatus)) =>
      state.set('saveStatus', value),
    setSaveOutcome: (
      value: SaveOutcome | null | ((previous: SaveOutcome | null) => SaveOutcome | null),
    ) => state.set('saveOutcome', value),
    setSaveError: (value: string | null | ((previous: string | null) => string | null)) =>
      state.set('saveError', value),
    setSaveSuccessRevision: (value: number | ((previous: number) => number)) =>
      state.set('saveSuccessRevision', value),
    setAlarmSyncStatus: (
      value: AlarmSyncStatus | ((previous: AlarmSyncStatus) => AlarmSyncStatus),
    ) => state.set('alarmSyncStatus', value),
    setAlarmSyncError: (value: string | null | ((previous: string | null) => string | null)) =>
      state.set('alarmSyncError', value),
    setSleepReminderSyncStatus: (
      value: AlarmSyncStatus | ((previous: AlarmSyncStatus) => AlarmSyncStatus),
    ) => state.set('sleepReminderSyncStatus', value),
    setSleepReminderSyncError: (
      value: string | null | ((previous: string | null) => string | null),
    ) => state.set('sleepReminderSyncError', value),
    setSleepReminderSyncRevision: (value: number | ((previous: number) => number)) =>
      state.set('sleepReminderSyncRevision', value),
    setCorruptBackupKey: (value: string | null | ((previous: string | null) => string | null)) =>
      state.set('corruptBackupKey', value),
    setAlarmAutoCheckState: (
      value: AlarmAutoCheckState | ((previous: AlarmAutoCheckState) => AlarmAutoCheckState),
    ) => state.set('alarmAutoCheckState', value),
    mountedRef: { current: true } as { current: boolean },
    sessionRevisionRef: { current: 0 },
    readyRef: { current: false } as { current: boolean },
    dataRef: { current: state.getSnapshot().data } as { current: AppData },
    loadAttemptRef: { current: 0 } as { current: number },
    saveRevisionRef: { current: 0 } as { current: number },
    automaticSaveGenerationRef: { current: 0 } as { current: number },
    automaticSaveTimerRef: { current: null } as { current: number | null },
    automaticSaveAppliedCanonicalSnapshotRef: { current: null } as { current: AppData | null },
    lastPersistedAutomaticSaveSignatureRef: { current: null } as { current: string | null },
    lastKnownGoodSnapshotRef: { current: null } as { current: string | null },
    alarmResumeSyncRef: { current: null } as { current: Promise<boolean> | null },
    sleepReminderSyncAttemptRef: { current: 0 } as { current: number },
    lastAlarmSyncSignatureRef: { current: null } as { current: string | null },
    failedAlarmSyncSignatureRef: { current: null } as { current: string | null },
    lastSleepReminderSyncSignatureRef: { current: null } as { current: string | null },
    lastSleepReminderProjectionKeyRef: { current: null } as { current: string | null },
    failedSleepReminderSyncSignatureRef: { current: null } as { current: string | null },
    sleepReminderFailureSaveRevisionRef: { current: null } as { current: number | null },
    saveOutcomeRef: { current: null } as { current: SaveOutcome | null },
    lastTimeZoneOffsetRef: { current: runtime.now().getTimezoneOffset() } as { current: number },
    backupRequestRef: { current: null } as { current: Promise<string> | null },
    missingPrimaryRecoveryRawRef: { current: null } as { current: string | null },
    explicitResetMarkerPendingRef: { current: false } as { current: boolean },
  };
}
export type AppStoreEngineContext = ReturnType<typeof createAppStoreEngineContext>;
