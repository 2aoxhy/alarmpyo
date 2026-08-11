import { describe, expect, it } from 'vitest';

import {
  clearSetupDraft,
  readSetupDraft,
  SETUP_DRAFT_STORAGE_KEY,
  SETUP_DRAFT_VERSION,
  type SetupDraft,
  writeSetupDraft,
} from '../setup-draft-service';

class MemoryStorage {
  values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

const draft: SetupDraft = {
  version: SETUP_DRAFT_VERSION,
  step: 2,
  patternKind: 'rotation',
  position: 3,
  referenceDate: '2026-07-17',
  dayStart: '07:00',
  dayEnd: '17:45',
  nightStart: '18:00',
  nightEnd: '06:45',
  alarmsWanted: true,
};

describe('첫 설정 초안', () => {
  it('앱을 다시 열어도 마지막 단계를 이어갈 수 있게 저장해요', async () => {
    const storage = new MemoryStorage();
    await writeSetupDraft(draft, storage);
    await expect(readSetupDraft(storage)).resolves.toEqual(draft);
  });

  it('완료한 초안을 제거해요', async () => {
    const storage = new MemoryStorage();
    await writeSetupDraft(draft, storage);
    await clearSetupDraft(storage);
    expect(storage.values.has(SETUP_DRAFT_STORAGE_KEY)).toBe(false);
  });

  it('알람이 자동 선택되던 v1 초안은 명시적 선택 전 상태로 옮겨요', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, version: 1, alarmsWanted: true }),
    );

    await expect(readSetupDraft(storage)).resolves.toEqual({
      ...draft,
      alarmsWanted: false,
    });
  });

  it('손상되거나 범위를 벗어난 초안은 사용하지 않아요', async () => {
    const storage = new MemoryStorage();
    storage.values.set(SETUP_DRAFT_STORAGE_KEY, '{');
    await expect(readSetupDraft(storage)).resolves.toBeNull();

    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, position: 12 }),
    );
    await expect(readSetupDraft(storage)).resolves.toBeNull();
  });
});
