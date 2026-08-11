import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { getRandomBytesAsync } from 'expo-crypto';

import {
  assertBackupFileByteSize,
  ENCRYPTED_BACKUP_ACCESS_ERROR_MESSAGE,
  getCheckedBackupContentsByteSize,
  getCheckedEncryptedBackupContentsByteSize,
  MAX_BACKUP_FILE_BYTES,
} from './backup-file-policy';
import {
  type EncryptedBackupFormatIdentifier,
  ENCRYPTED_BACKUP_FORMAT_IDENTIFIER,
  hasEncryptedBackupEnvelope,
  LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER,
} from './backup-file-format';
import {
  base64ToBytes,
  bytesToBase64,
  getBase64DecodedByteLength,
} from '../utils/base64';

export const ENCRYPTED_BACKUP_FORMAT = ENCRYPTED_BACKUP_FORMAT_IDENTIFIER;
export const ENCRYPTED_BACKUP_VERSION = 1 as const;
export const ENCRYPTED_BACKUP_ERROR_MESSAGE =
  ENCRYPTED_BACKUP_ACCESS_ERROR_MESSAGE;

const KDF_NAME = 'scrypt' as const;
const KDF_N = 32_768;
const KDF_R = 8;
const KDF_P = 1;
const KDF_SALT_BYTES = 16;
const KEY_BYTES = 32;
const CIPHER_NAME = 'XChaCha20-Poly1305' as const;
const CIPHER_NONCE_BYTES = 24;
const AUTH_TAG_BYTES = 16;
const MINIMUM_PASSWORD_CHARACTERS = 12;
const MAXIMUM_PASSWORD_CHARACTERS = 128;
const MAXIMUM_PASSWORD_BYTES = 512;

type EncryptedBackupEnvelope = {
  format: EncryptedBackupFormatIdentifier;
  version: typeof ENCRYPTED_BACKUP_VERSION;
  createdAt: string;
  plaintextBytes: number;
  kdf: {
    name: typeof KDF_NAME;
    N: typeof KDF_N;
    r: typeof KDF_R;
    p: typeof KDF_P;
    salt: string;
  };
  cipher: {
    name: typeof CIPHER_NAME;
    nonce: string;
    ciphertext: string;
  };
};

type EncryptedBackupTestInputs = {
  createdAt?: Date;
  salt?: Uint8Array;
  nonce?: Uint8Array;
};

export class EncryptedBackupAccessError extends Error {
  constructor() {
    super(ENCRYPTED_BACKUP_ERROR_MESSAGE);
    this.name = 'EncryptedBackupAccessError';
  }
}

export function assertNewBackupPassword(password: string): void {
  const normalized = normalizePassword(password);
  const characterCount = Array.from(normalized).length;
  if (characterCount < MINIMUM_PASSWORD_CHARACTERS) {
    throw new Error('비밀번호는 12자 이상 입력해 주세요.');
  }
  if (characterCount > MAXIMUM_PASSWORD_CHARACTERS) {
    throw new Error('비밀번호는 128자 이하로 입력해 주세요.');
  }
  if (utf8ToBytes(normalized).length > MAXIMUM_PASSWORD_BYTES) {
    throw new Error('비밀번호가 너무 길어요. 더 짧게 입력해 주세요.');
  }
}

export function isEncryptedBackupContents(contents: string): boolean {
  return hasEncryptedBackupEnvelope(contents);
}

export async function encryptBackupContents(
  contents: string,
  password: string,
  testInputs: EncryptedBackupTestInputs = {},
): Promise<string> {
  assertNewBackupPassword(password);
  const plaintextBytes = getCheckedBackupContentsByteSize(contents);
  assertBackupFileByteSize(plaintextBytes);

  const salt = testInputs.salt
    ? copyExactBytes(testInputs.salt, KDF_SALT_BYTES)
    : copyExactBytes(await getRandomBytesAsync(KDF_SALT_BYTES), KDF_SALT_BYTES);
  const nonce = testInputs.nonce
    ? copyExactBytes(testInputs.nonce, CIPHER_NONCE_BYTES)
    : copyExactBytes(
        await getRandomBytesAsync(CIPHER_NONCE_BYTES),
        CIPHER_NONCE_BYTES,
      );
  const createdAt = (testInputs.createdAt ?? new Date()).toISOString();
  const envelopeWithoutCiphertext = {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    createdAt,
    plaintextBytes,
    kdf: {
      name: KDF_NAME,
      N: KDF_N,
      r: KDF_R,
      p: KDF_P,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: CIPHER_NAME,
      nonce: bytesToBase64(nonce),
    },
  } as const;
  const additionalData = utf8ToBytes(JSON.stringify(envelopeWithoutCiphertext));
  const key = await deriveKey(password, salt);
  const plaintext = utf8ToBytes(contents);

  try {
    const ciphertext = xchacha20poly1305(key, nonce, additionalData).encrypt(plaintext);
    const encrypted = JSON.stringify({
      ...envelopeWithoutCiphertext,
      cipher: {
        ...envelopeWithoutCiphertext.cipher,
        ciphertext: bytesToBase64(ciphertext),
      },
    } satisfies EncryptedBackupEnvelope);
    getCheckedEncryptedBackupContentsByteSize(encrypted);
    return encrypted;
  } finally {
    key.fill(0);
    plaintext.fill(0);
    additionalData.fill(0);
  }
}

export async function decryptBackupContents(
  encryptedContents: string,
  password: string,
): Promise<string> {
  try {
    getCheckedEncryptedBackupContentsByteSize(encryptedContents);
    const envelope = parseEnvelope(encryptedContents);
    const normalizedPassword = normalizePassword(password);
    if (normalizedPassword.length === 0) throw new Error('비밀번호가 비어 있어요.');

    const salt = base64ToBytes(envelope.kdf.salt, KDF_SALT_BYTES);
    const nonce = base64ToBytes(envelope.cipher.nonce, CIPHER_NONCE_BYTES);
    const ciphertext = base64ToBytes(
      envelope.cipher.ciphertext,
      MAX_BACKUP_FILE_BYTES + AUTH_TAG_BYTES,
    );
    if (
      salt.length !== KDF_SALT_BYTES ||
      nonce.length !== CIPHER_NONCE_BYTES ||
      ciphertext.length !== envelope.plaintextBytes + AUTH_TAG_BYTES
    ) {
      throw new Error('암호화 길이가 올바르지 않아요.');
    }

    const additionalData = utf8ToBytes(
      JSON.stringify({
        format: envelope.format,
        version: envelope.version,
        createdAt: envelope.createdAt,
        plaintextBytes: envelope.plaintextBytes,
        kdf: envelope.kdf,
        cipher: {
          name: envelope.cipher.name,
          nonce: envelope.cipher.nonce,
        },
      }),
    );
    const key = await deriveKey(normalizedPassword, salt);
    try {
      const plaintext = xchacha20poly1305(key, nonce, additionalData).decrypt(
        ciphertext,
      );
      try {
        if (plaintext.length !== envelope.plaintextBytes) {
          throw new Error('복호화한 백업의 크기가 올바르지 않아요.');
        }
        const contents = bytesToUtf8(plaintext);
        getCheckedBackupContentsByteSize(contents);
        if (utf8ToBytes(contents).length !== plaintext.length) {
          throw new Error('복호화한 백업의 UTF-8 형식이 올바르지 않아요.');
        }
        return contents;
      } finally {
        plaintext.fill(0);
      }
    } finally {
      key.fill(0);
      additionalData.fill(0);
      ciphertext.fill(0);
    }
  } catch {
    throw new EncryptedBackupAccessError();
  }
}

function parseEnvelope(raw: string): EncryptedBackupEnvelope {
  const value: unknown = JSON.parse(stripUtf8Bom(raw));
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'format',
      'version',
      'createdAt',
      'plaintextBytes',
      'kdf',
      'cipher',
    ]) ||
    (value.format !== ENCRYPTED_BACKUP_FORMAT &&
      value.format !== LEGACY_ENCRYPTED_BACKUP_FORMAT_IDENTIFIER) ||
    value.version !== ENCRYPTED_BACKUP_VERSION ||
    typeof value.createdAt !== 'string' ||
    new Date(value.createdAt).toISOString() !== value.createdAt ||
    !Number.isInteger(value.plaintextBytes) ||
    (value.plaintextBytes as number) < 0 ||
    (value.plaintextBytes as number) > MAX_BACKUP_FILE_BYTES ||
    !isRecord(value.kdf) ||
    !hasExactKeys(value.kdf, ['name', 'N', 'r', 'p', 'salt']) ||
    value.kdf.name !== KDF_NAME ||
    value.kdf.N !== KDF_N ||
    value.kdf.r !== KDF_R ||
    value.kdf.p !== KDF_P ||
    typeof value.kdf.salt !== 'string' ||
    !isRecord(value.cipher) ||
    !hasExactKeys(value.cipher, ['name', 'nonce', 'ciphertext']) ||
    value.cipher.name !== CIPHER_NAME ||
    typeof value.cipher.nonce !== 'string' ||
    typeof value.cipher.ciphertext !== 'string'
  ) {
    throw new Error('암호화 백업 형식이 올바르지 않아요.');
  }
  if (
    getBase64DecodedByteLength(value.kdf.salt) !== KDF_SALT_BYTES ||
    getBase64DecodedByteLength(value.cipher.nonce) !== CIPHER_NONCE_BYTES ||
    getBase64DecodedByteLength(value.cipher.ciphertext) !==
      (value.plaintextBytes as number) + AUTH_TAG_BYTES
  ) {
    throw new Error('암호화 백업의 길이가 올바르지 않아요.');
  }
  return value as EncryptedBackupEnvelope;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordBytes = utf8ToBytes(normalizePassword(password));
  if (passwordBytes.length === 0 || passwordBytes.length > MAXIMUM_PASSWORD_BYTES) {
    passwordBytes.fill(0);
    throw new Error('비밀번호 길이가 올바르지 않아요.');
  }
  try {
    return await scryptAsync(passwordBytes, salt, {
      N: KDF_N,
      r: KDF_R,
      p: KDF_P,
      dkLen: KEY_BYTES,
      asyncTick: 8,
      maxmem: 64 * 1024 * 1024,
    });
  } finally {
    passwordBytes.fill(0);
  }
}

function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

function copyExactBytes(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length !== length) throw new Error('암호화 입력 길이가 올바르지 않아요.');
  return Uint8Array.from(bytes);
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}
