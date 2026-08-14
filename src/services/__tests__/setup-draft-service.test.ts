import { describe, expect, it } from 'vitest';

import {
  clearSetupDraft,
  isMeaningfulSetupDraft,
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
  presetId: 'three-team-three-shift',
  sequence: ['day', 'evening', 'night'],
  position: 1,
  referenceDate: '2026-07-17',
  dayStart: '07:00',
  dayEnd: '15:00',
  eveningStart: '15:00',
  eveningEnd: '23:00',
  nightStart: '23:00',
  nightEnd: '07:00',
  alarmsWanted: true,
  editedWorkTimeFields: ['dayStart'],
  confirmedSequenceSignature: 'sequence:v1:day,evening,night',
  confirmedWorkTimeSignature: 'times:v1:day:07:00-15:00|evening:15:00-23:00|night:23:00-07:00',
};

describe('initial setup draft', () => {
  it('round-trips the v4 preset, confirmation signatures, and field edit sources', async () => {
    const storage = new MemoryStorage();
    await writeSetupDraft(draft, storage);
    await expect(readSetupDraft(storage)).resolves.toEqual(draft);
  });

  it('stores an exact weekday custom sequence as an explicit weekday draft', async () => {
    const storage = new MemoryStorage();
    await writeSetupDraft(
      {
        ...draft,
        presetId: 'custom',
        sequence: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
        position: 1,
      },
      storage,
    );

    await expect(readSetupDraft(storage)).resolves.toMatchObject({
      presetId: 'weekday',
      sequence: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
      // 2026-07-17은 금요일이므로 월요일 0 기준 4예요.
      position: 4,
    });
    expect(storage.values.get(SETUP_DRAFT_STORAGE_KEY)).toContain(
      '"presetId":"weekday"',
    );
  });

  it('removes the draft after setup completes', async () => {
    const storage = new MemoryStorage();
    await writeSetupDraft(draft, storage);
    await clearSetupDraft(storage);
    expect(storage.values.has(SETUP_DRAFT_STORAGE_KEY)).toBe(false);
  });

  it.each([
    { version: 1, alarmsWanted: false },
    { version: 2, alarmsWanted: true },
  ])('migrates a legacy v$version rotation draft', async ({ version, alarmsWanted }) => {
    const storage = new MemoryStorage();
    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version,
        step: 2,
        patternKind: 'rotation',
        position: 3,
        referenceDate: '2026-07-17',
        dayStart: '07:00',
        dayEnd: '17:45',
        nightStart: '18:00',
        nightEnd: '06:45',
        alarmsWanted: true,
      }),
    );

    await expect(readSetupDraft(storage)).resolves.toEqual({
      version: SETUP_DRAFT_VERSION,
      step: 3,
      presetId: 'three-team-two-shift',
      sequence: ['day', 'day', 'night', 'night', 'off', 'off'],
      position: 3,
      referenceDate: '2026-07-17',
      dayStart: '07:00',
      dayEnd: '17:45',
      eveningStart: '15:00',
      eveningEnd: '23:00',
      nightStart: '18:00',
      nightEnd: '06:45',
      alarmsWanted,
      editedWorkTimeFields: [
        'dayStart',
        'dayEnd',
        'eveningStart',
        'eveningEnd',
        'nightStart',
        'nightEnd',
      ],
      confirmedSequenceSignature: null,
      confirmedWorkTimeSignature: null,
    });
  });

  it('migrates a v3 draft without replacing any restored work time', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...draft,
        version: 3,
        editedWorkTimeFields: undefined,
        confirmedSequenceSignature: undefined,
        confirmedWorkTimeSignature: undefined,
      }),
    );

    await expect(readSetupDraft(storage)).resolves.toMatchObject({
      version: SETUP_DRAFT_VERSION,
      editedWorkTimeFields: [
        'dayStart',
        'dayEnd',
        'eveningStart',
        'eveningEnd',
        'nightStart',
        'nightEnd',
      ],
      confirmedSequenceSignature: null,
      confirmedWorkTimeSignature: null,
    });
  });

  it('does not treat an untouched v3 placeholder draft as edited input', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...draft,
        version: 3,
        step: 1,
        presetId: null,
        position: null,
        editedWorkTimeFields: undefined,
        confirmedSequenceSignature: undefined,
        confirmedWorkTimeSignature: undefined,
      }),
    );

    const restored = await readSetupDraft(storage);
    expect(restored).toMatchObject({
      editedWorkTimeFields: [],
      presetId: null,
    });
    expect(restored && isMeaningfulSetupDraft(restored)).toBe(false);
  });

  it('migrates a legacy weekday draft without changing its weekday position', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        step: 1,
        patternKind: 'weekday',
        position: 4,
        referenceDate: '2026-07-17',
        dayStart: '08:10',
        dayEnd: '16:40',
        nightStart: '18:00',
        nightEnd: '06:45',
        alarmsWanted: false,
      }),
    );

    await expect(readSetupDraft(storage)).resolves.toMatchObject({
      version: SETUP_DRAFT_VERSION,
      step: 1,
      presetId: 'weekday',
      sequence: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
      position: 4,
      dayStart: '08:10',
      dayEnd: '16:40',
    });
  });

  it('rejects malformed, out-of-range, all-off, and oversized drafts', async () => {
    const storage = new MemoryStorage();
    storage.values.set(SETUP_DRAFT_STORAGE_KEY, '{');
    await expect(readSetupDraft(storage)).resolves.toBeNull();

    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, position: draft.sequence.length }),
    );
    await expect(readSetupDraft(storage)).resolves.toBeNull();

    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, sequence: ['off'], position: 0 }),
    );
    await expect(readSetupDraft(storage)).resolves.toBeNull();

    storage.values.set(
      SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, sequence: Array(43).fill('day'), position: 0 }),
    );
    await expect(readSetupDraft(storage)).resolves.toBeNull();
  });
});
