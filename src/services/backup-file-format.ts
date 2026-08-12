import { getCheckedEncryptedBackupContentsByteSize } from './backup-file-policy';

export const ENCRYPTED_BACKUP_FORMAT_IDENTIFIER =
  'alarmpyo-encrypted-backup' as const;
export const LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER =
  'htss-encrypted-backup' as const;

export type EncryptedBackupFormatIdentifier =
  | typeof ENCRYPTED_BACKUP_FORMAT_IDENTIFIER
  | typeof LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER;

/**
 * 파일명과 MIME 형식은 사용자가 바꾸거나 문서 공급자가 잘못 전달할 수 있어요.
 * 암호화 백업 여부는 JSON 봉투의 형식 식별자로만 판별해요.
 */
export function hasEncryptedBackupEnvelope(contents: string): boolean {
  try {
    getCheckedEncryptedBackupContentsByteSize(contents);
    const normalized =
      contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
    const value: unknown = JSON.parse(normalized);
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      ((value as Record<string, unknown>).format ===
        ENCRYPTED_BACKUP_FORMAT_IDENTIFIER ||
        (value as Record<string, unknown>).format ===
          LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER)
    );
  } catch {
    return false;
  }
}
