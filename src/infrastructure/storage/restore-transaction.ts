import type { AppData } from '../../models/app-data';
import { getUtf8ByteLength } from '../../utils/utf8';
import {
  exportAppDataToJson,
  previewAppDataImport,
  serializeAppData,
  tryParseAppDataJson,
  withoutAlarmRuntimeState,
} from '../../services/app-data-service';
import {
  getCheckedAppDataContentsByteSize,
  getCheckedBackupContentsByteSize,
  MAX_APP_DATA_BYTES,
  MAX_BACKUP_FILE_BYTES,
} from '../../services/backup-file-policy';
import {
  APP_DATA_AUTOMATIC_BACKUP_KEY,
  APP_DATA_PENDING_RESTORE_BACKUP_KEY,
  CLEARED_PENDING_RESTORE_BACKUP,
} from './app-data-storage-keys';
import type { StorageAdapter, StorageWriter } from './serialized-storage';

// A pending document contains both a maximum backup and target snapshot.
export const MAX_PENDING_RESTORE_DOCUMENT_BYTES =
  2 * (MAX_BACKUP_FILE_BYTES + MAX_APP_DATA_BYTES) + 4 * 1024;

function getCheckedPendingRestoreDocumentByteSize(contents: string): number {
  const size = getUtf8ByteLength(contents);
  if (size > MAX_PENDING_RESTORE_DOCUMENT_BYTES) {
    throw new Error('대기 중인 복원 백업 문서가 너무 큽니다.');
  }
  return size;
}

type PendingRestoreBackupPhase = 'prepared' | 'committed';

export type PendingRestoreBackupRecoveryState =
  | 'committed'
  | 'target-matched'
  | 'source-matched'
  | 'diverged';

export type PendingRestoreBackupDocument = {
  format: 'alarmpyo-pending-restore-backup';
  version: 1;
  phase: PendingRestoreBackupPhase;
  createdAt: string;
  backup: string;
  targetSnapshot: string;
};

export type PendingRestoreBackup = PendingRestoreBackupDocument & {
  recoveryState: PendingRestoreBackupRecoveryState;
};

export type RestoreWithAutomaticBackupResult<T> = {
  restoreStarted: boolean;
  restoreResult: T | null;
  automaticBackupSaved: boolean;
  pendingBackupAvailable: boolean;
};

export type PendingRestoreBackupRetryResult =
  | { status: 'saved' }
  | { status: 'unavailable' }
  | { status: 'confirmation-required' }
  | { status: 'failed' };

function normalizedRestoreSnapshot(data: AppData): string {
  return serializeAppData(withoutAlarmRuntimeState(data));
}

function parsePendingRestoreBackup(
  raw: string | null,
): PendingRestoreBackupDocument | null {
  if (raw === null || raw === CLEARED_PENDING_RESTORE_BACKUP) return null;
  try {
    getCheckedPendingRestoreDocumentByteSize(raw);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Partial<PendingRestoreBackupDocument>;
    if (
      candidate.format !== 'alarmpyo-pending-restore-backup' ||
      candidate.version !== 1 ||
      (candidate.phase !== 'prepared' && candidate.phase !== 'committed') ||
      typeof candidate.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(candidate.createdAt)) ||
      typeof candidate.backup !== 'string' ||
      typeof candidate.targetSnapshot !== 'string'
    ) {
      return null;
    }
    getCheckedBackupContentsByteSize(candidate.backup);
    getCheckedAppDataContentsByteSize(candidate.targetSnapshot);
    previewAppDataImport(candidate.backup);
    const target = tryParseAppDataJson(candidate.targetSnapshot);
    if (!target.ok) return null;
    return candidate as PendingRestoreBackupDocument;
  } catch {
    return null;
  }
}

function serializePendingRestoreBackup(
  document: PendingRestoreBackupDocument,
): string {
  getCheckedBackupContentsByteSize(document.backup);
  getCheckedAppDataContentsByteSize(document.targetSnapshot);
  const serialized = JSON.stringify(document);
  getCheckedPendingRestoreDocumentByteSize(serialized);
  return serialized;
}

function pendingRestoreBackupDocument(
  pending: PendingRestoreBackup,
): PendingRestoreBackupDocument {
  const { recoveryState: _recoveryState, ...document } = pending;
  return document;
}

export async function clearPendingRestoreBackup(
  writer: StorageWriter,
): Promise<void> {
  try {
    await writer.remove(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
  } catch {
    // 일부 저장소는 삭제만 실패할 수 있어요. 빈 tombstone으로 한 번 더 지워
    // 이미 승격한 백업이 나중에 오래된 pending으로 다시 나타나지 않게 해요.
    await writer.write(
      APP_DATA_PENDING_RESTORE_BACKUP_KEY,
      CLEARED_PENDING_RESTORE_BACKUP,
    );
  }
}

function getPendingRestoreBackupRecoveryState(
  pending: PendingRestoreBackupDocument,
  currentData: AppData,
): PendingRestoreBackupRecoveryState {
  if (pending.phase === 'committed') return 'committed';

  const currentSnapshot = normalizedRestoreSnapshot(currentData);
  if (currentSnapshot === pending.targetSnapshot) return 'target-matched';

  const sourceSnapshot = normalizedRestoreSnapshot(
    previewAppDataImport(pending.backup).data,
  );
  return currentSnapshot === sourceSnapshot ? 'source-matched' : 'diverged';
}

/**
 * 별도 키에 남아 있는 복원 전 백업과 현재 영속 본문의 관계를 확인해요.
 * prepared가 현재 본문과 다르더라도 숨기지 않고 diverged로 남겨, 원본은
 * 보존하되 복원이 완료됐다고 자동으로 오인하지 않게 해요.
 */
export async function readPendingRestoreBackup(
  storage: StorageAdapter,
  currentData: AppData,
): Promise<PendingRestoreBackup | null> {
  let pendingRaw: string | null;
  try {
    pendingRaw = await storage.getItem(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
  } catch {
    throw new Error('대기 중인 복원 전 백업을 확인하지 못했습니다.');
  }
  const pending = parsePendingRestoreBackup(pendingRaw);
  if (pending === null) return null;

  try {
    const automaticBackup = await storage.getItem(APP_DATA_AUTOMATIC_BACKUP_KEY);
    if (automaticBackup === pending.backup) return null;
  } catch {
    // 자동 백업 확인이 실패해도 별도 키의 복원 전 스냅샷은 유지해요.
  }

  return {
    ...pending,
    recoveryState: getPendingRestoreBackupRecoveryState(pending, currentData),
  };
}

/** 앱이 복원 도중 종료돼도 prepared 스냅샷을 현재 본문과 비교해 안전하게 복구해요. */
export async function reconcilePendingRestoreBackup(
  storage: StorageAdapter,
  writer: StorageWriter,
  currentData: AppData,
): Promise<boolean> {
  let raw: string | null;
  try {
    raw = await storage.getItem(APP_DATA_PENDING_RESTORE_BACKUP_KEY);
  } catch {
    return false;
  }
  const pending = parsePendingRestoreBackup(raw);
  if (pending === null) return false;

  try {
    if ((await storage.getItem(APP_DATA_AUTOMATIC_BACKUP_KEY)) === pending.backup) {
      try {
        await clearPendingRestoreBackup(writer);
      } catch {
        // 자동 백업은 이미 완성됐으므로 pending 정리 실패가 앱 로드를 막지 않아요.
      }
      return false;
    }
  } catch {
    // 자동 백업 확인 실패와 관계없이 pending 자체를 판별해요.
  }

  if (pending.phase === 'committed') return true;

  const recoveryState = getPendingRestoreBackupRecoveryState(pending, currentData);
  if (recoveryState === 'target-matched') {
    try {
      await writer.write(
        APP_DATA_PENDING_RESTORE_BACKUP_KEY,
        serializePendingRestoreBackup({ ...pending, phase: 'committed' }),
      );
      return true;
    } catch {
      // committed 기록이 막혀도 원본을 자동 백업 슬롯에 승격할 수 있으면
      // 다음 편집 전에 거래를 안전하게 끝낼 수 있어요.
    }
    try {
      await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, pending.backup);
      try {
        await clearPendingRestoreBackup(writer);
      } catch {
        // 자동 백업이 이미 원본을 보존하므로 pending 정리 실패는 안전해요.
      }
      return false;
    } catch {
      // 두 기록이 모두 실패하면 prepared를 그대로 두고 다음 실행에서 재시도해요.
    }
    return true;
  }

  if (recoveryState === 'source-matched') {
    try {
      await clearPendingRestoreBackup(writer);
      return false;
    } catch {
      // 삭제할 수 없으면 이후 편집 전에 다시 정리하도록 pending을 유지해요.
      return true;
    }
  }

  // 현재 본문만으로 복원 완료 여부를 증명할 수 없어요. 원본은 그대로
  // 보존하고 사용자 확인 없이 committed나 자동 백업으로 승격하지 않아요.
  return true;
}

/**
 * prepared 거래의 증거가 다음 본문 저장으로 사라지기 전에 원본 보호 상태를
 * 확정해요. 확정 기록과 자동 백업이 모두 실패하면 다음 본문 저장을 막아요.
 */
export async function protectPendingRestoreBackupBeforeDataChange(
  storage: StorageAdapter,
  writer: StorageWriter,
  currentData: AppData,
  nextData: AppData,
): Promise<boolean> {
  const currentSnapshot = normalizedRestoreSnapshot(currentData);
  const nextSnapshot = normalizedRestoreSnapshot(nextData);
  if (currentSnapshot === nextSnapshot) return true;

  const pending = await readPendingRestoreBackup(storage, currentData);
  if (pending === null || pending.recoveryState === 'committed') return true;

  if (pending.recoveryState === 'target-matched') {
    try {
      await writer.write(
        APP_DATA_PENDING_RESTORE_BACKUP_KEY,
        serializePendingRestoreBackup({
          ...pendingRestoreBackupDocument(pending),
          phase: 'committed',
        }),
      );
      return true;
    } catch {
      // pending 키가 일시적으로 막혀 있으면 자동 백업 슬롯으로 한 번 더 보호해요.
    }
    try {
      await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, pending.backup);
      try {
        await clearPendingRestoreBackup(writer);
      } catch {
        // 자동 백업에 원본이 있으므로 다음 저장을 진행해도 안전해요.
      }
      return true;
    } catch {
      return false;
    }
  }

  if (pending.recoveryState === 'source-matched') {
    // source -> target 저장은 준비된 복원 자체예요. 그 외 변경은 먼저
    // 준비 문서를 확실히 정리해야 나중에 복원 성공으로 오인하지 않아요.
    if (nextSnapshot === pending.targetSnapshot) return true;
    try {
      await clearPendingRestoreBackup(writer);
      return true;
    } catch {
      return false;
    }
  }

  // 이전 버전에서 이미 본문이 달라진 prepared는 원본을 별도 키에 계속
  // 보존하고 화면에 확인 대상으로 노출해요. 여기서 상태를 추측해 바꾸지 않아요.
  return true;
}

/** 대기 중인 복원 전 스냅샷을 최근 자동 백업 슬롯에 다시 저장해요. */
export async function retryPendingRestoreBackupCommit(
  storage: StorageAdapter,
  writer: StorageWriter,
  currentData: AppData,
  options?: { allowUnverified?: boolean },
): Promise<PendingRestoreBackupRetryResult> {
  const pending = await readPendingRestoreBackup(storage, currentData);
  if (pending === null) return { status: 'unavailable' };
  if (
    (pending.recoveryState === 'source-matched' ||
      pending.recoveryState === 'diverged') &&
    options?.allowUnverified !== true
  ) {
    return { status: 'confirmation-required' };
  }

  try {
    await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, pending.backup);
  } catch {
    return { status: 'failed' };
  }

  try {
    await clearPendingRestoreBackup(writer);
  } catch {
    // 자동 백업은 이미 저장됐으므로 다음 조회에서 같은 원본임을 확인해 숨겨요.
  }
  return { status: 'saved' };
}

/**
 * 복원 전 현재 상태를 별도 키에 먼저 영속화하고 본문을 복원해요.
 * 자동 백업 슬롯 갱신이 실패해도 별도 키를 남겨 다음 실행에서 다시 시도할 수 있어요.
 */
export async function restoreWithAutomaticBackupCommit<
  T extends { primarySaved: boolean },
>(
  writer: StorageWriter,
  currentData: AppData,
  targetData: AppData,
  restore: () => Promise<T>,
  now: Date = new Date(),
): Promise<RestoreWithAutomaticBackupResult<T>> {
  const prepared: PendingRestoreBackupDocument = {
    format: 'alarmpyo-pending-restore-backup',
    version: 1,
    phase: 'prepared',
    createdAt: now.toISOString(),
    backup: exportAppDataToJson(currentData, now),
    targetSnapshot: normalizedRestoreSnapshot(targetData),
  };

  try {
    await writer.write(
      APP_DATA_PENDING_RESTORE_BACKUP_KEY,
      serializePendingRestoreBackup(prepared),
    );
  } catch {
    return {
      restoreStarted: false,
      restoreResult: null,
      automaticBackupSaved: false,
      pendingBackupAvailable: false,
    };
  }

  let restoreResult: T;
  try {
    restoreResult = await restore();
  } catch {
    // 콜백이 본문 저장 뒤 실패했을 수도 있으므로 prepared 스냅샷을 지우지 않아요.
    return {
      restoreStarted: true,
      restoreResult: null,
      automaticBackupSaved: false,
      pendingBackupAvailable: true,
    };
  }
  if (!restoreResult.primarySaved) {
    try {
      await clearPendingRestoreBackup(writer);
    } catch {
      // prepared 상태는 목표 본문과 다르면 재시도 대상으로 노출하지 않아요.
    }
    return {
      restoreStarted: true,
      restoreResult,
      automaticBackupSaved: false,
      pendingBackupAvailable: false,
    };
  }

  const committed = { ...prepared, phase: 'committed' as const };
  try {
    await writer.write(
      APP_DATA_PENDING_RESTORE_BACKUP_KEY,
      serializePendingRestoreBackup(committed),
    );
  } catch {
    // prepared 상태라도 현재 본문이 목표와 같으면 재시도 대상으로 복구할 수 있어요.
  }

  try {
    await writer.write(APP_DATA_AUTOMATIC_BACKUP_KEY, prepared.backup);
  } catch {
    return {
      restoreStarted: true,
      restoreResult,
      automaticBackupSaved: false,
      pendingBackupAvailable: true,
    };
  }

  try {
    await clearPendingRestoreBackup(writer);
  } catch {
    // 자동 백업은 이미 저장됐으므로 남은 pending 키는 무해해요.
  }
  return {
    restoreStarted: true,
    restoreResult,
    automaticBackupSaved: true,
    pendingBackupAvailable: false,
  };
}
