import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearQuickSetupDraft,
  hasQuickSetupDraft,
  parseQuickSetupDraft,
  QUICK_SETUP_DRAFT_KEY,
  readQuickSetupDraft,
  SETUP_SESSION_DRAFT_KEY,
  writeQuickSetupDraft,
} from './quick-setup-draft-repository';
import type { QuickSetupDraftV1 } from './quick-setup-model';
import { createDefaultAppData } from '../../services/app-data-service';
import { createSetupSessionDraft } from './setup-session-model';

const values = new Map<string, string>();
const storage = {
  getItem: async (key: string) => values.get(key) ?? null,
  removeItem: async (key: string) => {
    values.delete(key);
  },
  setItem: async (key: string, value: string) => {
    values.set(key, value);
  },
};

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

describe('간편 설정 이어하기 저장소', () => {
  beforeEach(() => values.clear());

  it('중단한 단계를 저장하고 다시 읽습니다', async () => {
    await writeQuickSetupDraft(draft, storage);

    await expect(readQuickSetupDraft(storage)).resolves.toEqual(draft);
    await expect(hasQuickSetupDraft(storage)).resolves.toBe(true);
  });

  it('완료하면 이어하기 초안을 제거합니다', async () => {
    await writeQuickSetupDraft(draft, storage);
    await clearQuickSetupDraft(storage);

    await expect(readQuickSetupDraft(storage)).resolves.toBeNull();
    expect(values.has(QUICK_SETUP_DRAFT_KEY)).toBe(false);
  });

  it('V2 통합 세션은 새 키에 저장하고 완료 시 이전 키와 함께 제거합니다', async () => {
    const session = createSetupSessionDraft({
      data: createDefaultAppData('2026-08-24'),
      mode: 'reconfigure',
      today: '2026-08-24',
    });
    values.set(QUICK_SETUP_DRAFT_KEY, JSON.stringify(draft));

    await writeQuickSetupDraft(session, storage);

    expect(values.has(SETUP_SESSION_DRAFT_KEY)).toBe(true);
    await expect(readQuickSetupDraft(storage)).resolves.toEqual(session);
    await clearQuickSetupDraft(storage);
    expect(values.has(SETUP_SESSION_DRAFT_KEY)).toBe(false);
    expect(values.has(QUICK_SETUP_DRAFT_KEY)).toBe(false);
  });

  it('손상되거나 범위를 벗어난 초안은 사용하지 않습니다', () => {
    expect(parseQuickSetupDraft({ ...draft, referenceDate: '2026-02-30' })).toBeNull();
    expect(parseQuickSetupDraft({ ...draft, position: 6 })).toBeNull();
    expect(parseQuickSetupDraft({ ...draft, sequence: ['unknown'] })).toBeNull();
    expect(
      parseQuickSetupDraft({
        ...draft,
        source: 'received-file',
        receivedPreview: null,
      }),
    ).toBeNull();
  });

  it('읽을 수 없는 JSON은 조용히 버립니다', async () => {
    values.set(QUICK_SETUP_DRAFT_KEY, '{');
    await expect(readQuickSetupDraft(storage)).resolves.toBeNull();
  });
});
