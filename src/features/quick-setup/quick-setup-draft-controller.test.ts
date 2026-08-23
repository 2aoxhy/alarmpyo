import { beforeEach, describe, expect, it } from 'vitest';

import {
  createQuickSetupDraftController,
} from './quick-setup-draft-controller';
import {
  QUICK_SETUP_DRAFT_KEY,
  type QuickSetupDraftStorage,
} from './quick-setup-draft-repository';
import type { QuickSetupDraftV1 } from './quick-setup-model';

const draft: QuickSetupDraftV1 = {
  version: 1,
  source: 'direct',
  step: 'schedule-anchor',
  presetId: 'three-team-two-shift',
  sequence: ['day', 'day', 'night', 'night', 'off', 'off'],
  referenceDate: '2026-08-24',
  position: 1,
  receivedPreview: null,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('간편 설정 초안 controller', () => {
  const values = new Map<string, string>();

  beforeEach(() => values.clear());

  const createStorage = (): QuickSetupDraftStorage => ({
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => {
      values.delete(key);
    },
    setItem: async (key, value) => {
      values.set(key, value);
    },
  });

  it('hydration 전 초기 draft write를 받지 않습니다', async () => {
    values.set(QUICK_SETUP_DRAFT_KEY, JSON.stringify(draft));
    const controller = createQuickSetupDraftController(createStorage());
    const session = controller.createSession();
    const initial = { ...draft, position: 4 };

    await expect(session.write(initial)).resolves.toBe(false);
    await expect(session.hydrate()).resolves.toEqual(draft);
    expect(JSON.parse(values.get(QUICK_SETUP_DRAFT_KEY) ?? 'null')).toEqual(draft);
  });

  it('빠르게 이어진 write를 접수 순서대로 직렬화합니다', async () => {
    const firstWrite = deferred();
    const calls: string[] = [];
    let writeCount = 0;
    const storage = createStorage();
    storage.setItem = async (key, value) => {
      writeCount += 1;
      calls.push(`start-${writeCount}`);
      if (writeCount === 1) await firstWrite.promise;
      values.set(key, value);
      calls.push(`end-${writeCount}`);
    };
    const session = createQuickSetupDraftController(storage).createSession();
    await session.hydrate();

    const first = session.write({ ...draft, position: 2 });
    const second = session.write({ ...draft, position: 3 });
    await Promise.resolve();
    expect(calls).toEqual(['start-1']);

    firstWrite.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(calls).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    expect(JSON.parse(values.get(QUICK_SETUP_DRAFT_KEY) ?? 'null').position).toBe(3);
  });

  it('느린 write 뒤에 clear하고 완료 이후 write로 되살리지 않습니다', async () => {
    const slowWrite = deferred();
    const operations: string[] = [];
    const storage = createStorage();
    storage.setItem = async (key, value) => {
      operations.push('write-start');
      await slowWrite.promise;
      values.set(key, value);
      operations.push('write-end');
    };
    storage.removeItem = async (key) => {
      operations.push('clear');
      values.delete(key);
    };
    const session = createQuickSetupDraftController(storage).createSession();
    await session.hydrate();

    const pendingWrite = session.write(draft);
    const completion = session.complete();
    await expect(session.write({ ...draft, position: 3 })).resolves.toBe(false);
    await Promise.resolve();
    expect(operations).toEqual(['write-start']);

    slowWrite.resolve();
    await pendingWrite;
    await completion;
    expect(operations).toEqual(['write-start', 'write-end', 'clear']);
    expect(values.has(QUICK_SETUP_DRAFT_KEY)).toBe(false);
  });

  it('write가 실패해도 완료 clear는 queue에서 계속 실행합니다', async () => {
    values.set(QUICK_SETUP_DRAFT_KEY, JSON.stringify(draft));
    const storage = createStorage();
    storage.setItem = async () => {
      throw new Error('storage full');
    };
    const session = createQuickSetupDraftController(storage).createSession();
    await session.hydrate();

    await expect(session.write(draft)).rejects.toThrow('storage full');
    await expect(session.complete()).resolves.toBeUndefined();
    expect(values.has(QUICK_SETUP_DRAFT_KEY)).toBe(false);
  });

  it('새 세션이 이전 화면의 늦은 write를 거절합니다', async () => {
    const controller = createQuickSetupDraftController(createStorage());
    const previous = controller.createSession();
    await previous.hydrate();
    const current = controller.createSession();
    await current.hydrate();

    await expect(previous.write(draft)).resolves.toBe(false);
    await expect(current.write(draft)).resolves.toBe(true);
  });
});
