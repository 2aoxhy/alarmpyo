import { describe, expect, it, vi } from 'vitest';

import {
  ENCRYPTED_BACKUP_FORMAT_IDENTIFIER,
  hasEncryptedBackupEnvelope,
  LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER,
} from '../backup-file-format';
import { MAX_ENCRYPTED_BACKUP_FILE_BYTES } from '../backup-file-policy';

describe('백업 파일 형식 판별', () => {
  it('확장자 없이도 암호화 봉투의 형식 식별자를 확인해요', () => {
    expect(
      hasEncryptedBackupEnvelope(
        JSON.stringify({ format: ENCRYPTED_BACKUP_FORMAT_IDENTIFIER, version: 1 }),
      ),
    ).toBe(true);
    expect(
      hasEncryptedBackupEnvelope(
        `\ufeff${JSON.stringify({
          format: ENCRYPTED_BACKUP_FORMAT_IDENTIFIER,
          version: 1,
        })}`,
      ),
    ).toBe(true);
  });

  it('과거 암호화 봉투 식별자는 가져오기 입력으로만 받아요', () => {
    expect(
      hasEncryptedBackupEnvelope(
        JSON.stringify({
          format: LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER,
          version: 1,
        }),
      ),
    ).toBe(true);
    expect(ENCRYPTED_BACKUP_FORMAT_IDENTIFIER).toBe(
      'alarmpyo-encrypted-backup',
    );
  });

  it('평문 백업과 손상된 JSON을 암호화 파일로 오인하지 않아요', () => {
    expect(
      hasEncryptedBackupEnvelope('{"format":"alarmpyo-backup"}'),
    ).toBe(false);
    expect(hasEncryptedBackupEnvelope('{')).toBe(false);
    expect(hasEncryptedBackupEnvelope('[]')).toBe(false);
  });

  it('암호화 봉투 판별도 크기 상한을 JSON 파싱 전에 적용해요', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      expect(
        hasEncryptedBackupEnvelope(
          ' '.repeat(MAX_ENCRYPTED_BACKUP_FILE_BYTES + 1),
        ),
      ).toBe(false);
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });
});
