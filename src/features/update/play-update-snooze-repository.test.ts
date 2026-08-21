import { describe, expect, it } from 'vitest';

import {
  createPlayUpdatePromptSnooze,
  clearPlayUpdatePromptSnooze,
  isPlayUpdatePromptSnoozed,
  parsePlayUpdatePromptSnooze,
  PLAY_UPDATE_SNOOZE_DURATION_MS,
  PLAY_UPDATE_PROMPT_STORAGE_KEY,
  readPlayUpdatePromptSnooze,
  writePlayUpdatePromptSnooze,
} from './play-update-snooze-repository';

describe('Play 업데이트 24시간 미루기 저장소', () => {
  it('버전과 만료 시각만 허용합니다', () => {
    expect(
      parsePlayUpdatePromptSnooze(
        JSON.stringify({ versionCode: 15, snoozedUntil: 123_456 }),
      ),
    ).toEqual({ versionCode: 15, snoozedUntil: 123_456 });
    expect(parsePlayUpdatePromptSnooze('{')).toBeNull();
    expect(
      parsePlayUpdatePromptSnooze(
        JSON.stringify({ versionCode: 0, snoozedUntil: 123_456 }),
      ),
    ).toBeNull();
  });

  it('정확히 24시간 뒤 만료되고 다른 버전에는 적용되지 않습니다', () => {
    const snooze = createPlayUpdatePromptSnooze(15, 1_000);
    expect(snooze?.snoozedUntil).toBe(1_000 + PLAY_UPDATE_SNOOZE_DURATION_MS);
    expect(isPlayUpdatePromptSnoozed(snooze, 15, 1_001)).toBe(true);
    expect(
      isPlayUpdatePromptSnoozed(
        snooze,
        15,
        1_000 + PLAY_UPDATE_SNOOZE_DURATION_MS,
      ),
    ).toBe(false);
    expect(isPlayUpdatePromptSnoozed(snooze, 16, 1_001)).toBe(false);
  });

  it('AppData와 다른 기기 로컬 키에서 독립적으로 읽고 지웁니다', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    };
    const snooze = createPlayUpdatePromptSnooze(15, 1_000)!;
    expect(await writePlayUpdatePromptSnooze(snooze, storage)).toBe(true);
    expect(values.has(PLAY_UPDATE_PROMPT_STORAGE_KEY)).toBe(true);
    expect(await readPlayUpdatePromptSnooze(storage)).toEqual(snooze);
    await clearPlayUpdatePromptSnooze(storage);
    expect(values.has(PLAY_UPDATE_PROMPT_STORAGE_KEY)).toBe(false);
  });
});
