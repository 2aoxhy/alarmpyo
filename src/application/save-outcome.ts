import type {
  SaveIssue,
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
  'unsafe-alarm-schedule',
]);

const SAVE_ISSUE_PRIORITY: readonly SaveIssueCode[] = [
  'invalid-data',
  'invalid-work-schedule',
  'primary-save-failed',
  'restore-protection-failed',
  'safety-backup-failed',
  'device-backup-failed',
  'reset-marker-cleanup-failed',
  'alarm-sync-failed',
  'unsafe-alarm-schedule',
  'sleep-reminder-sync-failed',
];

const SAVE_ISSUE_PRIORITY_INDEX = new Map(
  SAVE_ISSUE_PRIORITY.map((issueCode, index) => [issueCode, index]),
);

export function resolveSaveRetryAction(
  issueCode: SaveIssueCode,
): SaveRetryAction | null {
  if (
    issueCode === 'invalid-work-schedule' ||
    issueCode === 'unsafe-alarm-schedule'
  ) {
    return null;
  }
  if (issueCode === 'sleep-reminder-sync-failed') {
    return 'retry-sleep-reminders';
  }
  if (issueCode === 'alarm-sync-failed') return 'retry-alarms';
  return 'retry-save';
}

function createSaveIssue(
  issueCode: SaveIssueCode,
  message: string,
): SaveIssue {
  return {
    status: PARTIAL_ISSUES.has(issueCode) ? 'partial' : 'failure',
    issueCode,
    message,
    retryAction: resolveSaveRetryAction(issueCode),
  };
}

function createOutcomeFromIssues(issues: readonly SaveIssue[]): SaveOutcome {
  if (issues.length === 0) return createSavedOutcome();
  const sortedIssues = [...issues].sort(
    (left, right) =>
      (SAVE_ISSUE_PRIORITY_INDEX.get(left.issueCode) ?? Number.MAX_SAFE_INTEGER) -
      (SAVE_ISSUE_PRIORITY_INDEX.get(right.issueCode) ?? Number.MAX_SAFE_INTEGER),
  );
  const primaryIssue = sortedIssues[0];
  return {
    status: sortedIssues.some((issue) => issue.status === 'failure')
      ? 'failure'
      : 'partial',
    issues: sortedIssues,
    issueCode: primaryIssue.issueCode,
    message: primaryIssue.message,
    retryAction: primaryIssue.retryAction,
  };
}

export function createSaveIssueOutcome(
  issueCode: SaveIssueCode,
  message: string,
): SaveIssueOutcome {
  return createOutcomeFromIssues([
    createSaveIssue(issueCode, message),
  ]) as SaveIssueOutcome;
}

export function createSavedOutcome(): SaveOutcome {
  return {
    status: 'success',
    issues: [],
    issueCode: null,
    message: null,
    retryAction: null,
  };
}

/** Adds or replaces one issue without discarding unrelated failures. */
export function mergeSaveIssue(
  outcome: SaveOutcome | null,
  issueCode: SaveIssueCode,
  message: string,
): SaveIssueOutcome {
  const existingIssues = outcome?.issues ?? [];
  return createOutcomeFromIssues([
    ...existingIssues.filter((issue) => issue.issueCode !== issueCode),
    createSaveIssue(issueCode, message),
  ]) as SaveIssueOutcome;
}

/** Clears only the issue that the completed operation actually repaired. */
export function clearSaveIssue(
  outcome: SaveOutcome | null,
  issueCode: SaveIssueCode,
): SaveOutcome {
  return createOutcomeFromIssues(
    (outcome?.issues ?? []).filter((issue) => issue.issueCode !== issueCode),
  );
}

/** Clears the unresolved tasks handled by one retry button. */
export function clearSaveIssuesByRetryAction(
  outcome: SaveOutcome | null,
  retryAction: SaveRetryAction,
): SaveOutcome {
  return createOutcomeFromIssues(
    (outcome?.issues ?? []).filter(
      (issue) => issue.retryAction !== retryAction,
    ),
  );
}

export function hasSaveIssue(
  outcome: SaveOutcome | null,
  issueCode: SaveIssueCode,
): boolean {
  return outcome?.issues.some((issue) => issue.issueCode === issueCode) ?? false;
}

export function getSaveRetryActions(
  outcome: SaveIssueOutcome,
): SaveRetryAction[] {
  return Array.from(
    new Set(
      outcome.issues
        .map((issue) => issue.retryAction)
        .filter((action): action is SaveRetryAction => action !== null),
    ),
  );
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
  const outcome = alarmSyncFailed
    ? mergeSaveIssue(
        saveOutcome,
        'alarm-sync-failed',
        alarmSyncError?.trim() ||
          '변경 내용은 저장되었습니다. 알람만 근무표에 맞춰 다시 예약해야 합니다.',
      )
    : saveOutcome;
  return outcome && outcome.status !== 'success' ? outcome : null;
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
