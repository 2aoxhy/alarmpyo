import { describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../application/app-store-contract';
import { createAppSelectorSource } from '../application/runtime/app-selector-source';
import {
  selectAlarmSyncError,
  selectAlarmSyncFailed,
  selectSaveFailed,
  selectSaveOutcome,
  selectSaveSuccessRevision,
} from './save-feedback-selection';

type State = Pick<AppStore,
  'saveStatus' | 'saveSuccessRevision' | 'alarmSyncStatus' | 'alarmSyncError' | 'saveOutcome' | 'sleepReminderSyncRevision'
>;

describe('저장 안내 구독', () => {
  it('수면 동기화·진행 상태 변경은 저장 안내를 다시 실행하지 않습니다', () => {
    const initial: State = {
      saveStatus: 'idle', saveSuccessRevision: 0, alarmSyncStatus: 'idle',
      alarmSyncError: null, saveOutcome: null, sleepReminderSyncRevision: 0,
    };
    const source = createAppSelectorSource(initial);
    const saveFailure = source.createSubscription(selectSaveFailed);
    const saveSuccess = source.createSubscription(selectSaveSuccessRevision);
    const alarmFailure = source.createSubscription(selectAlarmSyncFailed);
    const alarmError = source.createSubscription(selectAlarmSyncError);
    const saveOutcome = source.createSubscription(selectSaveOutcome);
    const listeners = [saveFailure, saveSuccess, alarmFailure, alarmError, saveOutcome].map((subscription) => {
      const listener = vi.fn();
      subscription.subscribe(listener);
      return listener;
    });
    source.setSnapshot({ ...initial, saveStatus: 'saving', alarmSyncStatus: 'syncing', sleepReminderSyncRevision: 1 });
    for (const listener of listeners) expect(listener).not.toHaveBeenCalled();
    source.setSnapshot({ ...initial, saveStatus: 'saved', saveSuccessRevision: 1 });
    expect(listeners[1]).toHaveBeenCalledOnce();
    source.setSnapshot({ ...initial, saveStatus: 'error', saveSuccessRevision: 1, alarmSyncStatus: 'error', alarmSyncError: '예약 실패' });
    expect(listeners[0]).toHaveBeenCalledOnce();
    expect(listeners[1]).toHaveBeenCalledOnce();
    expect(listeners[2]).toHaveBeenCalledOnce();
    expect(listeners[3]).toHaveBeenCalledOnce();
  });
});
