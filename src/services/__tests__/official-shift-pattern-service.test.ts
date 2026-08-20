import { p256 } from '@noble/curves/nist.js';
import { describe, expect, it, vi } from 'vitest';

import { bytesToBase64 } from '../../utils/base64';
import {
  OFFICIAL_PATTERN_DEFINITIONS,
  SHIFT_PATTERN_FORMAT,
  canonicalizeShiftPatternPayload,
  getShiftPatternContentSha256,
  type OfficialPatternPublicKeyring,
  type ShiftPatternCanonicalPayload,
} from '../shift-pattern-schema';
import {
  fetchOfficialShiftPatternOnDemand,
  fetchOfficialShiftPatternsOnDemand,
} from '../official-shift-pattern-service';

const secretKey = Uint8Array.from([...Array(31).fill(0), 2]);
const publicKey = p256.getPublicKey(secretKey, false);
const keyring: OfficialPatternPublicKeyring = new Map([
  [
    'alarmpyo-official-patterns-v1',
    {
      id: 'alarmpyo-official-patterns-v1',
      algorithm: 'ECDSA_P256_SHA256',
      publicKeyBase64: bytesToBase64(publicKey),
    },
  ],
]);

function signedContents(id: 'humantss_a' | 'humantss_b' | 'humantss_c') {
  const definition = OFFICIAL_PATTERN_DEFINITIONS.get(id)!;
  const payload: ShiftPatternCanonicalPayload = {
    format: SHIFT_PATTERN_FORMAT,
    formatVersion: 1,
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
  return JSON.stringify({
    ...payload,
    contentSha256: getShiftPatternContentSha256(payload),
    signature: bytesToBase64(
      p256.sign(new TextEncoder().encode(canonicalizeShiftPatternPayload(payload)), secretKey, {
        format: 'compact',
        lowS: true,
        prehash: true,
      }),
    ),
  });
}

function responseFor(id: 'humantss_a' | 'humantss_b' | 'humantss_c') {
  const contents = signedContents(id);
  return {
    ok: true,
    status: 200,
    url: `https://example.test/patterns/${id}.json`,
    headers: new Headers({
      'content-length': String(new TextEncoder().encode(contents).length),
      'content-type': 'application/json; charset=utf-8',
    }),
    text: async () => contents,
  } as Response;
}

describe('공식 패턴 수동 조회', () => {
  it('HTTPS 고정 경로를 no-store·무자격 증명으로 한 번 조회하고 검증합니다', async () => {
    const fetchImpl = vi.fn(async () => responseFor('humantss_a')) as unknown as typeof fetch;
    await expect(
      fetchOfficialShiftPatternOnDemand('humantss_a', {
        baseUrl: 'https://example.test/patterns',
        fetchImpl,
        keyring,
      }),
    ).resolves.toMatchObject({ id: 'humantss_a', source: 'official' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://example.test/patterns/humantss_a.json'),
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        method: 'GET',
        redirect: 'follow',
      }),
    );
  });

  it('세 파일 오류를 user 패턴으로 바꾸지 않고 패턴별 실패로 반환합니다', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      const id = /humantss_[abc]/u.exec(url)?.[0] as
        | 'humantss_a'
        | 'humantss_b'
        | 'humantss_c';
      const response = responseFor(id);
      if (id === 'humantss_b') {
        return { ...response, text: async () => response.text().then((text) => text.replace('NIGHT', 'DAY')) } as Response;
      }
      return response;
    }) as unknown as typeof fetch;

    const results = await fetchOfficialShiftPatternsOnDemand({
      baseUrl: 'https://example.test/patterns',
      fetchImpl,
      keyring,
    });
    expect(results.map((result) => [result.id, result.status])).toEqual([
      ['humantss_a', 'ready'],
      ['humantss_b', 'error'],
      ['humantss_c', 'ready'],
    ]);
    expect(results[1]).toMatchObject({ status: 'error', error: { code: 'invalid-hash' } });
  });

  it('HTTP 오류, 과대 응답과 다른 주소 redirect를 거부합니다', async () => {
    const baseUrl = 'https://example.test/patterns';
    await expect(
      fetchOfficialShiftPatternOnDemand('humantss_a', {
        baseUrl,
        fetchImpl: vi.fn(async () => ({
          ok: false,
          status: 404,
          url: `${baseUrl}/humantss_a.json`,
          headers: new Headers(),
        })) as unknown as typeof fetch,
        keyring,
      }),
    ).rejects.toMatchObject({ code: 'http' });

    await expect(
      fetchOfficialShiftPatternOnDemand('humantss_a', {
        baseUrl,
        fetchImpl: vi.fn(async () => ({
          ...responseFor('humantss_a'),
          headers: new Headers({ 'content-length': String(256 * 1024 + 1) }),
        })) as unknown as typeof fetch,
        keyring,
      }),
    ).rejects.toMatchObject({ code: 'file-too-large' });

    await expect(
      fetchOfficialShiftPatternOnDemand('humantss_a', {
        baseUrl,
        fetchImpl: vi.fn(async () => ({
          ...responseFor('humantss_a'),
          url: 'https://attacker.example/humantss_a.json',
        })) as unknown as typeof fetch,
        keyring,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });
});
