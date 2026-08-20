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
import type { AppDataImportPreview } from '@/services/app-data-service';
import type {
  AppDataLoadFailureReason,
  PendingRestoreBackupRecoveryState,
  PendingRestoreBackupRetryResult,
} from '@/services/app-storage-service';
import type { AlarmPyoAlarmStatus } from '@/services/alarmpyo-alarm-service';
import type { BulkDayChange } from '@/services/bulk-day-update';
import type {
  AlarmAutoCheckStatus,
} from '@/services/alarm-sync-policy';
import type { DataReplacementResult, ResetAllDataResult } from './app-store-persistence';
import type {
  WorkSettingsApplyResult,
  WorkSettingsSharePreview,
} from '@/services/work-settings-share-service';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type AlarmSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
export type SleepReminderSyncStatus = AlarmSyncStatus;

export type SaveIssueCode =
  | 'invalid-data'
  | 'primary-save-failed'
  | 'restore-protection-failed'
  | 'safety-backup-failed'
  | 'device-backup-failed'
  | 'reset-marker-cleanup-failed'
  | 'sleep-reminder-sync-failed'
  | 'alarm-sync-failed'
  | 'invalid-work-schedule'
  | 'unsafe-alarm-schedule';

export type SaveRetryAction =
  | 'retry-save'
  | 'retry-sleep-reminders'
  | 'retry-alarms';

export type SaveIssue = {
  status: 'partial' | 'failure';
  issueCode: SaveIssueCode;
  message: string;
  retryAction: SaveRetryAction | null;
};

export type SaveIssueOutcome = SaveIssue & {
  /**
   * All unresolved follow-up failures. The top-level fields are compatibility
   * aliases for the highest-priority item in this list.
   */
  issues: SaveIssue[];
};

export type SaveOutcome =
  | {
      status: 'success';
      issues: [];
      issueCode: null;
      message: null;
      retryAction: null;
    }
  | SaveIssueOutcome;

export type AlarmAutoCheckState = {
  checkedAt: string | null;
  status: AlarmAutoCheckStatus;
};

export type LatestBackupRestoreResult =
  | { status: 'success' }
  | { status: 'partial'; reason: 'backup-pending' | 'follow-up-failed' }
  | {
      status: 'failure';
      reason: 'backup-unavailable' | 'protection-failed' | 'restore-failed';
    };

export type PendingRestoreBackupPreview = AppDataImportPreview & {
  recoveryState: PendingRestoreBackupRecoveryState;
};

export type DaySelection = string | null | 'pattern';

export type InitialSetupInput = {
  pattern: RotationPattern;
  notificationsEnabled: boolean;
  shiftTypePatches: Record<string, Partial<ShiftType>>;
};

export type UpdatePatternOptions = {
  clearFutureScheduleOverridesFrom?: string;
};

export type UpdatePatternResult = DataReplacementResult & {
  saveOutcome: SaveOutcome | null;
};

export type AppStore = {
  data: AppData;
  ready: boolean;
  loadError: string | null;
  loadFailureReason: AppDataLoadFailureReason | null;
  saveStatus: SaveStatus;
  saveOutcome: SaveOutcome | null;
  /** @deprecated 새 UI는 구조화된 saveOutcome을 사용해요. */
  saveError: string | null;
  saveSuccessRevision: number;
  alarmSyncStatus: AlarmSyncStatus;
  alarmSyncError: string | null;
  sleepReminderSyncStatus: SleepReminderSyncStatus;
  sleepReminderSyncError: string | null;
  /** 실제 네이티브 수면 알림 동기화가 끝날 때만 증가합니다. */
  sleepReminderSyncRevision: number;
  corruptBackupKey: string | null;
  alarmAutoCheckState: AlarmAutoCheckState;
  retryLoad: () => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  retrySleepReminderSync: () => Promise<boolean>;
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
  saveDays: (
    dateKeys: readonly string[],
    change: BulkDayChange,
  ) => Promise<boolean>;
  updatePattern: (
    pattern: RotationPattern,
    shiftTypePatches?: Record<string, Partial<ShiftType>>,
    options?: UpdatePatternOptions,
  ) => Promise<boolean>;
  updatePatternDetailed: (
    pattern: RotationPattern,
    shiftTypePatches?: Record<string, Partial<ShiftType>>,
    options?: UpdatePatternOptions,
  ) => Promise<UpdatePatternResult>;
  updateShiftTypes: (
    patches: Record<string, Partial<ShiftType>>,
    workRoutineProfiles?: WorkRoutineProfiles,
  ) => Promise<boolean>;
  updatePayrollSettings: (settings: PayrollSettings) => Promise<boolean>;
  dismissPlayUpdate: (versionCode: number) => Promise<boolean>;
  setThemeMode: (themeMode: ThemeMode) => void;
  toggleWidgetDisplayOption: (
    option: keyof WidgetDisplayOptions,
  ) => Promise<boolean>;
  completeSetup: (pattern?: RotationPattern) => Promise<boolean>;
  completeInitialSetup: (input: InitialSetupInput) => Promise<boolean>;
  getAlarmStatus: () => Promise<AlarmPyoAlarmStatus>;
  requestAlarmAccess: () => Promise<boolean>;
  resyncAlarms: (force?: boolean) => Promise<boolean>;
  enableAlarms: () => Promise<boolean>;
  disableAlarms: () => Promise<boolean>;
  setSleepReminderEnabled: (enabled: boolean) => Promise<boolean>;
  sendTestAlarm: () => Promise<boolean>;
  exportData: () => string;
  previewImportData: (raw: string) => AppDataImportPreview;
  importData: (preview: AppDataImportPreview) => Promise<boolean>;
  exportSharedWorkSettings: () => string;
  previewSharedWorkSettings: (raw: string) => WorkSettingsSharePreview;
  applySharedWorkSettings: (
    preview: WorkSettingsSharePreview,
  ) => Promise<WorkSettingsApplyResult>;
  createBackup: () => Promise<string>;
  createBackupBeforeReset: () => Promise<string>;
  getLatestBackupPreview: () => Promise<AppDataImportPreview | null>;
  getPendingRestoreBackupPreview: () => Promise<PendingRestoreBackupPreview | null>;
  getRecoveryBackupPreview: () => Promise<AppDataImportPreview | null>;
  restoreLatestBackup: () => Promise<LatestBackupRestoreResult>;
  retryPendingRestoreBackup: (
    allowUnverified?: boolean,
  ) => Promise<PendingRestoreBackupRetryResult>;
  restoreRecoveryBackup: () => Promise<boolean>;
  startFreshAfterLoadError: () => Promise<boolean>;
  resetAllData: () => Promise<boolean>;
  resetAllDataDetailed: () => Promise<ResetAllDataResult>;
};

export type AppStoreDataState = Pick<
  AppStore,
  'data' | 'ready' | 'getShiftForDate' | 'getNoteForDate'
>;

export type AppStoreStatusState = Pick<
  AppStore,
  | 'loadError'
  | 'loadFailureReason'
  | 'saveStatus'
  | 'saveOutcome'
  | 'saveError'
  | 'saveSuccessRevision'
  | 'alarmSyncStatus'
  | 'alarmSyncError'
  | 'sleepReminderSyncStatus'
  | 'sleepReminderSyncError'
  | 'sleepReminderSyncRevision'
  | 'corruptBackupKey'
  | 'alarmAutoCheckState'
>;

export type AppStoreActions = Omit<
  AppStore,
  keyof AppStoreDataState | keyof AppStoreStatusState
>;
