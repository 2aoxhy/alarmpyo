import {
  applyCombinedShiftSettings,
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
} from '../../app-store-mutations';
import { createDataReplacementResult } from '../../app-store-persistence';
import {
  selectNoteForDate,
  selectShiftForDate as resolveShiftFromData,
} from '../../app-store-selectors';
import {
  enforceAppDataScheduleSafety,
  type EnforcedScheduleSafety,
} from '../../app-store-schedule-safety';
import type {
  DaySelection,
  InitialSetupInput,
  SetupCommitInput,
  SetupCommitResult,
  UpdatePatternOptions,
  UpdatePatternResult,
} from '../../app-store-contract';
import type {
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
import {
  isValidDayAlarmOverride,
  isScheduleDate,
  pruneInvalidDayAlarmOverrides,
} from '../../app-data-policy';
import { getCheckedBackupContentsByteSize } from '../../../services/backup-file-policy';
import { applyBulkDayChange, type BulkDayChange } from '../../../services/bulk-day-update';
import { markAlarmDisableSyncPending } from '../../../services/alarm-sync-policy';
import {
  exportWorkSettingsToJson,
  previewWorkSettingsImport,
} from '../../../services/work-settings-share-service';
import { isValidWorkRoutineTiming } from '../../../services/work-routine-settings';
import { isValidDateKey } from '../../../utils/date';
import { DAY_EXCEPTION_TYPES } from '../../../utils/day-exception';
import type { AppStoreEngineContext, AppStoreOperations } from './engine-context';

/** Commands operations share the engine transaction and state; they never own a second store. */
export function registerCommandsCoordinator(
  context: AppStoreEngineContext,
  operations: AppStoreOperations,
): void {
  operations.getShiftForDate = (dateKey: string) =>
    resolveShiftFromData(context.state.getSnapshot().data, dateKey);

  operations.getNoteForDate = (dateKey: string) =>
    selectNoteForDate(context.state.getSnapshot().data, dateKey);

  operations.saveDay = async (
    dateKey: string,
    selection: DaySelection,
    note: string,
    timeOverride: Pick<DayTimeOverride, 'startMinutes' | 'endMinutes'> | null = null,
    dayException: DayExceptionType | null = null,
    alarmOverride?: DayAlarmOverride | null,
  ) => {
    if (!context.readyRef.current) return false;
    if (!isValidDateKey(dateKey)) return false;
    if (!isScheduleDate(context.dataRef.current, dateKey)) return false;
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
    const saved = await operations.replaceDataAndPersist((current) => {
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
    return applied && operations.finalizeScheduleMutation(scheduleEnforcement, saved);
  };

  operations.saveDays = async (dateKeys: readonly string[], change: BulkDayChange) => {
    if (!context.readyRef.current) return false;
    let applied = false;
    let scheduleEnforcement: EnforcedScheduleSafety | null = null;
    const saved = await operations.replaceDataAndPersist((current) => {
      const next = applyBulkDayChange(current, dateKeys, change);
      if (!next) return current;
      applied = true;
      scheduleEnforcement = enforceAppDataScheduleSafety(pruneInvalidDayAlarmOverrides(next), {
        focusDateKeys: dateKeys,
      });
      return scheduleEnforcement.data ?? current;
    }, true);
    return applied && operations.finalizeScheduleMutation(scheduleEnforcement, saved);
  };

  operations.updatePatternDetailed = async (
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
      saveOutcome: context.saveOutcomeRef.current,
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
      !hasOnlyKnownShiftTypeIds(context.dataRef.current.shiftTypes, Object.keys(shiftTypePatches))
    ) {
      return failed();
    }
    let scheduleEnforcement: EnforcedScheduleSafety | null = null;
    const result = await context.mutationCoordinator.run(() =>
      operations.replaceDataAndPersistDetailedInternal((current) => {
        const candidate = applyPatternSettings(current, pattern, shiftTypePatches, clearFrom);
        scheduleEnforcement = enforceAppDataScheduleSafety(candidate);
        return scheduleEnforcement.data ?? current;
      }, true),
    );
    const enforced = scheduleEnforcement as EnforcedScheduleSafety | null;
    if (enforced === null || enforced.data === null) {
      operations.reportInvalidWorkSchedule();
      return failed();
    }
    if (result.operationSucceeded) operations.reportUnsafeAlarmSchedule(enforced);
    return { ...result, saveOutcome: context.saveOutcomeRef.current };
  };

  operations.updatePattern = async (
    pattern: RotationPattern,
    shiftTypePatches: Record<string, Partial<ShiftType>> = {},
    options: UpdatePatternOptions = {},
  ) =>
    (await operations.updatePatternDetailed(pattern, shiftTypePatches, options)).operationSucceeded;

  operations.updateShiftTypes = async (
    patches: Record<string, Partial<ShiftType>>,
    workRoutineProfiles?: WorkRoutineProfiles,
  ) => {
    const shiftTypeIds = new Set(Object.keys(patches));
    if (!context.readyRef.current) return false;
    if (
      workRoutineProfiles &&
      (!isValidWorkRoutineTiming(workRoutineProfiles.day) ||
        !isValidWorkRoutineTiming(workRoutineProfiles.evening) ||
        !isValidWorkRoutineTiming(workRoutineProfiles.night))
    ) {
      return false;
    }
    if (!hasOnlyKnownShiftTypeIds(context.dataRef.current.shiftTypes, shiftTypeIds)) {
      return false;
    }
    if (shiftTypeIds.size === 0 && !workRoutineProfiles) return true;
    let compatible = true;
    let scheduleEnforcement: EnforcedScheduleSafety | null = null;
    const saved = await operations.replaceDataAndPersist((current) => {
      const result = applyShiftSettings(current, patches, workRoutineProfiles);
      compatible = result.compatible;
      if (!result.compatible) return current;
      scheduleEnforcement = enforceAppDataScheduleSafety(result.data);
      return scheduleEnforcement.data ?? current;
    }, true);
    return compatible && operations.finalizeScheduleMutation(scheduleEnforcement, saved);
  };

  operations.updateShiftSettings = async (
    patches: Record<string, Partial<ShiftType>>,
    workRoutineProfiles: WorkRoutineProfiles,
    payrollSettings: PayrollSettings,
  ) => {
    const shiftTypeIds = new Set(Object.keys(patches));
    if (!context.readyRef.current) return false;
    if (
      !isValidWorkRoutineTiming(workRoutineProfiles.day) ||
      !isValidWorkRoutineTiming(workRoutineProfiles.evening) ||
      !isValidWorkRoutineTiming(workRoutineProfiles.night) ||
      !hasOnlyKnownShiftTypeIds(context.dataRef.current.shiftTypes, shiftTypeIds)
    ) {
      return false;
    }
    let compatible = true;
    let payrollValid = true;
    let scheduleEnforcement: EnforcedScheduleSafety | null = null;
    const saved = await operations.replaceDataAndPersist((current) => {
      const result = applyCombinedShiftSettings(
        current,
        patches,
        workRoutineProfiles,
        payrollSettings,
      );
      compatible = result.compatible;
      payrollValid = result.payrollValid;
      if (!compatible || !payrollValid) return current;
      scheduleEnforcement = enforceAppDataScheduleSafety(result.data);
      return scheduleEnforcement.data ?? current;
    }, true);
    return (
      compatible && payrollValid && operations.finalizeScheduleMutation(scheduleEnforcement, saved)
    );
  };

  operations.setThemeMode = (themeMode: ThemeMode) => {
    void operations.replaceDataAndPersist((current) => applyThemeMode(current, themeMode));
  };

  operations.updatePayrollSettings = async (settings: PayrollSettings) => {
    if (!context.readyRef.current) return false;
    let valid = true;
    const saved = await operations.replaceDataAndPersist((current) => {
      const result = applyPayrollSettings(current, settings);
      valid = result.valid;
      return result.data;
    });
    return valid && saved;
  };

  operations.dismissPlayUpdate = async (versionCode: number) => {
    if (!context.readyRef.current) return false;
    let valid = true;
    const saved = await operations.replaceDataAndPersist((current) => {
      const next = applyDismissedUpdateVersionCode(current, versionCode);
      valid = next !== null;
      return next ?? current;
    });
    return valid && saved;
  };

  operations.toggleWidgetDisplayOption = async (option: keyof WidgetDisplayOptions) => {
    let validSelection = true;
    const saved = await operations.replaceDataAndPersist((current) => {
      const result = toggleWidgetDisplaySelection(current, option);
      validSelection = result.validSelection;
      return result.data;
    });
    return validSelection && saved;
  };

  operations.completeSetup = async (pattern?: RotationPattern) => {
    if (pattern && pattern.shiftTypeIds.length === 0) return false;
    let scheduleEnforcement: EnforcedScheduleSafety | null = null;
    const saved = await operations.replaceDataAndPersist((current) => {
      const candidate = applySetupCompletion(current, pattern);
      scheduleEnforcement = enforceAppDataScheduleSafety(candidate);
      return scheduleEnforcement.data ?? current;
    }, true);
    return operations.finalizeScheduleMutation(scheduleEnforcement, saved);
  };

  operations.completeInitialSetup = async ({
    pattern,
    notificationsEnabled,
    shiftTypePatches,
  }: InitialSetupInput) => {
    if (pattern.shiftTypeIds.length === 0) return false;
    if (
      !isValidDateKey(pattern.anchorDate) ||
      !isValidDateKey(pattern.scheduleStartDate ?? pattern.anchorDate)
    ) {
      return false;
    }
    if (
      !hasOnlyKnownShiftTypeIds(context.dataRef.current.shiftTypes, Object.keys(shiftTypePatches))
    ) {
      return false;
    }
    let scheduleEnforcement: EnforcedScheduleSafety | null = null;
    const saved = await operations.replaceDataAndPersist((current) => {
      const candidate = applyInitialSetupValues(current, {
        pattern,
        notificationsEnabled,
        shiftTypePatches,
      });
      scheduleEnforcement = enforceAppDataScheduleSafety(candidate);
      return scheduleEnforcement.data ?? current;
    }, true);
    return operations.finalizeScheduleMutation(scheduleEnforcement, saved);
  };

  operations.commitSetup = async ({
    mode,
    pattern,
    notificationsEnabled,
    shiftTypePatches,
  }: SetupCommitInput): Promise<SetupCommitResult> => {
    const failed = (): SetupCommitResult => ({
      primarySaved: false,
      followUpSucceeded: false,
    });
    if (
      pattern.shiftTypeIds.length === 0 ||
      !isValidDateKey(pattern.anchorDate) ||
      !isValidDateKey(pattern.scheduleStartDate ?? pattern.anchorDate) ||
      !hasOnlyKnownShiftTypeIds(context.dataRef.current.shiftTypes, Object.keys(shiftTypePatches))
    ) {
      return failed();
    }
    return context.mutationCoordinator.run(async () => {
      const current = context.dataRef.current;
      if (mode === 'reconfigure') {
        try {
          await context.storage.writeAutomaticBackup(current);
          if (!(await context.runtime.writeBackup(current))) return failed();
        } catch {
          return failed();
        }
      }
      const withSetup =
        mode === 'initial'
          ? applyInitialSetupValues(current, {
              pattern,
              notificationsEnabled,
              shiftTypePatches,
            })
          : {
              ...applyPatternSettings(current, pattern, shiftTypePatches),
              settings: {
                ...current.settings,
                notificationsEnabled,
                ...(!notificationsEnabled ? markAlarmDisableSyncPending(current.settings) : null),
              },
            };
      const enforced = enforceAppDataScheduleSafety(withSetup);
      if (enforced.data === null) {
        operations.reportInvalidWorkSchedule();
        return failed();
      }
      const result = await operations.replaceDataAndPersistDetailedInternal(
        enforced.data,
        true,
        true,
      );
      if (result.primarySaved) operations.reportUnsafeAlarmSchedule(enforced);
      return {
        primarySaved: result.primarySaved,
        followUpSucceeded: result.operationSucceeded && !result.partialFailure,
      };
    });
  };

  operations.exportData = () => {
    if (!context.readyRef.current) throw new Error('근무표를 모두 불러온 뒤 내보낼 수 있습니다.');
    const backup = context.codec.export(context.dataRef.current);
    getCheckedBackupContentsByteSize(backup);
    return backup;
  };

  operations.previewImportData = (raw: string) => {
    getCheckedBackupContentsByteSize(raw);
    return context.codec.previewImport(raw);
  };

  operations.exportSharedWorkSettings = () => {
    if (!context.readyRef.current) throw new Error('근무표를 모두 불러온 뒤 공유할 수 있습니다.');
    return exportWorkSettingsToJson(context.dataRef.current);
  };

  operations.previewSharedWorkSettings = (raw: string) => previewWorkSettingsImport(raw);
}
