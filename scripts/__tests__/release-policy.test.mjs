import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertImmutableArtifact,
  assertReleaseVersionIsNewer,
  assertTrustedSigningCertificates,
  readReleasePolicy,
} from '../release-policy.mjs';

const root = resolve(import.meta.dirname, '..', '..');

const policy = {
  signingCertificateSha256: ['a'.repeat(64)],
};

describe('APK 운영 배포 정책', () => {
  it('운영 값이 없는 새 계보를 명시적으로 차단해요', async () => {
    await expect(readReleasePolicy(root)).rejects.toThrow(
      'AlarmPyo 릴리스 계보가 아직 차단되어 있어요',
    );
    await expect(
      readReleasePolicy(root, { allowBlocked: true }),
    ).resolves.toMatchObject({
      lineage: 'alarmpyo',
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseState: 'blocked',
      releaseBlockers: ['productionHostingUrl'],
      productionHostingUrl: null,
    });
    const actual = await readReleasePolicy(root, { allowBlocked: true });
    expect(actual.expoProjectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(actual.signingCertificateSha256).toHaveLength(1);
    expect(actual.signingCertificateSha256[0]).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('현재 공개 버전보다 큰 versionCode만 허용해요', () => {
    expect(() =>
      assertReleaseVersionIsNewer(2, { versionCode: 1 }),
    ).not.toThrow();
    expect(() =>
      assertReleaseVersionIsNewer(1, { versionCode: 1 }),
    ).toThrow('현재 공개 버전 코드');
    expect(() =>
      assertReleaseVersionIsNewer(0, { versionCode: 1 }),
    ).toThrow('확인할 수 없어요');
  });

  it('운영 인증서 SHA-256과 정확히 같은 APK만 허용해요', () => {
    expect(() =>
      assertTrustedSigningCertificates(['A'.repeat(64)], policy),
    ).not.toThrow();
    expect(() =>
      assertTrustedSigningCertificates(['b'.repeat(64)], policy),
    ).toThrow('운영 인증서');
  });

  it('같은 공개 경로에는 같은 해시만 다시 준비할 수 있어요', () => {
    expect(() =>
      assertImmutableArtifact('a'.repeat(64), 'A'.repeat(64)),
    ).not.toThrow();
    expect(() =>
      assertImmutableArtifact('a'.repeat(64), 'b'.repeat(64)),
    ).toThrow('덮어쓸 수 없어요');
  });
});
