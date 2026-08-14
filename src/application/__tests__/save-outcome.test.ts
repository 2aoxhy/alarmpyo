import { describe, expect, it } from 'vitest';

import {
  clearSaveIssue,
  clearSaveIssuesByRetryAction,
  createSavedOutcome,
  createSaveIssueOutcome,
  executeSaveRetryAction,
  getSaveRetryActions,
  mergeSaveIssue,
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
        issues: [{ status, issueCode, message: '확인해 주세요.', retryAction }],
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

    const visible = resolveVisibleSaveOutcome({
      alarmSyncError: '알람 실패',
      alarmSyncFailed: true,
      saveOutcome,
    });
    expect(visible).toMatchObject({
      issueCode: 'device-backup-failed',
      message: saveOutcome.message,
    });
    expect(visible?.issues.map((issue) => issue.issueCode)).toEqual([
      'device-backup-failed',
      'alarm-sync-failed',
    ]);
  });

  it('저장이 끝난 뒤 알람 오류는 알람 전용 재시도로 연결해요', () => {
    expect(resolveVisibleSaveOutcome({
      alarmSyncError: '알람을 다시 예약하지 못했어요.',
      alarmSyncFailed: true,
      saveOutcome: createSavedOutcome(),
    })).toEqual({
      status: 'partial',
      issues: [{
        status: 'partial',
        issueCode: 'alarm-sync-failed',
        message: '알람을 다시 예약하지 못했어요.',
        retryAction: 'retry-alarms',
      }],
      issueCode: 'alarm-sync-failed',
      message: '알람을 다시 예약하지 못했어요.',
      retryAction: 'retry-alarms',
    });
  });

  it('성공 상태이고 알람 오류도 없으면 배너를 만들지 않아요', () => {
    const success = createSavedOutcome();
    expect(success).toEqual({
      status: 'success',
      issues: [],
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

  it('백업·근무 알람·수면 알림 실패를 코드별로 모두 보존해요', () => {
    const backupFailure = createSaveIssueOutcome(
      'device-backup-failed',
      '기기 백업 실패',
    );
    const withAlarmFailure = mergeSaveIssue(
      backupFailure,
      'alarm-sync-failed',
      '근무 알람 실패',
    );
    const combined = mergeSaveIssue(
      withAlarmFailure,
      'sleep-reminder-sync-failed',
      '수면 알림 실패',
    );

    expect(combined.issues.map((issue) => issue.issueCode)).toEqual([
      'device-backup-failed',
      'alarm-sync-failed',
      'sleep-reminder-sync-failed',
    ]);
    expect(combined).toMatchObject({
      status: 'partial',
      issueCode: 'device-backup-failed',
      message: '기기 백업 실패',
      retryAction: 'retry-save',
    });
    expect(getSaveRetryActions(combined)).toEqual([
      'retry-save',
      'retry-alarms',
      'retry-sleep-reminders',
    ]);
  });

  it('한 작업의 재시도 성공은 다른 작업의 오류를 지우지 않아요', () => {
    const combined = mergeSaveIssue(
      mergeSaveIssue(
        createSaveIssueOutcome('device-backup-failed', '기기 백업 실패'),
        'alarm-sync-failed',
        '근무 알람 실패',
      ),
      'sleep-reminder-sync-failed',
      '수면 알림 실패',
    );

    const afterAlarmRetry = clearSaveIssuesByRetryAction(
      combined,
      'retry-alarms',
    );
    expect(afterAlarmRetry.issues.map((issue) => issue.issueCode)).toEqual([
      'device-backup-failed',
      'sleep-reminder-sync-failed',
    ]);
    expect(afterAlarmRetry.issueCode).toBe('device-backup-failed');

    const afterBackupRetry = clearSaveIssuesByRetryAction(
      afterAlarmRetry,
      'retry-save',
    );
    expect(afterBackupRetry.issues.map((issue) => issue.issueCode)).toEqual([
      'sleep-reminder-sync-failed',
    ]);
    expect(afterBackupRetry.issueCode).toBe('sleep-reminder-sync-failed');
  });

  it('같은 저장 재시도로 복구하는 후속 오류도 코드별로 보존해요', () => {
    const combined = mergeSaveIssue(
      createSaveIssueOutcome('device-backup-failed', '기기 백업 실패'),
      'reset-marker-cleanup-failed',
      '초기화 상태 정리 실패',
    );

    expect(combined.issues.map((issue) => issue.issueCode)).toEqual([
      'device-backup-failed',
      'reset-marker-cleanup-failed',
    ]);
    expect(getSaveRetryActions(combined)).toEqual(['retry-save']);
  });

  it('같은 오류 코드를 다시 기록하면 위치는 유지하고 최신 메시지로 바꿔요', () => {
    const first = mergeSaveIssue(
      createSaveIssueOutcome('alarm-sync-failed', '첫 오류'),
      'sleep-reminder-sync-failed',
      '수면 오류',
    );
    const updated = mergeSaveIssue(first, 'alarm-sync-failed', '최신 오류');

    expect(updated.issues).toHaveLength(2);
    expect(updated.issues[0]).toMatchObject({
      issueCode: 'alarm-sync-failed',
      message: '최신 오류',
    });
    expect(
      clearSaveIssue(updated, 'alarm-sync-failed').issues.map(
        (issue) => issue.issueCode,
      ),
    ).toEqual(['sleep-reminder-sync-failed']);
  });

  it('별도 알람 상태 오류도 기존 저장 오류와 병합해 보여줘요', () => {
    const visible = resolveVisibleSaveOutcome({
      alarmSyncError: '근무 알람 실패',
      alarmSyncFailed: true,
      saveOutcome: createSaveIssueOutcome(
        'sleep-reminder-sync-failed',
        '수면 알림 실패',
      ),
    });

    expect(visible?.issues.map((issue) => issue.issueCode)).toEqual([
      'alarm-sync-failed',
      'sleep-reminder-sync-failed',
    ]);
  });
});
