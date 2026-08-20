import { p256 } from '@noble/curves/nist.js';
import { describe, expect, it } from 'vitest';

import type { PatternShiftCode } from '../../models/app-data';
import { bytesToBase64 } from '../../utils/base64';
import {
  MAX_SHIFT_PATTERN_BYTES,
  OFFICIAL_PATTERN_DEFINITIONS,
  OFFICIAL_PATTERN_IDS,
  OFFICIAL_PATTERN_PUBLIC_KEYRING,
  SHIFT_PATTERN_FORMAT,
  SHIFT_PATTERN_FORMAT_VERSION,
  ShiftPatternError,
  canonicalizeShiftPatternPayload,
  getShiftPatternContentSha256,
  parseAndValidateShiftPattern,
  serializeUserShiftPattern,
  type OfficialPatternPublicKeyring,
  type ShiftPatternCanonicalPayload,
} from '../shift-pattern-schema';

const secretKey = Uint8Array.from([...Array(31).fill(0), 1]);
const publicKey = p256.getPublicKey(secretKey, false);

function createOfficialDocument(id: (typeof OFFICIAL_PATTERN_IDS)[number]) {
  const definition = OFFICIAL_PATTERN_DEFINITIONS.get(id)!;
  const payload: ShiftPatternCanonicalPayload = {
    format: SHIFT_PATTERN_FORMAT,
    formatVersion: SHIFT_PATTERN_FORMAT_VERSION,
    id,
    source: 'official',
    name: definition.name,
    author: definition.author,
    sourceVersion: definition.sourceVersion,
    anchorDate: definition.anchorDate,
    shiftCodes: [...definition.shiftCodes],
    createdAt: definition.createdAt,
    keyId: 'alarmpyo-official-patterns-v1',
  };
  const signature = p256.sign(
    new TextEncoder().encode(canonicalizeShiftPatternPayload(payload)),
    secretKey,
    { format: 'compact', lowS: true, prehash: true },
  );
  return {
    ...payload,
    contentSha256: getShiftPatternContentSha256(payload),
    signature: bytesToBase64(signature),
  };
}

function testKeyring(): OfficialPatternPublicKeyring {
  return new Map([
    [
      'alarmpyo-official-patterns-v1',
      {
        id: 'alarmpyo-official-patterns-v1',
        algorithm: 'ECDSA_P256_SHA256' as const,
        publicKeyBase64: bytesToBase64(publicKey),
      },
    ],
  ]);
}

describe('V12 근무 패턴 파일 계약', () => {
  it('공식 세 패턴의 6일 순서와 기준일을 고정합니다', () => {
    expect(
      OFFICIAL_PATTERN_IDS.map((id) => {
        const definition = OFFICIAL_PATTERN_DEFINITIONS.get(id)!;
        return [id, definition.anchorDate, definition.shiftCodes];
      }),
    ).toEqual([
      ['humantss_a', '2026-08-01', ['NIGHT', 'NIGHT', 'OFF', 'OFF', 'DAY', 'DAY']],
      ['humantss_b', '2026-08-01', ['OFF', 'OFF', 'DAY', 'DAY', 'NIGHT', 'NIGHT']],
      ['humantss_c', '2026-08-01', ['DAY', 'DAY', 'NIGHT', 'NIGHT', 'OFF', 'OFF']],
    ]);
  });

  it('canonical SHA-256와 P-256 low-S 서명이 맞는 공식 패턴만 검증합니다', () => {
    const document = createOfficialDocument('humantss_a');
    const parsed = parseAndValidateShiftPattern(JSON.stringify(document), {
      keyring: testKeyring(),
    });

    expect(parsed).toMatchObject({
      id: 'humantss_a',
      source: 'official',
      verification: {
        status: 'official-verified',
        algorithm: 'ECDSA_P256_SHA256',
      },
    });
  });

  it('production keyring과 다른 서명키는 공식 성공으로 처리하지 않습니다', () => {
    expect(() => parseAndValidateShiftPattern(JSON.stringify(createOfficialDocument('humantss_a'))))
      .toThrowError(
        expect.objectContaining<Partial<ShiftPatternError>>({
          code: OFFICIAL_PATTERN_PUBLIC_KEYRING.size === 0 ? 'unknown-key' : 'invalid-signature',
        }),
      );
  });

  it('공식 ID를 사용자 패턴으로 강등하거나 잘못된 서명을 허용하지 않습니다', () => {
    const official = createOfficialDocument('humantss_b');
    const userImpersonation = {
      ...official,
      source: 'user',
      keyId: null,
      signature: null,
    };
    const payload = { ...userImpersonation };
    delete (payload as Partial<typeof userImpersonation>).contentSha256;
    delete (payload as Partial<typeof userImpersonation>).signature;
    userImpersonation.contentSha256 = getShiftPatternContentSha256(
      payload as ShiftPatternCanonicalPayload,
    );

    expect(() => parseAndValidateShiftPattern(JSON.stringify(userImpersonation), {
      keyring: testKeyring(),
    })).toThrowError(
      expect.objectContaining<Partial<ShiftPatternError>>({ code: 'reserved-official-id' }),
    );

    const tamperedSignature = { ...official, signature: `${official.signature.slice(0, -4)}AAAA` };
    expect(() => parseAndValidateShiftPattern(JSON.stringify(tamperedSignature), {
      keyring: testKeyring(),
    })).toThrowError(
      expect.objectContaining<Partial<ShiftPatternError>>({ code: 'invalid-signature' }),
    );
  });

  it('사용자 파일은 NFC·1~42일·허용 코드만 정규화하고 시간·알람 필드를 받지 않습니다', () => {
    const shiftCodes: PatternShiftCode[] = [
      'DAY',
      'EVENING',
      'NIGHT',
      'OFF',
      'DAY_SUBSTITUTE',
      'NIGHT_SUBSTITUTE',
    ];
    const contents = serializeUserShiftPattern({
      id: 'my-pattern',
      name: '\u1100\u1161',
      anchorDate: '2026-08-01',
      shiftCodes,
      createdAt: '2026-08-20T00:00:00.000Z',
    });
    expect(parseAndValidateShiftPattern(contents)).toMatchObject({
      name: '가',
      shiftCodes,
      verification: { status: 'user-validated', algorithm: 'SHA256' },
    });

    const withAlarm = JSON.parse(contents) as Record<string, unknown>;
    withAlarm.alarmEnabled = true;
    expect(() => parseAndValidateShiftPattern(JSON.stringify(withAlarm))).toThrowError(
      expect.objectContaining<Partial<ShiftPatternError>>({ code: 'invalid-schema' }),
    );
  });

  it('unknown field, 중복 키, 변조 hash와 256KB 초과 파일을 거부합니다', () => {
    const contents = serializeUserShiftPattern({
      id: 'strict-pattern',
      name: '엄격한 패턴',
      anchorDate: '2026-08-01',
      shiftCodes: ['DAY'],
      createdAt: '2026-08-20T00:00:00.000Z',
    });
    const value = JSON.parse(contents) as Record<string, unknown>;
    value.contentSha256 = '0'.repeat(64);
    expect(() => parseAndValidateShiftPattern(JSON.stringify(value))).toThrowError(
      expect.objectContaining<Partial<ShiftPatternError>>({ code: 'invalid-hash' }),
    );
    expect(() => parseAndValidateShiftPattern('{"format":"a","format":"b"}')).toThrowError(
      expect.objectContaining<Partial<ShiftPatternError>>({ code: 'invalid-schema' }),
    );
    expect(() => parseAndValidateShiftPattern(' '.repeat(MAX_SHIFT_PATTERN_BYTES + 1))).toThrowError(
      expect.objectContaining<Partial<ShiftPatternError>>({ code: 'file-too-large' }),
    );
  });
});
