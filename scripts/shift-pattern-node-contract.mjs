import { Buffer } from 'node:buffer';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';

export const SHIFT_PATTERN_FORMAT = 'alarmpyo.shiftpattern';
export const SHIFT_PATTERN_UNSIGNED_SOURCE_FORMAT =
  'alarmpyo.shiftpattern.unsigned-source';
export const SHIFT_PATTERN_FORMAT_VERSION = 1;
export const SHIFT_PATTERN_ALGORITHM = 'ECDSA_P256_SHA256';
export const MAX_SHIFT_PATTERN_BYTES = 256 * 1024;
export const OFFICIAL_PATTERN_IDS = Object.freeze([
  'humantss_a',
  'humantss_b',
  'humantss_c',
]);
export const SIGNED_DOCUMENT_KEYS = Object.freeze([
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
]);
export const SOURCE_DOCUMENT_KEYS = Object.freeze(SIGNED_DOCUMENT_KEYS.slice(0, 11));

const P256_ORDER = BigInt(
  '0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551',
);
const P256_HALF_ORDER = P256_ORDER >> 1n;
const SHIFT_CODES = new Set([
  'DAY',
  'EVENING',
  'NIGHT',
  'OFF',
  'DAY_SUBSTITUTE',
  'NIGHT_SUBSTITUTE',
]);

export class ShiftPatternContractError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ShiftPatternContractError';
  }
}

export function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ShiftPatternContractError(`${label} 형식이 올바르지 않습니다.`);
  }
  const expectedSet = new Set(expected);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expectedSet.has(key))) {
    throw new ShiftPatternContractError(
      `${label}에 허용되지 않는 항목이 있거나 필요한 항목이 없습니다.`,
    );
  }
}

function normalizedString(value, label, maximumLength) {
  if (typeof value !== 'string') {
    throw new ShiftPatternContractError(`${label} 값이 올바르지 않습니다.`);
  }
  const normalized = value.normalize('NFC');
  if (
    normalized.trim().length === 0 ||
    normalized.length > maximumLength ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new ShiftPatternContractError(`${label} 값이 올바르지 않습니다.`);
  }
  return normalized;
}

function identifier(value, label) {
  const normalized = normalizedString(value, label, 64);
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u.test(normalized)) {
    throw new ShiftPatternContractError(`${label} 값이 올바르지 않습니다.`);
  }
  return normalized;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 9999) {
    throw new ShiftPatternContractError(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function dateKey(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new ShiftPatternContractError(`${label} 값이 올바르지 않습니다.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ShiftPatternContractError(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function isoDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new ShiftPatternContractError('생성 시각이 올바르지 않습니다.');
  }
  return value;
}

function shiftCodes(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 42 ||
    value.some((code) => typeof code !== 'string' || !SHIFT_CODES.has(code))
  ) {
    throw new ShiftPatternContractError('근무 반복 순서가 올바르지 않습니다.');
  }
  return [...value];
}

export function assertNoDuplicateJsonObjectKeys(contents) {
  const objects = [];
  let index = 0;
  while (index < contents.length) {
    const character = contents[index];
    if (character === '{') {
      objects.push(new Set());
      index += 1;
      continue;
    }
    if (character === '[') {
      objects.push(null);
      index += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      objects.pop();
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
      const current = contents[index];
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
    const keys = objects.at(-1);
    if (contents[lookahead] !== ':' || !keys) continue;
    let key;
    try {
      key = JSON.parse(contents.slice(start, end + 1));
    } catch {
      return;
    }
    if (keys.has(key)) {
      throw new ShiftPatternContractError('JSON에 중복된 항목이 있습니다.');
    }
    keys.add(key);
  }
}

export function parseJsonStrict(contents, label) {
  if (Buffer.byteLength(contents, 'utf8') > MAX_SHIFT_PATTERN_BYTES) {
    throw new ShiftPatternContractError(`${label}은 256KB 이하여야 합니다.`);
  }
  const withoutBom = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  assertNoDuplicateJsonObjectKeys(withoutBom);
  try {
    return JSON.parse(withoutBom);
  } catch (error) {
    throw new ShiftPatternContractError(`${label} JSON을 읽을 수 없습니다.`, {
      cause: error,
    });
  }
}

export function parseManifest(value) {
  exactKeys(value, ['schemaVersion', 'formatVersion', 'keyId', 'patterns'], 'manifest');
  if (value.schemaVersion !== 1 || value.formatVersion !== SHIFT_PATTERN_FORMAT_VERSION) {
    throw new ShiftPatternContractError('manifest 버전이 올바르지 않습니다.');
  }
  const keyId = identifier(value.keyId, '공개키 ID');
  if (!Array.isArray(value.patterns) || value.patterns.length !== 3) {
    throw new ShiftPatternContractError('manifest에는 공식 패턴 세 개가 있어야 합니다.');
  }
  const ids = new Set();
  const patterns = value.patterns.map((item) => {
    exactKeys(
      item,
      [
        'id',
        'fileName',
        'name',
        'author',
        'sourceVersion',
        'anchorDate',
        'shiftCodes',
        'createdAt',
      ],
      'manifest 패턴',
    );
    const id = identifier(item.id, '공식 패턴 ID');
    if (!OFFICIAL_PATTERN_IDS.includes(id) || ids.has(id)) {
      throw new ShiftPatternContractError('manifest 공식 패턴 ID가 올바르지 않습니다.');
    }
    ids.add(id);
    if (item.fileName !== `${id}.json`) {
      throw new ShiftPatternContractError('manifest 공식 패턴 파일 이름이 올바르지 않습니다.');
    }
    const codes = shiftCodes(item.shiftCodes);
    if (codes.length !== 6) {
      throw new ShiftPatternContractError('공식 패턴 주기는 6일이어야 합니다.');
    }
    return {
      id,
      fileName: item.fileName,
      name: normalizedString(item.name, '공식 패턴 이름', 80),
      author: normalizedString(item.author, '작성자', 80),
      sourceVersion: positiveInteger(item.sourceVersion, '패턴 버전'),
      anchorDate: dateKey(item.anchorDate, '기준일'),
      shiftCodes: codes,
      createdAt: isoDate(item.createdAt),
    };
  });
  if (patterns.some((pattern) => pattern.anchorDate !== '2026-08-01')) {
    throw new ShiftPatternContractError('공식 패턴 기준일은 2026-08-01이어야 합니다.');
  }
  return { schemaVersion: 1, formatVersion: 1, keyId, patterns };
}

export function parsePublicKeyring(value) {
  exactKeys(value, ['schemaVersion', 'algorithm', 'keys'], '공개키 keyring');
  if (value.schemaVersion !== 1 || value.algorithm !== SHIFT_PATTERN_ALGORITHM) {
    throw new ShiftPatternContractError('공개키 keyring 버전 또는 알고리즘이 올바르지 않습니다.');
  }
  if (!Array.isArray(value.keys)) {
    throw new ShiftPatternContractError('공개키 keyring 항목이 올바르지 않습니다.');
  }
  const ids = new Set();
  const keys = value.keys.map((item) => {
    exactKeys(item, ['id', 'algorithm', 'publicKeyBase64'], '공개키');
    const id = identifier(item.id, '공개키 ID');
    if (ids.has(id) || item.algorithm !== SHIFT_PATTERN_ALGORITHM) {
      throw new ShiftPatternContractError('공개키 항목이 중복되었거나 올바르지 않습니다.');
    }
    ids.add(id);
    if (typeof item.publicKeyBase64 !== 'string') {
      throw new ShiftPatternContractError('공개키 형식이 올바르지 않습니다.');
    }
    const raw = Buffer.from(item.publicKeyBase64, 'base64');
    if (
      raw.length !== 65 ||
      raw[0] !== 4 ||
      raw.toString('base64') !== item.publicKeyBase64
    ) {
      throw new ShiftPatternContractError('공개키는 canonical Base64 P-256 비압축 형식이어야 합니다.');
    }
    return { id, algorithm: SHIFT_PATTERN_ALGORITHM, publicKeyBase64: item.publicKeyBase64 };
  });
  return { schemaVersion: 1, algorithm: SHIFT_PATTERN_ALGORITHM, keys };
}

export function parseUnsignedSource(value, manifest) {
  exactKeys(value, SOURCE_DOCUMENT_KEYS, 'unsigned source');
  if (
    value.format !== SHIFT_PATTERN_UNSIGNED_SOURCE_FORMAT ||
    value.formatVersion !== SHIFT_PATTERN_FORMAT_VERSION ||
    value.source !== 'official'
  ) {
    throw new ShiftPatternContractError('unsigned source 계약이 올바르지 않습니다.');
  }
  const id = identifier(value.id, '공식 패턴 ID');
  const expected = manifest.patterns.find((pattern) => pattern.id === id);
  if (!expected) throw new ShiftPatternContractError('등록되지 않은 공식 패턴 ID입니다.');
  const source = {
    format: SHIFT_PATTERN_FORMAT,
    formatVersion: SHIFT_PATTERN_FORMAT_VERSION,
    id,
    source: 'official',
    name: normalizedString(value.name, '공식 패턴 이름', 80),
    author: normalizedString(value.author, '작성자', 80),
    sourceVersion: positiveInteger(value.sourceVersion, '패턴 버전'),
    anchorDate: dateKey(value.anchorDate, '기준일'),
    shiftCodes: shiftCodes(value.shiftCodes),
    createdAt: isoDate(value.createdAt),
    keyId: identifier(value.keyId, '공개키 ID'),
  };
  const comparable = {
    id: source.id,
    fileName: `${source.id}.json`,
    name: source.name,
    author: source.author,
    sourceVersion: source.sourceVersion,
    anchorDate: source.anchorDate,
    shiftCodes: source.shiftCodes,
    createdAt: source.createdAt,
  };
  if (JSON.stringify(comparable) !== JSON.stringify(expected) || source.keyId !== manifest.keyId) {
    throw new ShiftPatternContractError('unsigned source가 manifest와 일치하지 않습니다.');
  }
  return source;
}

export function canonicalizePayload(payload) {
  const ordered = {};
  for (const key of SOURCE_DOCUMENT_KEYS) ordered[key] = payload[key];
  return JSON.stringify(ordered);
}

export function contentSha256(payload) {
  return createHash('sha256').update(canonicalizePayload(payload), 'utf8').digest('hex');
}

function integerFromBytes(bytes) {
  return BigInt(`0x${bytes.toString('hex')}`);
}

function integerTo32Bytes(value) {
  return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
}

export function normalizeP256SignatureLowS(signature) {
  if (!Buffer.isBuffer(signature) || signature.length !== 64) {
    throw new ShiftPatternContractError('P-256 서명은 64바이트 compact 형식이어야 합니다.');
  }
  const r = signature.subarray(0, 32);
  const s = integerFromBytes(signature.subarray(32));
  if (s < 1n || s >= P256_ORDER) {
    throw new ShiftPatternContractError('P-256 서명의 S 값이 올바르지 않습니다.');
  }
  return s > P256_HALF_ORDER
    ? Buffer.concat([r, integerTo32Bytes(P256_ORDER - s)])
    : Buffer.from(signature);
}

export function rawPublicKeyFromKeyObject(keyObject) {
  const jwk = createPublicKey(keyObject).export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new ShiftPatternContractError('서명키는 ECDSA P-256 키여야 합니다.');
  }
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  if (x.length !== 32 || y.length !== 32) {
    throw new ShiftPatternContractError('P-256 공개키 좌표가 올바르지 않습니다.');
  }
  return Buffer.concat([Buffer.from([4]), x, y]);
}

export function publicKeyObjectFromRaw(raw) {
  if (!Buffer.isBuffer(raw) || raw.length !== 65 || raw[0] !== 4) {
    throw new ShiftPatternContractError('P-256 공개키 형식이 올바르지 않습니다.');
  }
  return createPublicKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: raw.subarray(1, 33).toString('base64url'),
      y: raw.subarray(33, 65).toString('base64url'),
    },
  });
}

export function loadP256PrivateKey(pem) {
  try {
    const key = createPrivateKey(pem);
    rawPublicKeyFromKeyObject(key);
    return key;
  } catch {
    throw new ShiftPatternContractError('Environment의 서명키가 유효한 ECDSA P-256 PKCS#8 PEM이 아닙니다.');
  }
}

export function signOfficialPayload(payload, privateKey) {
  const canonical = canonicalizePayload(payload);
  const signature = normalizeP256SignatureLowS(
    signBytes('sha256', Buffer.from(canonical, 'utf8'), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    }),
  );
  return {
    ...payload,
    contentSha256: contentSha256(payload),
    signature: signature.toString('base64'),
  };
}

export function parseAndVerifySignedDocument(value, manifest, keyring) {
  exactKeys(value, SIGNED_DOCUMENT_KEYS, '공식 패턴 파일');
  if (
    value.format !== SHIFT_PATTERN_FORMAT ||
    value.formatVersion !== SHIFT_PATTERN_FORMAT_VERSION ||
    value.source !== 'official'
  ) {
    throw new ShiftPatternContractError('공식 패턴 파일 계약이 올바르지 않습니다.');
  }
  const sourceShape = {};
  for (const key of SOURCE_DOCUMENT_KEYS) sourceShape[key] = value[key];
  sourceShape.format = SHIFT_PATTERN_UNSIGNED_SOURCE_FORMAT;
  const payload = parseUnsignedSource(sourceShape, manifest);
  if (typeof value.contentSha256 !== 'string' || value.contentSha256 !== contentSha256(payload)) {
    throw new ShiftPatternContractError('공식 패턴 SHA-256이 일치하지 않습니다.');
  }
  if (typeof value.signature !== 'string') {
    throw new ShiftPatternContractError('공식 패턴 서명이 없습니다.');
  }
  const signature = Buffer.from(value.signature, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== value.signature) {
    throw new ShiftPatternContractError('공식 패턴 서명 형식이 올바르지 않습니다.');
  }
  if (integerFromBytes(signature.subarray(32)) > P256_HALF_ORDER) {
    throw new ShiftPatternContractError('공식 패턴 서명은 low-S 형식이어야 합니다.');
  }
  const registered = keyring.keys.find((key) => key.id === payload.keyId);
  if (!registered) throw new ShiftPatternContractError('등록된 공식 패턴 공개키가 없습니다.');
  const publicKey = publicKeyObjectFromRaw(Buffer.from(registered.publicKeyBase64, 'base64'));
  if (
    !verifyBytes('sha256', Buffer.from(canonicalizePayload(payload), 'utf8'), {
      key: publicKey,
      dsaEncoding: 'ieee-p1363',
    }, signature)
  ) {
    throw new ShiftPatternContractError('공식 패턴 전자서명이 올바르지 않습니다.');
  }
  return value;
}
