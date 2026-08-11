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
        versionName: '1.0.0',
        androidVersionCode: 1,
        iosBuildNumber: '1',
      },
      releaseState: 'blocked',
      releaseBlockers: [
        'productionHostingUrl',
        'signingCertificateSha256',
      ],
      expoProjectId: 'ffdda16b-a290-4fc6-919b-fddd50e0c25f',
      productionHostingUrl: null,
      signingCertificateSha256: [],
    });
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
