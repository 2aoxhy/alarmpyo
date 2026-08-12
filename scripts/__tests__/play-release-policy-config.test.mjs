import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  readPlayReleasePolicy,
  validatePlayReleasePolicy,
} from '../play-release-policy.mjs';
import { readReleasePolicy } from '../release-policy.mjs';

const root = resolve(import.meta.dirname, '..', '..');

describe('Play 배포 정책', () => {
  it('확정된 별도 Play signer를 유지하고 공개 개인정보처리방침만 blocker로 남겨요', async () => {
    const direct = await readReleasePolicy(root, { allowBlocked: true });

    await expect(
      readPlayReleasePolicy(root, direct, { allowBlocked: true }),
    ).resolves.toMatchObject({
      releaseState: 'blocked',
      releaseBlockers: ['privacyPolicyUrl'],
      privacyPolicyUrl: null,
      appSigningStrategy: 'google-play-managed-separate',
      appSigningCertificateSha256:
        '08fccbdd720998439752f1748f28c7c6a47430d3ddb6e02b10cdf775b479bcad',
      directUpgradeCompatible: false,
    });
    await expect(readPlayReleasePolicy(root, direct)).rejects.toThrow(
      '공개 개인정보처리방침 URL',
    );
  });

  it('direct Hosting이 막혀 있어도 Play 자체 blocker만 해소하면 활성화해요', () => {
    const direct = {
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseBlockers: ['productionHostingUrl'],
      signingCertificateSha256: ['a'.repeat(64)],
    };
    const play = {
      schemaVersion: 2,
      lineage: 'alarmpyo',
      packageName: 'com.personal.alarmpyo',
      initialRelease: direct.initialRelease,
      releaseState: 'active',
      releaseBlockers: [],
      privacyPolicyUrl:
        'https://owner.github.io/alarmpyo/privacy-policy.html',
      appSigningStrategy: 'google-play-managed-separate',
      appSigningCertificateSha256: 'B'.repeat(64).toLowerCase(),
      targetSdk: 36,
      bundletool: { version: '1.18.3', sha256: 'c'.repeat(64) },
    };

    expect(validatePlayReleasePolicy(play, direct)).toMatchObject({
      appSigningCertificateSha256: 'b'.repeat(64),
      directUpgradeCompatible: false,
      releaseState: 'active',
      privacyPolicyUrl:
        'https://owner.github.io/alarmpyo/privacy-policy.html',
    });
  });

  it('HTTPS 개인정보처리방침의 경로는 허용하고 인증·쿼리·조각은 거부해요', () => {
    const direct = {
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseBlockers: ['productionHostingUrl'],
      signingCertificateSha256: ['a'.repeat(64)],
    };
    const policy = {
      schemaVersion: 2,
      lineage: 'alarmpyo',
      packageName: direct.packageName,
      initialRelease: direct.initialRelease,
      releaseState: 'active',
      releaseBlockers: [],
      privacyPolicyUrl:
        'https://owner.github.io/alarmpyo/privacy-policy.html',
      appSigningStrategy: 'google-play-managed-separate',
      appSigningCertificateSha256: 'b'.repeat(64),
    };

    expect(() => validatePlayReleasePolicy(policy, direct)).not.toThrow();
    for (const privacyPolicyUrl of [
      'http://owner.github.io/alarmpyo/privacy-policy.html',
      'https://user:secret@owner.github.io/alarmpyo/privacy-policy.html',
      'https://owner.github.io/alarmpyo/privacy-policy.html?source=play',
      'https://owner.github.io/alarmpyo/privacy-policy.html?',
      'https://owner.github.io/alarmpyo/privacy-policy.html#policy',
      'https://owner.github.io/alarmpyo/privacy-policy.html#',
    ]) {
      expect(() =>
        validatePlayReleasePolicy(
          { ...policy, privacyPolicyUrl },
          direct,
        ),
      ).toThrow('Play AAB 배포 정책 파일');
    }
  });

  it('개인정보처리방침 URL과 blocker 상태가 반드시 일치해야 해요', () => {
    const direct = {
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseBlockers: ['productionHostingUrl'],
    };
    const blocked = {
      schemaVersion: 2,
      lineage: 'alarmpyo',
      packageName: direct.packageName,
      initialRelease: direct.initialRelease,
      releaseState: 'blocked',
      releaseBlockers: [
        'privacyPolicyUrl',
        'appSigningCertificateSha256',
      ],
      privacyPolicyUrl: null,
      appSigningStrategy: null,
      appSigningCertificateSha256: null,
    };

    expect(() =>
      validatePlayReleasePolicy(
        {
          ...blocked,
          releaseBlockers: ['appSigningCertificateSha256'],
        },
        direct,
        { allowBlocked: true },
      ),
    ).toThrow('Play AAB 배포 정책 파일');
    expect(() =>
      validatePlayReleasePolicy(
        {
          ...blocked,
          privacyPolicyUrl:
            'https://owner.github.io/alarmpyo/privacy-policy.html',
        },
        direct,
        { allowBlocked: true },
      ),
    ).toThrow('Play AAB 배포 정책 파일');
    expect(() =>
      validatePlayReleasePolicy(
        {
          ...blocked,
          productionHostingUrl: 'https://downloads.example.com',
        },
        direct,
        { allowBlocked: true },
      ),
    ).toThrow('Play AAB 배포 정책 파일');
  });

  it('Play 인증서가 없으면 해당 blocker를 제거할 수 없어요', () => {
    const direct = {
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseBlockers: [],
    };
    expect(() =>
      validatePlayReleasePolicy(
        {
          schemaVersion: 2,
          lineage: 'alarmpyo',
          packageName: direct.packageName,
          initialRelease: direct.initialRelease,
          releaseState: 'active',
          releaseBlockers: [],
          privacyPolicyUrl:
            'https://owner.github.io/alarmpyo/privacy-policy.html',
          appSigningStrategy: 'google-play-managed-separate',
          appSigningCertificateSha256: null,
        },
        direct,
      ),
    ).toThrow('Play AAB 배포 정책 파일');
  });

  it('별도 Play signer가 direct 인증서와 같으면 정책을 거부해요', () => {
    const direct = {
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseBlockers: [],
      signingCertificateSha256: ['a'.repeat(64)],
    };
    expect(() =>
      validatePlayReleasePolicy(
        {
          schemaVersion: 2,
          lineage: 'alarmpyo',
          packageName: direct.packageName,
          initialRelease: direct.initialRelease,
          releaseState: 'active',
          releaseBlockers: [],
          privacyPolicyUrl:
            'https://owner.github.io/alarmpyo/privacy-policy.html',
          appSigningStrategy: 'google-play-managed-separate',
          appSigningCertificateSha256: 'a'.repeat(64),
        },
        direct,
      ),
    ).toThrow('Play AAB 배포 정책 파일');
  });

  it('direct 호환 전략은 같은 인증서를 명시했을 때만 허용해요', () => {
    const direct = {
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseBlockers: [],
      signingCertificateSha256: ['a'.repeat(64)],
    };
    expect(
      validatePlayReleasePolicy(
        {
          schemaVersion: 2,
          lineage: 'alarmpyo',
          packageName: direct.packageName,
          initialRelease: direct.initialRelease,
          releaseState: 'active',
          releaseBlockers: [],
          privacyPolicyUrl:
            'https://owner.github.io/alarmpyo/privacy-policy.html',
          appSigningStrategy: 'direct-compatible',
          appSigningCertificateSha256: 'a'.repeat(64),
        },
        direct,
      ),
    ).toMatchObject({ directUpgradeCompatible: true });
  });
});
