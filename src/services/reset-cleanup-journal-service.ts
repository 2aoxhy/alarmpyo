import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUtf8ByteLength } from '../utils/utf8';
import { SETUP_DRAFT_STORAGE_KEY } from './setup-draft-service';

export const RESET_CLEANUP_JOURNAL_STORAGE_KEY =
  'alarmpyo:reset-cleanup-pending:v1';

const RESET_CLEANUP_JOURNAL_FORMAT = 'alarmpyo-reset-cleanup';
const RESET_CLEANUP_JOURNAL_VERSION = 3 as const;
const MAX_RESET_CLEANUP_JOURNAL_BYTES = 128 * 1024;

type ResetCleanupStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
>;

type ResetCleanupJournal = {
  format: typeof RESET_CLEANUP_JOURNAL_FORMAT;
  version: typeof RESET_CLEANUP_JOURNAL_VERSION;
  targetSnapshot: string;
  setupDraftBeforeReset: string | null;
  pending: {
    alarmRuntime: boolean;
    setupDraft: boolean;
    quickTimer: boolean;
    deviceLocalData: boolean;
  };
};

export type ResetCleanupResumeResult = {
  found: boolean;
  completed: boolean;
  stale: boolean;
  pendingAlarmRuntime: boolean;
  pendingSetupDraft: boolean;
  pendingQuickTimer: boolean;
  pendingDeviceLocalData: boolean;
};

function parseResetCleanupJournal(raw: string | null): ResetCleanupJournal | null {
  if (
    raw === null ||
    raw.length === 0 ||
    getUtf8ByteLength(raw) > MAX_RESET_CLEANUP_JOURNAL_BYTES
  ) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as {
      format?: unknown;
      version?: unknown;
      targetSnapshot?: unknown;
      setupDraftBeforeReset?: unknown;
      pending?: {
        alarmRuntime?: unknown;
        setupDraft?: unknown;
        quickTimer?: unknown;
        deviceLocalData?: unknown;
      };
    };
    if (
      value.format !== RESET_CLEANUP_JOURNAL_FORMAT ||
      (value.version !== 1 &&
        value.version !== 2 &&
        value.version !== RESET_CLEANUP_JOURNAL_VERSION) ||
      typeof value.targetSnapshot !== 'string' ||
      value.targetSnapshot.length === 0 ||
      (value.setupDraftBeforeReset !== null &&
        typeof value.setupDraftBeforeReset !== 'string') ||
      !value.pending ||
      typeof value.pending.setupDraft !== 'boolean' ||
      typeof value.pending.quickTimer !== 'boolean' ||
      (value.version >= 2 &&
        typeof value.pending.alarmRuntime !== 'boolean') ||
      (value.version === RESET_CLEANUP_JOURNAL_VERSION &&
        typeof value.pending.deviceLocalData !== 'boolean')
    ) {
      return null;
    }
    return {
      format: RESET_CLEANUP_JOURNAL_FORMAT,
      version: RESET_CLEANUP_JOURNAL_VERSION,
      targetSnapshot: value.targetSnapshot,
      setupDraftBeforeReset: value.setupDraftBeforeReset,
      pending: {
        alarmRuntime:
          value.version >= 2
            ? value.pending.alarmRuntime === true
            : false,
        setupDraft: value.pending.setupDraft,
        quickTimer: value.pending.quickTimer,
        deviceLocalData:
          value.version === RESET_CLEANUP_JOURNAL_VERSION
            ? value.pending.deviceLocalData === true
            : false,
      },
    };
  } catch {
    return null;
  }
}

async function writeResetCleanupJournal(
  journal: ResetCleanupJournal,
  storage: ResetCleanupStorage,
): Promise<void> {
  await storage.setItem(
    RESET_CLEANUP_JOURNAL_STORAGE_KEY,
    JSON.stringify(journal),
  );
}

export async function prepareResetCleanupJournal(
  targetSnapshot: string,
  storage: ResetCleanupStorage = AsyncStorage,
): Promise<void> {
  if (targetSnapshot.length === 0) {
    throw new Error('초기화 정리 대상을 확인하지 못했습니다.');
  }
  const setupDraftBeforeReset = await storage.getItem(SETUP_DRAFT_STORAGE_KEY);
  await writeResetCleanupJournal(
    {
      format: RESET_CLEANUP_JOURNAL_FORMAT,
      version: RESET_CLEANUP_JOURNAL_VERSION,
      targetSnapshot,
      setupDraftBeforeReset,
      pending: {
        alarmRuntime: true,
        setupDraft: true,
        quickTimer: false,
        deviceLocalData: true,
      },
    },
    storage,
  );
}

export async function clearResetCleanupJournal(
  storage: ResetCleanupStorage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(RESET_CLEANUP_JOURNAL_STORAGE_KEY);
}

export async function resumeResetCleanupJournal({
  persistedSnapshot,
  resetFallbackLoaded = false,
  resetAlarmRuntime,
  cancelTimer,
  clearDeviceLocalData,
  storage = AsyncStorage,
}: {
  persistedSnapshot: string | null;
  resetFallbackLoaded?: boolean;
  resetAlarmRuntime: () => Promise<void>;
  cancelTimer: () => Promise<void>;
  clearDeviceLocalData: () => Promise<void>;
  storage?: ResetCleanupStorage;
}): Promise<ResetCleanupResumeResult> {
  const raw = await storage.getItem(RESET_CLEANUP_JOURNAL_STORAGE_KEY);
  if (raw === null) {
    return {
      found: false,
      completed: true,
      stale: false,
      pendingAlarmRuntime: false,
      pendingSetupDraft: false,
      pendingQuickTimer: false,
      pendingDeviceLocalData: false,
    };
  }
  const journal = parseResetCleanupJournal(raw);
  if (journal === null) {
    return {
      found: true,
      completed: false,
      stale: false,
      pendingAlarmRuntime: true,
      pendingSetupDraft: true,
      pendingQuickTimer: true,
      pendingDeviceLocalData: true,
    };
  }
  if (!resetFallbackLoaded && persistedSnapshot !== journal.targetSnapshot) {
    await clearResetCleanupJournal(storage);
    return {
      found: true,
      completed: true,
      stale: true,
      pendingAlarmRuntime: false,
      pendingSetupDraft: false,
      pendingQuickTimer: false,
      pendingDeviceLocalData: false,
    };
  }

  let pendingAlarmRuntime = journal.pending.alarmRuntime;
  let pendingSetupDraft = journal.pending.setupDraft;
  let pendingQuickTimer = journal.pending.quickTimer;
  let pendingDeviceLocalData = journal.pending.deviceLocalData;

  if (pendingAlarmRuntime) {
    try {
      await resetAlarmRuntime();
      pendingAlarmRuntime = false;
      journal.pending.alarmRuntime = false;
      await writeResetCleanupJournal(journal, storage);
    } catch {
      // 다음 앱 실행에서 근무·수면·타이머와 재생 상태를 함께 다시 정리해요.
    }
  }

  if (pendingQuickTimer) {
    try {
      await cancelTimer();
      pendingQuickTimer = false;
      journal.pending.quickTimer = false;
      await writeResetCleanupJournal(journal, storage);
    } catch {
      // 다른 정리 단계는 계속 시도하고 다음 앱 실행에서 타이머 취소를 재시도해요.
    }
  }

  if (pendingSetupDraft) {
    try {
      const currentDraft = await storage.getItem(SETUP_DRAFT_STORAGE_KEY);
      if (
        currentDraft !== null &&
        currentDraft === journal.setupDraftBeforeReset
      ) {
        await storage.removeItem(SETUP_DRAFT_STORAGE_KEY);
      }
      // 이미 지워졌거나 사용자가 새로 만든 초안이면 새 초안을 보존하고 완료로 처리해요.
      pendingSetupDraft = false;
      journal.pending.setupDraft = false;
      await writeResetCleanupJournal(journal, storage);
    } catch {
      // 다음 앱 실행에서 같은 이전 초안만 안전하게 다시 정리해요.
    }
  }

  if (pendingDeviceLocalData) {
    try {
      await clearDeviceLocalData();
      pendingDeviceLocalData = false;
      journal.pending.deviceLocalData = false;
      await writeResetCleanupJournal(journal, storage);
    } catch {
      // 다음 앱 실행에서 업데이트 안내 상태 정리를 다시 시도해요.
    }
  }

  const completed =
    !pendingAlarmRuntime &&
    !pendingSetupDraft &&
    !pendingQuickTimer &&
    !pendingDeviceLocalData;
  if (completed) {
    try {
      await clearResetCleanupJournal(storage);
    } catch {
      return {
        found: true,
        completed: false,
        stale: false,
        pendingAlarmRuntime: false,
        pendingSetupDraft: false,
        pendingQuickTimer: false,
        pendingDeviceLocalData: false,
      };
    }
  }
  return {
    found: true,
    completed,
    stale: false,
    pendingAlarmRuntime,
    pendingSetupDraft,
    pendingQuickTimer,
    pendingDeviceLocalData,
  };
}
