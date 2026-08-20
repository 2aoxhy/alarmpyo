import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

import officialPatternPublicKeyring from '../../official-patterns/public-keyring.json';
import type { PatternShiftCode } from '../models/app-data';
import { base64ToBytes } from '../utils/base64';
import { isValidDateKey } from '../utils/date';
import { stripOptionalUtf8Bom } from '../utils/json';
import { getUtf8ByteLength } from '../utils/utf8';
import {
  isOfficialPatternId,
} from './official-pattern-ids';
import {
  OFFICIAL_PATTERN_DEFINITIONS,
  OFFICIAL_PATTERN_KEY_ID,
  matchesOfficialPatternContract,
} from './official-pattern-contract';

export {
  OFFICIAL_PATTERN_IDS,
  isOfficialPatternId,
  type OfficialPatternId,
} from './official-pattern-ids';

export const SHIFT_PATTERN_FORMAT = 'alarmpyo.shiftpattern' as const;
export const SHIFT_PATTERN_UNSIGNED_SOURCE_FORMAT =
  'alarmpyo.shiftpattern.unsigned-source' as const;
export const SHIFT_PATTERN_FORMAT_VERSION = 1 as const;
export const MAX_SHIFT_PATTERN_BYTES = 256 * 1024;
export const OFFICIAL_SHIFT_PATTERN_BASE_URL =
  'https://2aoxhy.github.io/alarmpyo' as const;
export const OFFICIAL_PATTERN_SIGNATURE_ALGORITHM =
  'ECDSA_P256_SHA256' as const;

const DOCUMENT_KEYS = [
  'format',
  'formatVersion',
  'id',
  'source',
  'name',
  'author',
  'sourceVersion',
  'anchorDate',
  'shiftCodes',
  'createdAt',
  'keyId',
  'contentSha256',
  'signature',
] as const;

const CANONICAL_PAYLOAD_KEYS = [
  'format',
  'formatVersion',
  'id',
  'source',
  'name',
  'author',
  'sourceVersion',
  'anchorDate',
  'shiftCodes',
  'createdAt',
  'keyId',
] as const satisfies readonly (keyof ShiftPatternCanonicalPayload)[];
const SHIFT_CODES = new Set<PatternShiftCode>([
  'DAY',
  'EVENING',
  'NIGHT',
  'OFF',
  'DAY_SUBSTITUTE',
  'NIGHT_SUBSTITUTE',
]);

export type ShiftPatternSource = 'official' | 'user';

export type ShiftPatternCanonicalPayload = {
  format: typeof SHIFT_PATTERN_FORMAT;
  formatVersion: typeof SHIFT_PATTERN_FORMAT_VERSION;
  id: string;
  source: ShiftPatternSource;
  name: string;
  author: string | null;
  sourceVersion: number;
  anchorDate: string;
  shiftCodes: PatternShiftCode[];
  createdAt: string;
  keyId: string | null;
};

export type ShiftPatternDocument = ShiftPatternCanonicalPayload & {
  contentSha256: string;
  signature: string | null;
};

export type ValidatedPatternDescriptor = {
  id: string;
  source: ShiftPatternSource;
  name: string;
  author: string | null;
  sourceVersion: number;
  anchorDate: string;
  shiftCodes: PatternShiftCode[];
  verification:
    | {
        status: 'official-verified';
        algorithm: typeof OFFICIAL_PATTERN_SIGNATURE_ALGORITHM;
        keyId: string;
        contentSha256: string;
      }
    | {
        status: 'user-validated';
        algorithm: 'SHA256';
        keyId: null;
        contentSha256: string;
      };
};

export type ShiftPatternErrorCode =
  | 'file-too-large'
  | 'invalid-json'
  | 'invalid-schema'
  | 'unsupported-version'
  | 'invalid-hash'
  | 'invalid-signature'
  | 'unknown-key'
  | 'official-contract-mismatch'
  | 'reserved-official-id'
  | 'network'
  | 'http'
  | 'invalid-response';

export class ShiftPatternError extends Error {
  readonly code: ShiftPatternErrorCode;
  readonly patternId: string | null;

  constructor(
    code: ShiftPatternErrorCode,
    message: string,
    options: { cause?: unknown; patternId?: string } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ShiftPatternError';
    this.code = code;
    this.patternId = options.patternId ?? null;
  }
}

export type OfficialPatternPublicKey = {
  id: string;
  algorithm: typeof OFFICIAL_PATTERN_SIGNATURE_ALGORITHM;
  publicKeyBase64: string;
};

export type OfficialPatternPublicKeyring = ReadonlyMap<
  string,
  OfficialPatternPublicKey
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  if (
    actual.length !== expectedKeys.length ||
    actual.some((key) => !expected.has(key))
  ) {
    throw new ShiftPatternError(
      'invalid-schema',
      `${label}에 허용되지 않는 항목이 있거나 필요한 항목이 없습니다.`,
    );
  }
}

function normalizeRequiredString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string') {
    throw new ShiftPatternError('invalid-schema', `${label} 값이 올바르지 않습니다.`);
  }
  const normalized = value.normalize('NFC');
  if (
    normalized.trim().length === 0 ||
    normalized.length > maximumLength ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new ShiftPatternError('invalid-schema', `${label} 값이 올바르지 않습니다.`);
  }
  return normalized;
}

function normalizeNullableString(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === null) return null;
  return normalizeRequiredString(value, label, maximumLength);
}

function parsePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 9999) {
    throw new ShiftPatternError('invalid-schema', `${label} 값이 올바르지 않습니다.`);
  }
  return value as number;
}

function parseShiftCodes(value: unknown): PatternShiftCode[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 42 ||
    value.some(
      (code) => typeof code !== 'string' || !SHIFT_CODES.has(code as PatternShiftCode),
    )
  ) {
    throw new ShiftPatternError(
      'invalid-schema',
      '근무 반복 순서는 지원하는 근무 코드로 1일부터 42일까지 구성해야 합니다.',
    );
  }
  return value as PatternShiftCode[];
}

function parseCreatedAt(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ShiftPatternError('invalid-schema', '생성 시각이 올바르지 않습니다.');
  }
  const normalized = value.normalize('NFC');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(normalized) ||
    !Number.isFinite(Date.parse(normalized)) ||
    new Date(normalized).toISOString() !== normalized
  ) {
    throw new ShiftPatternError('invalid-schema', '생성 시각이 올바르지 않습니다.');
  }
  return normalized;
}

function parseIdentifier(value: unknown, label: string): string {
  const id = normalizeRequiredString(value, label, 64);
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u.test(id)) {
    throw new ShiftPatternError('invalid-schema', `${label} 값이 올바르지 않습니다.`);
  }
  return id;
}

function parseCanonicalPayload(root: Record<string, unknown>): ShiftPatternCanonicalPayload {
  if (root.format !== SHIFT_PATTERN_FORMAT) {
    throw new ShiftPatternError('invalid-schema', '알람표 근무 패턴 파일이 아닙니다.');
  }
  if (root.formatVersion !== SHIFT_PATTERN_FORMAT_VERSION) {
    throw new ShiftPatternError(
      'unsupported-version',
      '지원하지 않는 근무 패턴 파일 버전입니다.',
    );
  }
  if (root.source !== 'official' && root.source !== 'user') {
    throw new ShiftPatternError('invalid-schema', '근무 패턴 출처가 올바르지 않습니다.');
  }
  const source = root.source;
  const id = parseIdentifier(root.id, '근무 패턴 ID');
  const name = normalizeRequiredString(root.name, '근무 패턴 이름', 80);
  const author = normalizeNullableString(root.author, '작성자', 80);
  const sourceVersion = parsePositiveInteger(root.sourceVersion, '패턴 버전');
  if (typeof root.anchorDate !== 'string' || !isValidDateKey(root.anchorDate)) {
    throw new ShiftPatternError('invalid-schema', '근무 패턴 기준일이 올바르지 않습니다.');
  }
  const shiftCodes = parseShiftCodes(root.shiftCodes);
  const createdAt = parseCreatedAt(root.createdAt);
  const keyId =
    root.keyId === null ? null : parseIdentifier(root.keyId, '공개키 ID');
  if (source === 'official' && keyId === null) {
    throw new ShiftPatternError(
      'invalid-signature',
      '공식 근무 패턴에 서명 공개키 ID가 없습니다.',
      { patternId: id },
    );
  }
  if (source === 'user' && keyId !== null) {
    throw new ShiftPatternError(
      'invalid-schema',
      '사용자 근무 패턴에는 공식 서명 공개키를 지정할 수 없습니다.',
      { patternId: id },
    );
  }
  return {
    format: SHIFT_PATTERN_FORMAT,
    formatVersion: SHIFT_PATTERN_FORMAT_VERSION,
    id,
    source,
    name,
    author,
    sourceVersion,
    anchorDate: root.anchorDate,
    shiftCodes,
    createdAt,
    keyId,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
  return result;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function buildPublicKeyring(): OfficialPatternPublicKeyring {
  if (
    officialPatternPublicKeyring.schemaVersion !== 1 ||
    officialPatternPublicKeyring.algorithm !== OFFICIAL_PATTERN_SIGNATURE_ALGORITHM
  ) {
    throw new Error('공식 근무 패턴 공개키 keyring 형식이 올바르지 않습니다.');
  }
  const keys = new Map<string, OfficialPatternPublicKey>();
  for (const raw of officialPatternPublicKeyring.keys) {
    const key = raw as OfficialPatternPublicKey;
    if (
      key.algorithm !== OFFICIAL_PATTERN_SIGNATURE_ALGORITHM ||
      keys.has(key.id)
    ) {
      throw new Error('공식 근무 패턴 공개키 keyring 항목이 올바르지 않습니다.');
    }
    const publicKey = base64ToBytes(key.publicKeyBase64, 65);
    if (publicKey.length !== 65 || publicKey[0] !== 4) {
      throw new Error('공식 근무 패턴 공개키는 P-256 비압축 형식이어야 합니다.');
    }
    keys.set(key.id, key);
  }
  return keys;
}

export { OFFICIAL_PATTERN_DEFINITIONS } from './official-pattern-contract';
export const OFFICIAL_PATTERN_PUBLIC_KEYRING = buildPublicKeyring();

export function assertShiftPatternByteSize(contents: string): void {
  if (getUtf8ByteLength(contents) > MAX_SHIFT_PATTERN_BYTES) {
    throw new ShiftPatternError(
      'file-too-large',
      '근무 패턴 파일은 256KB 이하여야 합니다.',
    );
  }
}

/** JSON.parse가 덮어쓰는 중복 속성도 서명 검증 전에 거부합니다. */
function assertNoDuplicateJsonObjectKeys(contents: string): void {
  const objectKeySets: (Set<string> | null)[] = [];
  let index = 0;
  while (index < contents.length) {
    const character = contents[index]!;
    if (character === '{') {
      objectKeySets.push(new Set());
      index += 1;
      continue;
    }
    if (character === '[') {
      objectKeySets.push(null);
      index += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      objectKeySets.pop();
      index += 1;
      continue;
    }
    if (character !== '"') {
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    let escaped = false;
    while (index < contents.length) {
      const current = contents[index]!;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') break;
      index += 1;
    }
    if (index >= contents.length) return;
    const end = index;
    index += 1;
    let lookahead = index;
    while (/\s/u.test(contents[lookahead] ?? '')) lookahead += 1;
    const currentObjectKeys = objectKeySets.at(-1);
    if (contents[lookahead] !== ':' || currentObjectKeys === null || currentObjectKeys === undefined) {
      continue;
    }
    let key: unknown;
    try {
      key = JSON.parse(contents.slice(start, end + 1));
    } catch {
      return;
    }
    if (typeof key !== 'string') continue;
    if (currentObjectKeys.has(key)) {
      throw new ShiftPatternError(
        'invalid-schema',
        '근무 패턴 파일에 중복된 항목이 있습니다.',
      );
    }
    currentObjectKeys.add(key);
  }
}

export function canonicalizeShiftPatternPayload(
  payload: ShiftPatternCanonicalPayload,
): string {
  const ordered: Record<string, unknown> = {};
  for (const key of CANONICAL_PAYLOAD_KEYS) ordered[key] = payload[key];
  return JSON.stringify(ordered);
}

export function getShiftPatternContentSha256(
  payload: ShiftPatternCanonicalPayload,
): string {
  return bytesToHex(sha256(utf8Bytes(canonicalizeShiftPatternPayload(payload))));
}

function assertOfficialContract(payload: ShiftPatternCanonicalPayload): void {
  if (!isOfficialPatternId(payload.id)) {
    throw new ShiftPatternError(
      'official-contract-mismatch',
      '지원하지 않는 공식 근무 패턴 ID입니다.',
      { patternId: payload.id },
    );
  }
  const expected = OFFICIAL_PATTERN_DEFINITIONS.get(payload.id)!;
  if (
    !matchesOfficialPatternContract({
      id: payload.id,
      name: payload.name,
      author: payload.author,
      sourceVersion: payload.sourceVersion,
      anchorDate: payload.anchorDate,
      shiftCodes: payload.shiftCodes,
    }) ||
    payload.createdAt !== expected.createdAt ||
    payload.keyId !== OFFICIAL_PATTERN_KEY_ID
  ) {
    throw new ShiftPatternError(
      'official-contract-mismatch',
      '공식 근무 패턴 내용이 등록된 계약과 다릅니다.',
      { patternId: payload.id },
    );
  }
}

function verifyOfficialSignature(
  payload: ShiftPatternCanonicalPayload,
  signatureBase64: string | null,
  keyring: OfficialPatternPublicKeyring,
): void {
  assertOfficialContract(payload);
  const key = payload.keyId === null ? undefined : keyring.get(payload.keyId);
  if (!key) {
    throw new ShiftPatternError(
      'unknown-key',
      '공식 근무 패턴의 서명 공개키를 확인할 수 없습니다.',
      { patternId: payload.id },
    );
  }
  if (signatureBase64 === null) {
    throw new ShiftPatternError(
      'invalid-signature',
      '공식 근무 패턴의 서명이 없습니다.',
      { patternId: payload.id },
    );
  }
  let signature: Uint8Array;
  let publicKey: Uint8Array;
  try {
    signature = base64ToBytes(signatureBase64, 64);
    publicKey = base64ToBytes(key.publicKeyBase64, 65);
  } catch (error) {
    throw new ShiftPatternError(
      'invalid-signature',
      '공식 근무 패턴의 서명 형식이 올바르지 않습니다.',
      { cause: error, patternId: payload.id },
    );
  }
  if (signature.length !== 64 || publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new ShiftPatternError(
      'invalid-signature',
      '공식 근무 패턴의 서명 형식이 올바르지 않습니다.',
      { patternId: payload.id },
    );
  }
  let verified = false;
  try {
    verified = p256.verify(
      signature,
      utf8Bytes(canonicalizeShiftPatternPayload(payload)),
      publicKey,
      { format: 'compact', lowS: true, prehash: true },
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    throw new ShiftPatternError(
      'invalid-signature',
      '공식 근무 패턴의 전자서명이 올바르지 않습니다.',
      { patternId: payload.id },
    );
  }
}

export function parseAndValidateShiftPattern(
  contents: string,
  options: { keyring?: OfficialPatternPublicKeyring } = {},
): ValidatedPatternDescriptor {
  assertShiftPatternByteSize(contents);
  const withoutBom = stripOptionalUtf8Bom(contents);
  assertNoDuplicateJsonObjectKeys(withoutBom);
  let value: unknown;
  try {
    value = JSON.parse(withoutBom);
  } catch (error) {
    throw new ShiftPatternError('invalid-json', '근무 패턴 JSON을 읽을 수 없습니다.', {
      cause: error,
    });
  }
  if (!isRecord(value)) {
    throw new ShiftPatternError('invalid-schema', '근무 패턴 파일 형식이 올바르지 않습니다.');
  }
  exactKeys(value, DOCUMENT_KEYS, '근무 패턴 파일');
  const payload = parseCanonicalPayload(value);
  const reservedOfficialId = isOfficialPatternId(payload.id);
  if (reservedOfficialId && payload.source !== 'official') {
    throw new ShiftPatternError(
      'reserved-official-id',
      '공식 근무 패턴 ID를 사용자 패턴으로 가져올 수 없습니다.',
      { patternId: payload.id },
    );
  }
  if (!reservedOfficialId && payload.source === 'official') {
    throw new ShiftPatternError(
      'official-contract-mismatch',
      '지원하지 않는 공식 근무 패턴 ID입니다.',
      { patternId: payload.id },
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(String(value.contentSha256))) {
    throw new ShiftPatternError('invalid-hash', '근무 패턴 SHA-256 값이 올바르지 않습니다.', {
      patternId: payload.id,
    });
  }
  const expectedHash = getShiftPatternContentSha256(payload);
  if (value.contentSha256 !== expectedHash) {
    throw new ShiftPatternError('invalid-hash', '근무 패턴 내용의 SHA-256이 일치하지 않습니다.', {
      patternId: payload.id,
    });
  }
  const signature = value.signature;
  if (signature !== null && typeof signature !== 'string') {
    throw new ShiftPatternError('invalid-signature', '근무 패턴 서명 형식이 올바르지 않습니다.', {
      patternId: payload.id,
    });
  }

  if (payload.source === 'official') {
    verifyOfficialSignature(
      payload,
      signature,
      options.keyring ?? OFFICIAL_PATTERN_PUBLIC_KEYRING,
    );
    return {
      id: payload.id,
      source: payload.source,
      name: payload.name,
      author: payload.author,
      sourceVersion: payload.sourceVersion,
      anchorDate: payload.anchorDate,
      shiftCodes: [...payload.shiftCodes],
      verification: {
        status: 'official-verified',
        algorithm: OFFICIAL_PATTERN_SIGNATURE_ALGORITHM,
        keyId: payload.keyId!,
        contentSha256: expectedHash,
      },
    };
  }

  if (signature !== null) {
    throw new ShiftPatternError(
      'invalid-schema',
      '사용자 근무 패턴에는 공식 전자서명을 넣을 수 없습니다.',
      { patternId: payload.id },
    );
  }
  return {
    id: payload.id,
    source: payload.source,
    name: payload.name,
    author: payload.author,
    sourceVersion: payload.sourceVersion,
    anchorDate: payload.anchorDate,
    shiftCodes: [...payload.shiftCodes],
    verification: {
      status: 'user-validated',
      algorithm: 'SHA256',
      keyId: null,
      contentSha256: expectedHash,
    },
  };
}

export type UserShiftPatternInput = {
  id: string;
  name: string;
  author?: string | null;
  sourceVersion?: number;
  anchorDate: string;
  shiftCodes: PatternShiftCode[];
  createdAt?: string;
};

export function serializeUserShiftPattern(input: UserShiftPatternInput): string {
  const rawPayload: Record<string, unknown> = {
    format: SHIFT_PATTERN_FORMAT,
    formatVersion: SHIFT_PATTERN_FORMAT_VERSION,
    id: input.id,
    source: 'user',
    name: input.name,
    author: input.author ?? null,
    sourceVersion: input.sourceVersion ?? 1,
    anchorDate: input.anchorDate,
    shiftCodes: input.shiftCodes,
    createdAt: input.createdAt ?? new Date().toISOString(),
    keyId: null,
  };
  const payload = parseCanonicalPayload(rawPayload);
  if (isOfficialPatternId(payload.id)) {
    throw new ShiftPatternError(
      'reserved-official-id',
      '공식 근무 패턴 ID를 사용자 패턴에 사용할 수 없습니다.',
      { patternId: payload.id },
    );
  }
  const document: ShiftPatternDocument = {
    ...payload,
    contentSha256: getShiftPatternContentSha256(payload),
    signature: null,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
