import { describe, expect, it, vi } from 'vitest';

import {
  createDataSettingsController,
  isExternalBackupReminderDue,
} from './data-settings-controller';

const unusedFileOperations = {} as Parameters<
  typeof createDataSettingsController
>[0]['files'];

describe('data settings controller', () => {
  it('validates the auxiliary export-attempt timestamp', async () => {
    const storage = {
      getItem: vi.fn(async () => '2026-08-21T03:04:05.000Z'),
      setItem: vi.fn(async () => undefined),
    };
    const controller = createDataSettingsController({
      storage,
      clock: { now: () => new Date('2026-08-21T04:05:06.000Z') },
      files: unusedFileOperations,
    });

    await expect(controller.readLastBackupExportAttemptAt()).resolves.toBe(
      '2026-08-21T03:04:05.000Z',
    );
    storage.getItem.mockResolvedValueOnce('invalid');
    await expect(controller.readLastBackupExportAttemptAt()).resolves.toBeNull();
  });

  it('keeps export success independent from auxiliary timestamp storage', async () => {
    const storage = {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => {
        throw new Error('full');
      }),
    };
    const controller = createDataSettingsController({
      storage,
      clock: { now: () => new Date('2026-08-21T04:05:06.000Z') },
      files: unusedFileOperations,
    });

    await expect(controller.recordBackupExportAttempt()).resolves.toBe(
      '2026-08-21T04:05:06.000Z',
    );
  });
});

describe('외부 백업 확인 안내', () => {
  const now = new Date('2026-08-24T00:00:00.000Z');

  it('기록이 없거나 30일이 지나면 조용한 안내를 보여줘요', () => {
    expect(isExternalBackupReminderDue(null, now)).toBe(true);
    expect(
      isExternalBackupReminderDue('2026-07-25T00:00:00.000Z', now),
    ).toBe(true);
  });

  it('최근에 백업 화면을 연 경우에는 다시 재촉하지 않아요', () => {
    expect(
      isExternalBackupReminderDue('2026-08-23T00:00:00.000Z', now),
    ).toBe(false);
  });

  it('손상된 기록은 없는 기록처럼 처리해요', () => {
    expect(isExternalBackupReminderDue('invalid', now)).toBe(true);
  });
});
