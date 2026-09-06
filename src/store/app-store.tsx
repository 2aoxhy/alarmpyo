import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  AppStore,
  AppStoreActions,
  AppStoreDataState,
  AppStoreStatusState,
} from '@/application/app-store-contract';
import type { AppStoreEngine } from '@/application/runtime/app-store-engine';
import type { AppSelectorEquality } from '@/application/runtime/app-selector-source';
import { selectShiftForDate } from '@/application/app-store-selectors';
import { createNativeAppStoreEngine } from '@/infrastructure/runtime/native-app-store-engine';
import { useAppLifecycle } from '@/hooks/use-app-active';
import type { AppData, ShiftType } from '@/models/app-data';
import { createDefaultAppData } from '@/application/app-data-policy';
import { toDateKey } from '@/utils/date';

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
  UpdatePatternResult,
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
export function resolveShiftFromData(data: AppData, dateKey: string): ShiftType | null {
  return selectShiftForDate(data, dateKey);
}

const AppStoreEngineContext = createContext<AppStoreEngine | null>(null);

/** React owns subscriptions and lifecycle attachment; the engine owns all application work. */
export function AppStoreProvider({ children }: PropsWithChildren) {
  const [engine] = useState(createNativeAppStoreEngine);
  const lifecycle = useAppLifecycle();
  useEffect(() => {
    void engine.start();
    return engine.stop;
  }, [engine]);
  useEffect(() => engine.updateLifecycle(lifecycle), [engine, lifecycle]);
  return <AppStoreEngineContext.Provider value={engine}>{children}</AppStoreEngineContext.Provider>;
}

function useEngine(): AppStoreEngine {
  const engine = useContext(AppStoreEngineContext);
  if (!engine) throw new Error('앱 데이터 저장소가 준비되지 않았습니다.');
  return engine;
}

export function useAppSelector<TSelected>(
  selector: (store: AppStore) => TSelected,
  equality: AppSelectorEquality<TSelected> = Object.is,
): TSelected {
  const source = useEngine().selectors;
  const subscription = useMemo(
    () => source.createSubscription(selector, equality),
    [equality, selector, source],
  );
  return useSyncExternalStore(
    subscription.subscribe,
    subscription.getSnapshot,
    subscription.getSnapshot,
  );
}
export function useAppCommands(): AppStoreActions {
  return useEngine().commands;
}
export function useAppRuntimeController() {
  return useEngine().runtime;
}

function shallowEqual<T extends object>(left: T, right: T): boolean {
  const keys = Object.keys(left) as (keyof T)[];
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  );
}
function selectLegacyData(store: AppStore): AppStoreDataState {
  return {
    data: store.data,
    ready: store.ready,
    getShiftForDate: store.getShiftForDate,
    getNoteForDate: store.getNoteForDate,
  };
}
function selectLegacyStatus(store: AppStore): AppStoreStatusState {
  return {
    loadError: store.loadError,
    loadFailureReason: store.loadFailureReason,
    saveStatus: store.saveStatus,
    saveOutcome: store.saveOutcome,
    saveError: store.saveError,
    saveSuccessRevision: store.saveSuccessRevision,
    alarmSyncStatus: store.alarmSyncStatus,
    alarmSyncError: store.alarmSyncError,
    sleepReminderSyncStatus: store.sleepReminderSyncStatus,
    sleepReminderSyncError: store.sleepReminderSyncError,
    sleepReminderSyncRevision: store.sleepReminderSyncRevision,
    corruptBackupKey: store.corruptBackupKey,
    alarmAutoCheckState: store.alarmAutoCheckState,
  };
}
export function useAppStoreData(): AppStoreDataState {
  return useAppSelector(selectLegacyData, shallowEqual);
}
export function useAppStoreStatus(): AppStoreStatusState {
  return useAppSelector(selectLegacyStatus, shallowEqual);
}
export function useAppStoreActions(): AppStoreActions {
  return useAppCommands();
}
export function useAppStore(): AppStore {
  return useAppSelector((store) => store);
}
