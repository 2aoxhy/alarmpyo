import { describe, expect, it } from 'vitest';

import {
  createDefaultAppData,
  exportAppDataToJson,
  previewAppDataImport,
  serializeAppData,
} from '../app-data-service';
import { MAX_APP_DATA_BYTES } from '../backup-file-policy';
import {
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_LAST_KNOWN_GOOD_KEY,
  APP_DATA_PENDING_RESTORE_BACKUP_KEY,
  APP_DATA_STORAGE_KEY,
  createLatestStorageValueCoordinator,
  createSerializedStorageWriter,
  findMatchingLastKnownGoodSnapshot,
  getSnapshotPersistenceOutcome,
  persistSnapshotWithLastKnownGood,
  protectPendingRestoreBackupBeforeDataChange,
  readPendingRestoreBackup,
  reconcilePendingRestoreBackup,
  retryPendingRestoreBackupCommit,
  restoreWithAutomaticBackupCommit,
  type StorageAdapter,
} from '../app-storage-service';

class ControlledStorage implements StorageAdapter {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  readonly removals: string[] = [];
  readonly failedWriteKeys = new Set<string>();
  readonly failWriteAfter = new Map<string, number>();
  readonly failedReadKeys = new Set<string>();
  readonly failedRemoveKeys = new Set<string>();
  readonly successfulWriteCounts = new Map<string, number>();

  async getItem(key: string): Promise<string | null> {
    if (this.failedReadKeys.has(key)) throw new Error('읽기 실패');
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes.push(key);
    if (this.failedWriteKeys.has(key)) throw new Error('쓰기 실패');
    const successfulWrites = this.successfulWriteCounts.get(key) ?? 0;
    const allowedWrites = this.failWriteAfter.get(key);
    if (allowedWrites !== undefined && successfulWrites >= allowedWrites) {
      throw new Error('쓰기 실패');
    }
    this.values.set(key, value);
    this.successfulWriteCounts.set(key, successfulWrites + 1);
  }

  async removeItem(key: string): Promise<void> {
    this.removals.push(key);
    if (this.failedRemoveKeys.has(key)) throw new Error('삭제 실패');
    this.values.delete(key);
  }
}

describe('본문과 최근 정상 저장본 저장', () => {
  it('본문만 저장되면 부분 실패이고 성공 안내는 하지 않아요', async () => {
    const storage = new ControlledStorage();
    storage.failedWriteKeys.add(APP_DATA_LAST_KNOWN_GOOD_KEY);
    const writer = createSerializedStorageWriter(storage);
    const coordinator = createLatestStorageValueCoordinator(writer, APP_DATA_STORAGE_KEY);
    const snapshot = serializeAppData(createDefaultAppData('2026-07-14'));

    const result = await persistSnapshotWithLastKnownGood(
      coordinator,
      writer,
      snapshot,
      null,
      { now: new Date('2026-07-14T00:00:00.000Z') },
    );

    expect(result).toMatchObject({
      primarySaved: true,
      lastKnownGoodSaved: false,
      operationSucceeded: true,
      announceSuccess: false,
      partialFailure: true,
      persistedSnapshot: snapshot,
      lastKnownGoodSnapshot: null,
    });
    expect(storage.values.get(APP_DATA_STORAGE_KEY)).toBe(snapshot);
    expect(storage.values.has(APP_DATA_LAST_KNOWN_GOOD_KEY)).toBe(false);
  });

  it('본문 저장이 실패하면 최근 정상 저장본을 쓰지 않아요', async () => {
    const storage = new ControlledStorage();
    storage.failedWriteKeys.add(APP_DATA_STORAGE_KEY);
    const writer = createSerializedStorageWriter(storage);
    const coordinator = createLatestStorageValueCoordinator(writer, APP_DATA_STORAGE_KEY);
    const snapshot = serializeAppData(createDefaultAppData('2026-07-14'));

    const result = await persistSnapshotWithLastKnownGood(
      coordinator,
      writer,
      snapshot,
      null,
    );

    expect(result).toMatchObject(getSnapshotPersistenceOutcome(false, false));
    expect(storage.writes).toEqual([APP_DATA_STORAGE_KEY]);
    expect(storage.values.has(APP_DATA_LAST_KNOWN_GOOD_KEY)).toBe(false);
  });

  it('이미 같은 본문과 최근 정상 저장본이 있으면 다시 쓰지 않아요', async () => {
    const storage = new ControlledStorage();
    const writer = createSerializedStorageWriter(storage);
    const coordinator = createLatestStorageValueCoordinator(writer, APP_DATA_STORAGE_KEY);
    const snapshot = serializeAppData(createDefaultAppData('2026-07-14'));
    coordinator.setPersistedValue(snapshot);

    const result = await persistSnapshotWithLastKnownGood(
      coordinator,
      writer,
      snapshot,
      snapshot,
    );

    expect(result).toMatchObject(getSnapshotPersistenceOutcome(true, true));
    expect(storage.writes).toEqual([]);
  });

  it('본문은 상한 이하여도 안전 백업이 상한을 넘으면 쓰기 전에 함께 거부해요', async () => {
    const storage = new ControlledStorage();
    const writer = createSerializedStorageWriter(storage);
    const coordinator = createLatestStorageValueCoordinator(writer, APP_DATA_STORAGE_KEY);
    const data = createDefaultAppData('2026-07-14');
    const dateKeys = Array.from({ length: 42 }, (_, index) =>
      new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    );
    for (const dateKey of dateKeys.slice(0, -1)) {
      data.notes[dateKey] = 'a'.repeat(100_000);
    }
    data.notes[dateKeys.at(-1)!] = '';
    const baseSnapshot = serializeAppData(data);
    const remainingBytes = MAX_APP_DATA_BYTES - new TextEncoder().encode(baseSnapshot).length;
    expect(remainingBytes).toBeGreaterThan(0);
    expect(remainingBytes).toBeLessThanOrEqual(100_000);
    data.notes[dateKeys.at(-1)!] = 'a'.repeat(remainingBytes);
    const snapshot = serializeAppData(data);

    expect(new TextEncoder().encode(snapshot)).toHaveLength(MAX_APP_DATA_BYTES);
    expect(
      new TextEncoder().encode(
        exportAppDataToJson(data, new Date('2026-07-14T00:00:00.000Z'), {
          pretty: false,
        }),
      ).length,
    ).toBeGreaterThan(MAX_APP_DATA_BYTES);

    const result = await persistSnapshotWithLastKnownGood(
      coordinator,
      writer,
      snapshot,
      null,
      { now: new Date('2026-07-14T00:00:00.000Z') },
    );

    expect(result.primarySaved).toBe(false);
    expect(storage.writes).toEqual([]);
  });
});

describe('콜드 시작 최근 정상 저장본 확인', () => {
  it('현재 본문과 같은 정상 백업은 기존 스냅샷으로 인식해요', async () => {
    const storage = new ControlledStorage();
    const data = createDefaultAppData('2026-07-14');
    const snapshot = serializeAppData(data);
    storage.values.set(
      APP_DATA_LAST_KNOWN_GOOD_KEY,
      exportAppDataToJson(data, new Date('2026-07-14T00:00:00.000Z')),
    );

    await expect(
      findMatchingLastKnownGoodSnapshot(storage, snapshot),
    ).resolves.toBe(snapshot);
  });

  it('백업이 없거나 손상·불일치·읽기 실패면 새 백업 생성 대상으로 남겨요', async () => {
    const snapshot = serializeAppData(createDefaultAppData('2026-07-14'));

    const missing = new ControlledStorage();
    await expect(findMatchingLastKnownGoodSnapshot(missing, snapshot)).resolves.toBeNull();

    const corrupted = new ControlledStorage();
    corrupted.values.set(APP_DATA_LAST_KNOWN_GOOD_KEY, '{"broken":');
    await expect(findMatchingLastKnownGoodSnapshot(corrupted, snapshot)).resolves.toBeNull();

    const mismatched = new ControlledStorage();
    mismatched.values.set(
      APP_DATA_LAST_KNOWN_GOOD_KEY,
      exportAppDataToJson(createDefaultAppData('2026-07-13')),
    );
    await expect(findMatchingLastKnownGoodSnapshot(mismatched, snapshot)).resolves.toBeNull();

    const unreadable = new ControlledStorage();
    unreadable.failedReadKeys.add(APP_DATA_LAST_KNOWN_GOOD_KEY);
    await expect(findMatchingLastKnownGoodSnapshot(unreadable, snapshot)).resolves.toBeNull();
  });
});

describe('최근 자동 백업 복원 순서', () => {
  const now = new Date('2026-07-14T00:00:00.000Z');

  it('복원 전 스냅샷을 준비하지 못하면 본문 복원을 시작하지 않아요', async () => {
    const storage = new ControlledStorage();
    const originalBackup = exportAppDataToJson(createDefaultAppData('2026-07-11'));
    storage.values.set(APP_DATA_AUTOMATIC_BACKUP_KEY, originalBackup);
    storage.failedWriteKeys.add(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
    const writer = createSerializedStorageWriter(storage);
    let restoreCalls = 0;

    const result = await restoreWithAutomaticBackupCommit(
      writer,
      createDefaultAppData('2026-07-14'),
      createDefaultAppData('2026-07-11'),
      async () => {
        restoreCalls += 1;
        return { primarySaved: true, operationSucceeded: true };
      },
      now,
    );

    expect(result).toEqual({
      restoreStarted: false,
      restoreResult: null,
      automaticBackupSaved: false,
      pendingBackupAvailable: false,
    });
    expect(restoreCalls).toBe(0);
    expect(storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY)).toBe(originalBackup);
  });

  it('본문 복원이 실패하면 원본 자동 백업을 유지하고 pending을 정리해요', async () => {
    const storage = new ControlledStorage();
    const originalBackup = exportAppDataToJson(createDefaultAppData('2026-07-11'));
    storage.values.set(APP_DATA_AUTOMATIC_BACKUP_KEY, originalBackup);
    const writer = createSerializedStorageWriter(storage);

    const result = await restoreWithAutomaticBackupCommit(
      writer,
      createDefaultAppData('2026-07-14'),
      createDefaultAppData('2026-07-11'),
      async () => ({ primarySaved: false, operationSucceeded: false }),
      now,
    );

    expect(result).toEqual({
      restoreStarted: true,
      restoreResult: { primarySaved: false, operationSucceeded: false },
      automaticBackupSaved: false,
      pendingBackupAvailable: false,
    });
    expect(storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY)).toBe(originalBackup);
    expect(storage.values.has(APP_DATA_PENDING_RESTORE_BACKUP_KEY)).toBe(false);
  });

  it('본문 복원과 자동 백업이 모두 성공하면 복원 전 상태를 승격하고 pending을 지워요', async () => {
    const storage = new ControlledStorage();
    const current = createDefaultAppData('2026-07-14');
    const target = createDefaultAppData('2026-07-11');
    const writer = createSerializedStorageWriter(storage);

    const result = await restoreWithAutomaticBackupCommit(
      writer,
      current,
      target,
      async () => ({ primarySaved: true, operationSucceeded: true }),
      now,
    );

    expect(result).toEqual({
      restoreStarted: true,
      restoreResult: { primarySaved: true, operationSucceeded: true },
      automaticBackupSaved: true,
      pendingBackupAvailable: false,
    });
    const saved = storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY);
    expect(saved ? previewAppDataImport(saved).data : null).toEqual(current);
    expect(storage.values.has(APP_DATA_PENDING_RESTORE_BACKUP_KEY)).toBe(false);
  });

  it('자동 백업 승격이 실패하면 별도 pending을 남겨 재시도해요', async () => {
    const storage = new ControlledStorage();
    const source = createDefaultAppData('2026-07-11');
    const current = createDefaultAppData('2026-07-14');
    const originalBackup = exportAppDataToJson(source, new Date('2026-07-11T00:00:00.000Z'));
    storage.values.set(APP_DATA_AUTOMATIC_BACKUP_KEY, originalBackup);
    storage.failedWriteKeys.add(APP_DATA_AUTOMATIC_BACKUP_KEY);
    const writer = createSerializedStorageWriter(storage);

    const result = await restoreWithAutomaticBackupCommit(
      writer,
      current,
      source,
      async () => ({ primarySaved: true, operationSucceeded: true }),
      now,
    );

    expect(result).toMatchObject({
      restoreStarted: true,
      automaticBackupSaved: false,
      pendingBackupAvailable: true,
    });
    expect(storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY)).toBe(originalBackup);
    expect(storage.values.has(APP_DATA_PENDING_RESTORE_BACKUP_KEY)).toBe(true);

    storage.failedWriteKeys.delete(APP_DATA_AUTOMATIC_BACKUP_KEY);
    await expect(readPendingRestoreBackup(storage, source)).resolves.toMatchObject({
      phase: 'committed',
    });
    await expect(
      retryPendingRestoreBackupCommit(storage, writer, source),
    ).resolves.toEqual({ status: 'saved' });

    const retried = storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY);
    expect(retried ? previewAppDataImport(retried).data : null).toEqual(current);
    expect(storage.values.has(APP_DATA_PENDING_RESTORE_BACKUP_KEY)).toBe(false);
    await expect(
      retryPendingRestoreBackupCommit(storage, writer, source),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('재시도가 실패해도 pending 스냅샷을 유지해요', async () => {
    const storage = new ControlledStorage();
    const source = createDefaultAppData('2026-07-11');
    const current = createDefaultAppData('2026-07-14');
    const writer = createSerializedStorageWriter(storage);
    storage.failedWriteKeys.add(APP_DATA_AUTOMATIC_BACKUP_KEY);

    await restoreWithAutomaticBackupCommit(
      writer,
      current,
      source,
      async () => ({ primarySaved: true }),
      now,
    );
    await expect(
      retryPendingRestoreBackupCommit(storage, writer, source),
    ).resolves.toEqual({ status: 'failed' });
    expect(storage.values.has(APP_DATA_PENDING_RESTORE_BACKUP_KEY)).toBe(true);
  });

  it('콜백 예외로 prepared만 남으면 현재 본문과의 관계를 구분해요', async () => {
    const storage = new ControlledStorage();
    const source = createDefaultAppData('2026-07-11');
    const current = createDefaultAppData('2026-07-14');
    const writer = createSerializedStorageWriter(storage);

    const result = await restoreWithAutomaticBackupCommit(
      writer,
      current,
      source,
      async () => {
        throw new Error('복원 콜백 중단');
      },
      now,
    );

    expect(result).toMatchObject({
      restoreStarted: true,
      restoreResult: null,
      pendingBackupAvailable: true,
    });
    await expect(readPendingRestoreBackup(storage, current)).resolves.toMatchObject({
      phase: 'prepared',
      recoveryState: 'source-matched',
    });
    await expect(readPendingRestoreBackup(storage, source)).resolves.toMatchObject({
      phase: 'prepared',
      recoveryState: 'target-matched',
    });
    await expect(
      retryPendingRestoreBackupCommit(storage, writer, current),
    ).resolves.toEqual({ status: 'confirmation-required' });
  });

  it('앱을 다시 실행하면 복원된 본문과 같은 prepared를 committed로 복구해요', async () => {
    const storage = new ControlledStorage();
    const source = createDefaultAppData('2026-07-11');
    const current = createDefaultAppData('2026-07-14');
    const writer = createSerializedStorageWriter(storage);

    await restoreWithAutomaticBackupCommit(
      writer,
      current,
      source,
      async () => {
        throw new Error('프로세스 종료');
      },
      now,
    );

    await expect(
      reconcilePendingRestoreBackup(storage, writer, source),
    ).resolves.toBe(true);
    const editedAfterRestart = {
      ...source,
      notes: { ...source.notes, '2026-07-15': '재시작 후 메모' },
    };
    await expect(
      readPendingRestoreBackup(storage, editedAfterRestart),
    ).resolves.toMatchObject({ phase: 'committed' });
  });

  it('committed 기록과 자동 승격이 연속 실패해도 다음 편집 전에 원본을 확정해요', async () => {
    const storage = new ControlledStorage();
    const target = createDefaultAppData('2026-07-11');
    const original = createDefaultAppData('2026-07-14');
    const writer = createSerializedStorageWriter(storage);
    storage.failWriteAfter.set(APP_DATA_PENDING_RESTORE_BACKUP_KEY, 1);
    storage.failedWriteKeys.add(APP_DATA_AUTOMATIC_BACKUP_KEY);

    const result = await restoreWithAutomaticBackupCommit(
      writer,
      original,
      target,
      async () => ({ primarySaved: true, operationSucceeded: true }),
      now,
    );

    expect(result).toMatchObject({
      restoreStarted: true,
      automaticBackupSaved: false,
      pendingBackupAvailable: true,
    });
    expect(
      JSON.parse(storage.values.get(APP_DATA_PENDING_RESTORE_BACKUP_KEY) ?? '{}'),
    ).toMatchObject({ phase: 'prepared' });
    const protectedBackup = await readPendingRestoreBackup(storage, target);
    expect(protectedBackup).toMatchObject({
      phase: 'prepared',
      recoveryState: 'target-matched',
    });
    expect(
      protectedBackup ? previewAppDataImport(protectedBackup.backup).data : null,
    ).toEqual(original);

    // 앱 재실행 시에도 두 쓰기가 계속 실패하면 prepared 원본을 그대로 유지해요.
    await expect(
      reconcilePendingRestoreBackup(storage, writer, target),
    ).resolves.toBe(true);

    const edited = {
      ...target,
      notes: { ...target.notes, '2026-07-15': '복원 뒤 편집' },
    };
    await expect(
      protectPendingRestoreBackupBeforeDataChange(storage, writer, target, edited),
    ).resolves.toBe(false);
    expect(
      JSON.parse(storage.values.get(APP_DATA_PENDING_RESTORE_BACKUP_KEY) ?? '{}'),
    ).toMatchObject({ phase: 'prepared' });

    // pending 기록이 다시 가능해지면 committed를 먼저 확정한 뒤 편집을 허용해요.
    storage.failWriteAfter.delete(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
    await expect(
      protectPendingRestoreBackupBeforeDataChange(storage, writer, target, edited),
    ).resolves.toBe(true);
    await expect(readPendingRestoreBackup(storage, edited)).resolves.toMatchObject({
      phase: 'committed',
      recoveryState: 'committed',
    });

    storage.failedWriteKeys.delete(APP_DATA_AUTOMATIC_BACKUP_KEY);
    await expect(
      retryPendingRestoreBackupCommit(storage, writer, edited),
    ).resolves.toEqual({ status: 'saved' });
    const automaticBackup = storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY);
    expect(automaticBackup ? previewAppDataImport(automaticBackup).data : null).toEqual(
      original,
    );
    expect(storage.values.has(APP_DATA_PENDING_RESTORE_BACKUP_KEY)).toBe(false);
  });

  it('이미 갈라진 prepared는 현재 자료로 확정하지 않고 확인 후에만 보관해요', async () => {
    const storage = new ControlledStorage();
    const target = createDefaultAppData('2026-07-11');
    const original = createDefaultAppData('2026-07-14');
    const previousAutomatic = exportAppDataToJson(target, now);
    storage.values.set(APP_DATA_AUTOMATIC_BACKUP_KEY, previousAutomatic);
    const writer = createSerializedStorageWriter(storage);

    await restoreWithAutomaticBackupCommit(
      writer,
      original,
      target,
      async () => {
        throw new Error('본문 저장 전에 종료');
      },
      now,
    );
    const unrelatedCurrent = {
      ...original,
      notes: { ...original.notes, '2026-07-16': '별도 편집' },
    };

    await expect(
      readPendingRestoreBackup(storage, unrelatedCurrent),
    ).resolves.toMatchObject({
      phase: 'prepared',
      recoveryState: 'diverged',
    });
    await expect(
      retryPendingRestoreBackupCommit(storage, writer, unrelatedCurrent),
    ).resolves.toEqual({ status: 'confirmation-required' });
    expect(storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY)).toBe(previousAutomatic);

    await expect(
      retryPendingRestoreBackupCommit(storage, writer, unrelatedCurrent, {
        allowUnverified: true,
      }),
    ).resolves.toEqual({ status: 'saved' });
    const preservedOriginal = storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY);
    expect(
      preservedOriginal ? previewAppDataImport(preservedOriginal).data : null,
    ).toEqual(original);
  });

  it('손상된 pending은 자동 백업을 덮어쓰지 않아요', async () => {
    const storage = new ControlledStorage();
    const current = createDefaultAppData('2026-07-14');
    const originalBackup = exportAppDataToJson(current);
    storage.values.set(APP_DATA_AUTOMATIC_BACKUP_KEY, originalBackup);
    storage.values.set(APP_DATA_PENDING_RESTORE_BACKUP_KEY, '{"broken":');
    const writer = createSerializedStorageWriter(storage);

    await expect(
      retryPendingRestoreBackupCommit(storage, writer, current),
    ).resolves.toEqual({ status: 'unavailable' });
    expect(storage.values.get(APP_DATA_AUTOMATIC_BACKUP_KEY)).toBe(originalBackup);
  });
});
