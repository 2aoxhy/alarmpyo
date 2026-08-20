import type { AppData } from '../../models/app-data';
import {
  exportAppDataToJson,
  previewAppDataImport,
  serializeAppData,
  tryParseAppDataJson,
} from '../../services/app-data-service';
import {
  getCheckedAppDataContentsByteSize,
  getCheckedBackupContentsByteSize,
} from '../../services/backup-file-policy';
import {
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_LAST_KNOWN_GOOD_KEY,
} from './app-data-storage-keys';
import {
  getSnapshotPersistenceOutcome,
  type SnapshotPersistenceOutcome,
} from './persistence-outcomes';
import type {
  LatestStorageValueCoordinator,
  StorageAdapter,
  StorageWriter,
} from './serialized-storage';

export async function writeAutomaticBackup(
  writer: StorageWriter,
  data: AppData,
  now: Date = new Date(),
): Promise<string> {
  const backup = exportAppDataToJson(data, now, { pretty: false });
  getCheckedBackupContentsByteSize(backup);
  await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, backup);
  return backup;
}

export async function readAutomaticBackup(storage: StorageAdapter): Promise<string | null> {
  try {
    return await storage.getItem(APP_DATA_AUTOMATIC_BACKUP_KEY);
  } catch {
    throw new Error('최근 안전 백업을 불러오지 못했습니다.');
  }
}

export async function writeLastKnownGoodBackup(
  writer: StorageWriter,
  snapshot: string,
  now: Date = new Date(),
): Promise<string> {
  getCheckedAppDataContentsByteSize(snapshot);
  const parsed = tryParseAppDataJson(snapshot);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const backup = exportAppDataToJson(parsed.value.data, now, { pretty: false });
  getCheckedBackupContentsByteSize(backup);
  await writer.write(APP_DATA_LAST_KNOWN_GOOD_KEY, backup);
  return backup;
}

export type PersistSnapshotWithBackupResult = SnapshotPersistenceOutcome & {
  /** 이번 저장 처리에서 본문 내용이 실제로 달라졌는지 나타내요. */
  primaryChanged: boolean;
  persistedSnapshot: string | null;
  lastKnownGoodSnapshot: string | null;
};

/** 본문을 먼저 저장하고 최근 정상 저장본을 별도 단계로 안전하게 갱신해요. */
export async function persistSnapshotWithLastKnownGood(
  coordinator: LatestStorageValueCoordinator,
  writer: StorageWriter,
  snapshot: string,
  lastKnownGoodSnapshot: string | null,
  options?: { force?: boolean; now?: Date },
): Promise<PersistSnapshotWithBackupResult> {
  let preparedBackup: string;
  try {
    getCheckedAppDataContentsByteSize(snapshot);
    const parsed = tryParseAppDataJson(snapshot);
    if (!parsed.ok) throw parsed.error;
    preparedBackup = exportAppDataToJson(parsed.value.data, options?.now, {
      pretty: false,
    });
    // 본문을 쓰기 전에 안전 백업까지 기록 가능한지 함께 확인해
    // 크기 경계에서 본문만 저장되는 부분 성공을 막아요.
    getCheckedBackupContentsByteSize(preparedBackup);
  } catch {
    return {
      ...getSnapshotPersistenceOutcome(false, false),
      primaryChanged: false,
      persistedSnapshot: coordinator.getPersistedValue(),
      lastKnownGoodSnapshot,
    };
  }

  const previousPersistedSnapshot = coordinator.getPersistedValue();
  let persistedSnapshot: string;
  let wrotePrimary: boolean;
  let primaryChanged: boolean;
  try {
    const result = await coordinator.writeLatest(
      snapshot,
      options?.force === true ? { force: true } : undefined,
    );
    const resultChanged = previousPersistedSnapshot !== result.persistedValue;
    if (options?.force && result.persistedValue !== snapshot) {
      return {
        ...getSnapshotPersistenceOutcome(false, false),
        primaryChanged: resultChanged,
        persistedSnapshot: result.persistedValue,
        lastKnownGoodSnapshot,
      };
    }
    persistedSnapshot = result.persistedValue;
    wrotePrimary = result.wrote;
    primaryChanged = resultChanged;
  } catch {
    return {
      ...getSnapshotPersistenceOutcome(false, false),
      primaryChanged: false,
      persistedSnapshot: coordinator.getPersistedValue(),
      lastKnownGoodSnapshot,
    };
  }

  if (!wrotePrimary && lastKnownGoodSnapshot === persistedSnapshot) {
    return {
      ...getSnapshotPersistenceOutcome(true, true),
      primaryChanged,
      persistedSnapshot,
      lastKnownGoodSnapshot,
    };
  }

  try {
    // writeLatest는 더 최신 요청을 합칠 수 있으므로 실제 저장값이 달라졌다면
    // 해당 값으로 안전 백업을 다시 만들고 크기를 확인해요.
    const backup = persistedSnapshot === snapshot
      ? preparedBackup
      : exportAppDataToJson(
          (() => {
            const parsed = tryParseAppDataJson(persistedSnapshot);
            if (!parsed.ok) throw parsed.error;
            return parsed.value.data;
          })(),
          options?.now,
          { pretty: false },
        );
    getCheckedBackupContentsByteSize(backup);
    await writer.write(APP_DATA_LAST_KNOWN_GOOD_KEY, backup);
    return {
      ...getSnapshotPersistenceOutcome(true, true),
      primaryChanged,
      persistedSnapshot,
      lastKnownGoodSnapshot: persistedSnapshot,
    };
  } catch {
    return {
      ...getSnapshotPersistenceOutcome(true, false),
      primaryChanged,
      persistedSnapshot,
      lastKnownGoodSnapshot,
    };
  }
}

export async function readLastKnownGoodBackup(storage: StorageAdapter): Promise<string | null> {
  try {
    return await storage.getItem(APP_DATA_LAST_KNOWN_GOOD_KEY);
  } catch {
    throw new Error('최근 정상 저장본을 불러오지 못했습니다.');
  }
}

/**
 * 최근 정상 저장본이 현재 본문과 같은 자료인지 확인해요.
 * 읽기 실패나 손상은 앱 시작을 막지 않고 새 정상 저장본 생성 대상으로 처리해요.
 */
export async function findMatchingLastKnownGoodSnapshot(
  storage: StorageAdapter,
  persistedSnapshot: string | null,
): Promise<string | null> {
  if (persistedSnapshot === null) return null;

  let raw: string | null;
  try {
    raw = await storage.getItem(APP_DATA_LAST_KNOWN_GOOD_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const backupSnapshot = serializeAppData(previewAppDataImport(raw).data);
    return backupSnapshot === persistedSnapshot ? persistedSnapshot : null;
  } catch {
    return null;
  }
}

/** Falls back from the last-known-good slot to the pre-reset safety backup. */
export async function readRecoveryBackup(
  storage: StorageAdapter,
): Promise<string | null> {
  try {
    const lastKnownGood = await readLastKnownGoodBackup(storage);
    if (lastKnownGood !== null) {
      try {
        previewAppDataImport(lastKnownGood);
        return lastKnownGood;
      } catch {
        // A valid older automatic backup can still recover the app.
      }
    }
  } catch {
    // Continue to the automatic backup when this key cannot be read.
  }

  const automaticBackup = await readAutomaticBackup(storage);
  if (automaticBackup !== null) previewAppDataImport(automaticBackup);
  return automaticBackup;
}
