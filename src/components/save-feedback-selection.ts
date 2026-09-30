import type { AppStore } from '../application/app-store-contract';

export const selectSaveFailed = (store: Pick<AppStore, 'saveStatus'>) => store.saveStatus === 'error';
export const selectSaveSuccessRevision = (store: Pick<AppStore, 'saveSuccessRevision'>) => store.saveSuccessRevision;
export const selectAlarmSyncFailed = (store: Pick<AppStore, 'alarmSyncStatus'>) => store.alarmSyncStatus === 'error';
export const selectAlarmSyncError = (store: Pick<AppStore, 'alarmSyncError'>) => store.alarmSyncError;
export const selectSaveOutcome = (store: Pick<AppStore, 'saveOutcome'>) => store.saveOutcome;
