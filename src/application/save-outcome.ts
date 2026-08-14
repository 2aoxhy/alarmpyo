import type {
  SaveIssueCode,
  SaveIssueOutcome,
  SaveOutcome,
  SaveRetryAction,
} from './app-store-contract';

const PARTIAL_ISSUES = new Set<SaveIssueCode>([
  'safety-backup-failed',
  'device-backup-failed',
  'reset-marker-cleanup-failed',
  'sleep-reminder-sync-failed',
  'alarm-sync-failed',
]);

function resolveRetryAction(issueCode: SaveIssueCode): SaveRetryAction {
  if (issueCode === 'sleep-reminder-sync-failed') {
    return 'retry-sleep-reminders';
  }
  if (issueCode === 'alarm-sync-failed') return 'retry-alarms';
  return 'retry-save';
}

export function createSaveIssueOutcome(
  issueCode: SaveIssueCode,
  message: string,
): SaveIssueOutcome {
  return {
    status: PARTIAL_ISSUES.has(issueCode) ? 'partial' : 'failure',
    issueCode,
    message,
    retryAction: resolveRetryAction(issueCode),
  };
}

export function createSavedOutcome(): SaveOutcome {
  return {
    status: 'success',
    issueCode: null,
    message: null,
    retryAction: null,
  };
}

export function resolveVisibleSaveOutcome({
  alarmSyncError,
  alarmSyncFailed,
  saveOutcome,
}: {
  alarmSyncError: string | null;
  alarmSyncFailed: boolean;
  saveOutcome: SaveOutcome | null;
}): SaveOutcome | null {
  if (saveOutcome && saveOutcome.status !== 'success') return saveOutcome;
  if (!alarmSyncFailed) return null;
  return createSaveIssueOutcome(
    'alarm-sync-failed',
    alarmSyncError?.trim() ||
      '변경 내용은 저장됐어요. 알람만 근무표에 맞춰 다시 예약해 주세요.',
  );
}

export function executeSaveRetryAction(
  action: SaveRetryAction,
  handlers: {
    retryAlarms: () => Promise<boolean>;
    retrySave: () => Promise<boolean>;
    retrySleepReminders: () => Promise<boolean>;
  },
): Promise<boolean> {
  switch (action) {
    case 'retry-alarms':
      return handlers.retryAlarms();
    case 'retry-sleep-reminders':
      return handlers.retrySleepReminders();
    case 'retry-save':
      return handlers.retrySave();
  }
}
