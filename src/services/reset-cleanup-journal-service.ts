import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUtf8ByteLength } from '../utils/utf8';
import { SETUP_DRAFT_STORAGE_KEY } from './setup-draft-service';

export const RESET_CLEANUP_JOURNAL_STORAGE_KEY =
  'alarmpyo:reset-cleanup-pending:v1';

const RESET_CLEANUP_JOURNAL_FORMAT = 'alarmpyo-reset-cleanup';
const RESET_CLEANUP_JOURNAL_VERSION = 1 as const;
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
    setupDraft: boolean;
    quickTimer: boolean;
  };
};

export type ResetCleanupResumeResult = {
  found: boolean;
  completed: boolean;
  stale: boolean;
  pendingSetupDraft: boolean;
  pendingQuickTimer: boolean;
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
    const value = JSON.parse(raw) as Partial<ResetCleanupJournal>;
    if (
      value.format !== RESET_CLEANUP_JOURNAL_FORMAT ||
      value.version !== RESET_CLEANUP_JOURNAL_VERSION ||
      typeof value.targetSnapshot !== 'string' ||
      value.targetSnapshot.length === 0 ||
      (value.setupDraftBeforeReset !== null &&
        typeof value.setupDraftBeforeReset !== 'string') ||
      !value.pending ||
      typeof value.pending.setupDraft !== 'boolean' ||
      typeof value.pending.quickTimer !== 'boolean'
    ) {
      return null;
    }
    return {
      format: RESET_CLEANUP_JOURNAL_FORMAT,
      version: RESET_CLEANUP_JOURNAL_VERSION,
      targetSnapshot: value.targetSnapshot,
      setupDraftBeforeReset: value.setupDraftBeforeReset,
      pending: {
        setupDraft: value.pending.setupDraft,
        quickTimer: value.pending.quickTimer,
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
    throw new Error('초기화 정리 대상을 확인하지 못했어요.');
  }
  const setupDraftBeforeReset = await storage.getItem(SETUP_DRAFT_STORAGE_KEY);
  await writeResetCleanupJournal(
    {
      format: RESET_CLEANUP_JOURNAL_FORMAT,
      version: RESET_CLEANUP_JOURNAL_VERSION,
      targetSnapshot,
      setupDraftBeforeReset,
      pending: { setupDraft: true, quickTimer: true },
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
  cancelTimer,
  storage = AsyncStorage,
}: {
  persistedSnapshot: string | null;
  resetFallbackLoaded?: boolean;
  cancelTimer: () => Promise<void>;
  storage?: ResetCleanupStorage;
}): Promise<ResetCleanupResumeResult> {
  const raw = await storage.getItem(RESET_CLEANUP_JOURNAL_STORAGE_KEY);
  if (raw === null) {
    return {
      found: false,
      completed: true,
      stale: false,
      pendingSetupDraft: false,
      pendingQuickTimer: false,
    };
  }
  const journal = parseResetCleanupJournal(raw);
  if (journal === null) {
    return {
      found: true,
      completed: false,
      stale: false,
      pendingSetupDraft: true,
      pendingQuickTimer: true,
    };
  }
  if (!resetFallbackLoaded && persistedSnapshot !== journal.targetSnapshot) {
    await clearResetCleanupJournal(storage);
    return {
      found: true,
      completed: true,
      stale: true,
      pendingSetupDraft: false,
      pendingQuickTimer: false,
    };
  }

  let pendingSetupDraft = journal.pending.setupDraft;
  let pendingQuickTimer = journal.pending.quickTimer;

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

  const completed = !pendingSetupDraft && !pendingQuickTimer;
  if (completed) {
    try {
      await clearResetCleanupJournal(storage);
    } catch {
      return {
        found: true,
        completed: false,
        stale: false,
        pendingSetupDraft: false,
        pendingQuickTimer: false,
      };
    }
  }
  return {
    found: true,
    completed,
    stale: false,
    pendingSetupDraft,
    pendingQuickTimer,
  };
}
