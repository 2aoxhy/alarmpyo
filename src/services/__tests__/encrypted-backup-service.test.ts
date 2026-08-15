import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertNewBackupPassword,
  decryptBackupContents,
  encryptBackupContents,
  ENCRYPTED_BACKUP_ERROR_MESSAGE,
  isEncryptedBackupContents,
} from '../encrypted-backup-service';
import { LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER } from '../backup-file-format';
import { MAX_BACKUP_FILE_BYTES } from '../backup-file-policy';

const getRandomBytesAsync = vi.hoisted(() => vi.fn());

vi.mock('expo-crypto', () => ({ getRandomBytesAsync }));

const salt = Uint8Array.from([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]);
const nonce = Uint8Array.from([
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
]);
const createdAt = new Date('2026-07-26T03:04:05.000Z');
const password = 'correct horse battery staple';
const plaintext = '{"한글":"ALARMPYO","version":14}';

describe('암호화 전체 백업', () => {
  beforeEach(() => {
    getRandomBytesAsync.mockReset();
  });

  it(
    '고정된 scrypt와 XChaCha20-Poly1305 테스트 벡터를 재현하고 UTF-8을 왕복해요',
    async () => {
      const encrypted = await encryptBackupContents(plaintext, password, {
        createdAt,
        salt,
        nonce,
      });

      expect(encrypted).toBe(
        '{"format":"alarmpyo-encrypted-backup","version":1,"createdAt":"2026-07-26T03:04:05.000Z","plaintextBytes":34,"kdf":{"name":"scrypt","N":32768,"r":8,"p":1,"salt":"AAECAwQFBgcICQoLDA0ODw=="},"cipher":{"name":"XChaCha20-Poly1305","nonce":"EBESExQVFhcYGRobHB0eHyAhIiMkJSYn","ciphertext":"u3ciKWx043eN34P1rz73FfWKVNnAQ4i/Yerldgm+3+3rMX2gEETEbN2i2MCy/otnOPo="}}',
      );
      await expect(decryptBackupContents(encrypted, password)).resolves.toBe(plaintext);
      expect(getRandomBytesAsync).not.toHaveBeenCalled();
    },
    30_000,
  );

  it(
    '과거 앱의 암호화 백업을 가져오기 입력으로 복호화해요',
    async () => {
      const legacyPlaintext = '{"한글":"HTSS","version":14}';
      const legacyEncrypted = JSON.stringify({
        format: LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER,
        version: 1,
        createdAt: '2026-07-26T03:04:05.000Z',
        plaintextBytes: 30,
        kdf: {
          name: 'scrypt',
          N: 32_768,
          r: 8,
          p: 1,
          salt: 'AAECAwQFBgcICQoLDA0ODw==',
        },
        cipher: {
          name: 'XChaCha20-Poly1305',
          nonce: 'EBESExQVFhcYGRobHB0eHyAhIiMkJSYn',
          ciphertext:
            'u3ciKWx043eN34P8tyz2eonxbZ6eEpe1fbu2KFPh5cgiLntOaNL2ApKUPiKjHg==',
        },
      });

      await expect(
        decryptBackupContents(legacyEncrypted, password),
      ).resolves.toBe(legacyPlaintext);
    },
    30_000,
  );

  it(
    '잘못된 비밀번호와 암호문 변조를 같은 안전한 오류로 거절해요',
    async () => {
      const encrypted = await encryptBackupContents(plaintext, password, {
        createdAt,
        salt,
        nonce,
      });
      const envelope = JSON.parse(encrypted) as {
        cipher: { ciphertext: string };
      };
      const first = envelope.cipher.ciphertext[0];
      envelope.cipher.ciphertext =
        (first === 'A' ? 'B' : 'A') + envelope.cipher.ciphertext.slice(1);
      const tampered = JSON.stringify(envelope);

      await expect(
        decryptBackupContents(encrypted, '잘못된 비밀번호입니다'),
      ).rejects.toThrow(ENCRYPTED_BACKUP_ERROR_MESSAGE);
      await expect(decryptBackupContents(tampered, password)).rejects.toThrow(
        ENCRYPTED_BACKUP_ERROR_MESSAGE,
      );
    },
    30_000,
  );

  it('손상되거나 지원하지 않는 암호화 파일도 같은 안전한 오류로 거절해요', async () => {
    await expect(
      decryptBackupContents(
        JSON.stringify({ format: 'alarmpyo-encrypted-backup', version: 999 }),
        password,
      ),
    ).rejects.toThrow(ENCRYPTED_BACKUP_ERROR_MESSAGE);
    await expect(
      decryptBackupContents('{완전하지 않은 JSON', password),
    ).rejects.toThrow(ENCRYPTED_BACKUP_ERROR_MESSAGE);
  });

  it('새 암호화 백업은 12자 이상 비밀번호만 받아요', () => {
    expect(() => assertNewBackupPassword('열한글자비밀번호입력')).toThrow(
      '비밀번호는 12자 이상 입력해야 합니다.',
    );
    expect(() => assertNewBackupPassword('열두글자이상비밀번호입력')).not.toThrow();
  });

  it('운영 암호화에서는 네이티브 난수로 새 salt와 nonce를 만들어요', async () => {
    getRandomBytesAsync
      .mockResolvedValueOnce(salt)
      .mockResolvedValueOnce(nonce);

    await encryptBackupContents(plaintext, password);

    expect(getRandomBytesAsync).toHaveBeenNthCalledWith(1, 16);
    expect(getRandomBytesAsync).toHaveBeenNthCalledWith(2, 24);
  }, 30_000);

  it('평문 제한을 넘는 백업은 난수나 키를 만들기 전에 거절해요', async () => {
    await expect(
      encryptBackupContents('a'.repeat(MAX_BACKUP_FILE_BYTES + 1), password),
    ).rejects.toThrow('백업 파일은 4MB 이하여야 합니다.');
    expect(getRandomBytesAsync).not.toHaveBeenCalled();
  });

  it('암호화 형식을 내용으로 구분하고 기존 평문 JSON은 그대로 유지해요', async () => {
    const encrypted = await encryptBackupContents(plaintext, password, {
      createdAt,
      salt,
      nonce,
    });

    expect(isEncryptedBackupContents(encrypted)).toBe(true);
    expect(isEncryptedBackupContents(plaintext)).toBe(false);
  }, 30_000);
});
