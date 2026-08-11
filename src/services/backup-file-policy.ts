import { getUtf8ByteLength } from '../utils/utf8';

/**
 * 앱 본문, 일반 백업의 평문, 복호화된 백업은 모두 같은 상한을 사용해요.
 * 암호화 봉투만 Base64와 암호화 메타데이터 오버헤드를 고려해 더 크게 허용해요.
 */
export const MAX_APP_DATA_BYTES = 4 * 1024 * 1024;
export const APP_DATA_SIZE_LABEL = '4MB';
export const MAX_BACKUP_FILE_BYTES = MAX_APP_DATA_BYTES;
export const BACKUP_FILE_SIZE_LABEL = APP_DATA_SIZE_LABEL;
export const MAX_ENCRYPTED_BACKUP_FILE_BYTES = 6 * 1024 * 1024;
export const ENCRYPTED_BACKUP_FILE_SIZE_LABEL = '6MB';
// 파일 내용을 확인하기 전에는 평문인지 암호화 백업인지 알 수 없으므로
// 가져오기 단계에서는 더 큰 암호화 백업 한도를 절대 상한으로 사용해요.
export const MAX_BACKUP_IMPORT_FILE_BYTES = MAX_ENCRYPTED_BACKUP_FILE_BYTES;
export const BACKUP_IMPORT_FILE_SIZE_LABEL = ENCRYPTED_BACKUP_FILE_SIZE_LABEL;
export const ENCRYPTED_BACKUP_ACCESS_ERROR_MESSAGE =
  '비밀번호가 맞지 않거나 백업 파일이 손상됐어요.';

export function assertAppDataByteSize(size: number): void {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error('근무표 데이터 크기를 확인할 수 없어요.');
  }
  if (size > MAX_APP_DATA_BYTES) {
    throw new Error(`근무표 데이터는 ${APP_DATA_SIZE_LABEL} 이하여야 해요.`);
  }
}

export function getCheckedAppDataContentsByteSize(contents: string): number {
  const size = getUtf8ByteLength(contents);
  assertAppDataByteSize(size);
  return size;
}

export function assertBackupFileByteSize(size: number): void {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error('백업 파일의 크기를 확인할 수 없어요.');
  }
  if (size > MAX_BACKUP_FILE_BYTES) {
    throw new Error(`백업 파일은 ${BACKUP_FILE_SIZE_LABEL} 이하여야 해요.`);
  }
}

export function getCheckedBackupContentsByteSize(contents: string): number {
  const size = getUtf8ByteLength(contents);
  assertBackupFileByteSize(size);
  return size;
}

export function assertEncryptedBackupFileByteSize(size: number): void {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error('암호화 백업 파일의 크기를 확인할 수 없어요.');
  }
  if (size > MAX_ENCRYPTED_BACKUP_FILE_BYTES) {
    throw new Error(
      `암호화 백업 파일은 ${ENCRYPTED_BACKUP_FILE_SIZE_LABEL} 이하여야 해요.`,
    );
  }
}

export function getCheckedEncryptedBackupContentsByteSize(contents: string): number {
  const size = getUtf8ByteLength(contents);
  assertEncryptedBackupFileByteSize(size);
  return size;
}

export function assertBackupImportFileByteSize(size: number): void {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error('가져올 백업 파일의 크기를 확인할 수 없어요.');
  }
  if (size > MAX_BACKUP_IMPORT_FILE_BYTES) {
    throw new Error(
      `가져올 백업 파일은 ${BACKUP_IMPORT_FILE_SIZE_LABEL} 이하여야 해요.`,
    );
  }
}
