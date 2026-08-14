import { describe, expect, it } from 'vitest';

import { SETUP_DRAFT_STORAGE_KEY } from '../setup-draft-service';
import {
  clearResetCleanupJournal,
  prepareResetCleanupJournal,
  RESET_CLEANUP_JOURNAL_STORAGE_KEY,
  resumeResetCleanupJournal,
} from '../reset-cleanup-journal-service';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const events: string[] = [];
  return {
    values,
    events,
    storage: {
      getItem: async (key: string) => {
        events.push(`get:${key}`);
        return values.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        events.push(`set:${key}`);
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        events.push(`remove:${key}`);
        values.delete(key);
      },
    },
  };
}

describe('전체 초기화 후속 정리 저널', () => {
  it('본문 저장 전에 이전 설정 초안과 정리 대상을 기록해요', async () => {
    const fixture = createStorage({ [SETUP_DRAFT_STORAGE_KEY]: 'old-draft' });

    await prepareResetCleanupJournal('reset-snapshot', fixture.storage);

    const journal = JSON.parse(
      fixture.values.get(RESET_CLEANUP_JOURNAL_STORAGE_KEY) ?? '{}',
    ) as Record<string, unknown>;
    expect(journal).toMatchObject({
      targetSnapshot: 'reset-snapshot',
      setupDraftBeforeReset: 'old-draft',
      pending: { setupDraft: true, quickTimer: true },
    });
  });

  it('초기화 본문이 저장된 뒤 타이머와 이전 초안을 정리하고 저널을 지워요', async () => {
    const fixture = createStorage({ [SETUP_DRAFT_STORAGE_KEY]: 'old-draft' });
    const events = fixture.events;
    await prepareResetCleanupJournal('reset-snapshot', fixture.storage);
    events.length = 0;

    const result = await resumeResetCleanupJournal({
      persistedSnapshot: 'reset-snapshot',
      cancelTimer: async () => {
        events.push('timer:cancel');
      },
      storage: fixture.storage,
    });

    expect(result.completed).toBe(true);
    expect(events.indexOf('timer:cancel')).toBeGreaterThanOrEqual(0);
    expect(fixture.values.has(SETUP_DRAFT_STORAGE_KEY)).toBe(false);
    expect(fixture.values.has(RESET_CLEANUP_JOURNAL_STORAGE_KEY)).toBe(false);
  });

  it('본문 저장 전에 중단되면 타이머와 초안을 건드리지 않고 저널만 폐기해요', async () => {
    const fixture = createStorage({ [SETUP_DRAFT_STORAGE_KEY]: 'old-draft' });
    let timerCancelled = false;
    await prepareResetCleanupJournal('reset-snapshot', fixture.storage);

    const result = await resumeResetCleanupJournal({
      persistedSnapshot: 'original-snapshot',
      cancelTimer: async () => {
        timerCancelled = true;
      },
      storage: fixture.storage,
    });

    expect(result).toMatchObject({ completed: true, stale: true });
    expect(timerCancelled).toBe(false);
    expect(fixture.values.get(SETUP_DRAFT_STORAGE_KEY)).toBe('old-draft');
  });

  it('본문 저장 뒤 중단되면 다음 실행에서 남은 타이머 취소를 재시도해요', async () => {
    const fixture = createStorage({ [SETUP_DRAFT_STORAGE_KEY]: 'old-draft' });
    await prepareResetCleanupJournal('reset-snapshot', fixture.storage);
    let attempts = 0;

    const first = await resumeResetCleanupJournal({
      persistedSnapshot: 'reset-snapshot',
      cancelTimer: async () => {
        attempts += 1;
        throw new Error('native unavailable');
      },
      storage: fixture.storage,
    });
    expect(first).toMatchObject({
      completed: false,
      pendingQuickTimer: true,
      pendingSetupDraft: false,
    });

    const second = await resumeResetCleanupJournal({
      persistedSnapshot: 'reset-snapshot',
      cancelTimer: async () => {
        attempts += 1;
      },
      storage: fixture.storage,
    });
    expect(second.completed).toBe(true);
    expect(attempts).toBe(2);
  });

  it('이미 지운 이전 초안 대신 새로 작성한 초안은 보존해요', async () => {
    const fixture = createStorage({ [SETUP_DRAFT_STORAGE_KEY]: 'old-draft' });
    await prepareResetCleanupJournal('reset-snapshot', fixture.storage);
    fixture.values.set(SETUP_DRAFT_STORAGE_KEY, 'new-draft');

    const result = await resumeResetCleanupJournal({
      persistedSnapshot: 'reset-snapshot',
      cancelTimer: async () => undefined,
      storage: fixture.storage,
    });

    expect(result.completed).toBe(true);
    expect(fixture.values.get(SETUP_DRAFT_STORAGE_KEY)).toBe('new-draft');
  });

  it('명시적 초기화 fallback으로 본문을 복구한 경우에도 정리를 완료해요', async () => {
    const fixture = createStorage({ [SETUP_DRAFT_STORAGE_KEY]: 'old-draft' });
    await prepareResetCleanupJournal('reset-snapshot', fixture.storage);

    const result = await resumeResetCleanupJournal({
      persistedSnapshot: null,
      resetFallbackLoaded: true,
      cancelTimer: async () => undefined,
      storage: fixture.storage,
    });

    expect(result.completed).toBe(true);
  });

  it('명시적으로 저널을 지울 수 있어요', async () => {
    const fixture = createStorage();
    await prepareResetCleanupJournal('reset-snapshot', fixture.storage);

    await clearResetCleanupJournal(fixture.storage);

    expect(fixture.values.has(RESET_CLEANUP_JOURNAL_STORAGE_KEY)).toBe(false);
  });
});
