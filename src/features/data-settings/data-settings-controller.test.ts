import { describe, expect, it, vi } from 'vitest';

import { createDataSettingsController } from './data-settings-controller';

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
