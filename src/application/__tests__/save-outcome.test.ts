import { describe, expect, it } from 'vitest';

import {
  createSavedOutcome,
  createSaveIssueOutcome,
  executeSaveRetryAction,
  resolveVisibleSaveOutcome,
} from '../save-outcome';

describe('구조화된 저장 결과', () => {
  it.each([
    ['invalid-data', 'failure', 'retry-save'],
    ['primary-save-failed', 'failure', 'retry-save'],
    ['restore-protection-failed', 'failure', 'retry-save'],
    ['safety-backup-failed', 'partial', 'retry-save'],
    ['device-backup-failed', 'partial', 'retry-save'],
    ['reset-marker-cleanup-failed', 'partial', 'retry-save'],
    ['sleep-reminder-sync-failed', 'partial', 'retry-sleep-reminders'],
    ['alarm-sync-failed', 'partial', 'retry-alarms'],
  ] as const)(
    '%s 원인을 정확한 결과와 재시도로 연결해요',
    (issueCode, status, retryAction) => {
      expect(createSaveIssueOutcome(issueCode, '확인해 주세요.')).toEqual({
        status,
        issueCode,
        message: '확인해 주세요.',
        retryAction,
      });
    },
  );

  it.each([
    ['retry-save', 'save'],
    ['retry-sleep-reminders', 'sleep'],
    ['retry-alarms', 'alarm'],
  ] as const)('%s가 지정된 하위 시스템만 다시 시도해요', async (action, expected) => {
    const calls: string[] = [];
    await executeSaveRetryAction(action, {
      retryAlarms: async () => {
        calls.push('alarm');
        return true;
      },
      retrySave: async () => {
        calls.push('save');
        return true;
      },
      retrySleepReminders: async () => {
        calls.push('sleep');
        return true;
      },
    });
    expect(calls).toEqual([expected]);
  });

  it('저장 오류가 있으면 별도 알람 오류보다 먼저 유지해요', () => {
    const saveOutcome = createSaveIssueOutcome(
      'device-backup-failed',
      '자료는 저장됐지만 기기 백업을 갱신하지 못했어요.',
    );

    expect(resolveVisibleSaveOutcome({
      alarmSyncError: '알람 실패',
      alarmSyncFailed: true,
      saveOutcome,
    })).toBe(saveOutcome);
  });

  it('저장이 끝난 뒤 알람 오류는 알람 전용 재시도로 연결해요', () => {
    expect(resolveVisibleSaveOutcome({
      alarmSyncError: '알람을 다시 예약하지 못했어요.',
      alarmSyncFailed: true,
      saveOutcome: createSavedOutcome(),
    })).toEqual({
      status: 'partial',
      issueCode: 'alarm-sync-failed',
      message: '알람을 다시 예약하지 못했어요.',
      retryAction: 'retry-alarms',
    });
  });

  it('성공 상태이고 알람 오류도 없으면 배너를 만들지 않아요', () => {
    const success = createSavedOutcome();
    expect(success).toEqual({
      status: 'success',
      issueCode: null,
      message: null,
      retryAction: null,
    });
    expect(resolveVisibleSaveOutcome({
      alarmSyncError: null,
      alarmSyncFailed: false,
      saveOutcome: success,
    })).toBeNull();
  });
});
