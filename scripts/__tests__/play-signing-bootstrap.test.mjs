import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertPlaySigningBootstrapAllowed,
  PLAY_SIGNING_BOOTSTRAP_OPT_IN,
} from '../play-signing-bootstrap.mjs';

function source(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function context(overrides = {}) {
  return {
    environment: { [PLAY_SIGNING_BOOTSTRAP_OPT_IN]: '1' },
    directPolicy: {
      signingCertificateSha256: ['a'.repeat(64)],
    },
    playPolicy: {
      releaseState: 'blocked',
      releaseBlockers: [
        'privacyPolicyUrl',
        'appSigningCertificateSha256',
      ],
      privacyPolicyUrl: null,
      appSigningStrategy: 'google-play-managed-separate',
      appSigningCertificateSha256: null,
      directUpgradeCompatible: null,
    },
    ...overrides,
  };
}

describe('Play App Signing 첫 인증서 부트스트랩', () => {
  it('정확한 1회성 opt-in에서만 제출 불가 draft 문맥을 허용해요', () => {
    expect(assertPlaySigningBootstrapAllowed(context())).toEqual({
      purpose: 'play-signing-bootstrap',
      buildProfile: 'play-signing-bootstrap',
      submissionEligible: false,
    });
    for (const value of [undefined, '', 'true', '0']) {
      expect(() =>
        assertPlaySigningBootstrapAllowed(
          context({ environment: { [PLAY_SIGNING_BOOTSTRAP_OPT_IN]: value } }),
        ),
      ).toThrow(PLAY_SIGNING_BOOTSTRAP_OPT_IN);
    }
  });

  it('서명 계보가 결정됐거나 direct 인증서가 없으면 다시 실행하지 못해요', () => {
    expect(() =>
      assertPlaySigningBootstrapAllowed(
        context({ directPolicy: { signingCertificateSha256: [] } }),
      ),
    ).toThrow('direct 서명 인증서');
    expect(() =>
      assertPlaySigningBootstrapAllowed(
        context({
          playPolicy: {
            releaseState: 'active',
            releaseBlockers: [],
            appSigningStrategy: 'google-play-managed-separate',
            appSigningCertificateSha256: 'b'.repeat(64),
            directUpgradeCompatible: false,
          },
        }),
      ),
    ).toThrow('blocked 정책');
  });

  it('저장소의 Play 인증서는 이미 확정되어 부트스트랩을 다시 열지 않아요', () => {
    const playPolicy = JSON.parse(source('play-release-policy.json'));

    expect(() =>
      assertPlaySigningBootstrapAllowed(
        context({
          playPolicy: {
            ...playPolicy,
            directUpgradeCompatible: false,
          },
        }),
      ),
    ).toThrow('blocked 정책');
  });

  it('signer 결정을 하지 않았거나 direct 호환 전략이면 열리지 않아요', () => {
    for (const appSigningStrategy of [null, 'direct-compatible']) {
      expect(() =>
        assertPlaySigningBootstrapAllowed(
          context({
            playPolicy: {
              ...context().playPolicy,
              appSigningStrategy,
            },
          }),
        ),
      ).toThrow('별도 signer');
    }
  });

  it('전용 preview AAB 경로를 일반 preflight·제출과 분리해요', () => {
    const pkg = JSON.parse(source('package.json'));
    const eas = JSON.parse(source('eas.json'));
    const preflight = source('scripts/run-play-signing-bootstrap-preflight.mjs');
    const validator = source('scripts/validate-play-signing-bootstrap-aab.mjs');
    const normalPreflight = source('scripts/run-play-preflight.mjs');
    const submit = source('scripts/submit-play-internal.mjs');

    expect(pkg.scripts['release:preflight:play-signing-bootstrap']).toBe(
      'node scripts/run-play-signing-bootstrap-preflight.mjs',
    );
    expect(pkg.scripts['release:verify:aab:play-signing-bootstrap']).toBe(
      'node scripts/validate-play-signing-bootstrap-aab.mjs',
    );
    expect(pkg.scripts['build:aab:play-signing-bootstrap']).toContain(
      '--profile play-signing-bootstrap',
    );
    expect(eas.build['play-signing-bootstrap']).toMatchObject({
      environment: 'preview',
      distribution: 'store',
      env: { ALARMPYO_DISTRIBUTION: 'play' },
      android: { buildType: 'app-bundle' },
    });
    expect(preflight).toContain('allowBlocked: true');
    expect(preflight).toContain('assertPlaySigningBootstrapAllowed');
    expect(preflight).toContain("['run', 'release:source']");
    expect(validator).toContain('allowPlaySigningBootstrap: true');
    expect(validator).toContain("'play-signing-bootstrap'");
    expect(normalPreflight).toContain(
      'readReleasePolicy(root, { allowBlocked: true })',
    );
    expect(normalPreflight).toContain(
      'readPlayReleasePolicy(root, directPolicy)',
    );
    expect(submit).not.toContain('play-signing-bootstrap');
    expect(pkg.scripts['submit:internal']).not.toContain('bootstrap');
  });

  it('부트스트랩 출처를 일반 제출 가능 출처와 구분해요', () => {
    const validator = source('scripts/validate-play-aab.mjs');
    const policy = source('scripts/play-release-policy.mjs');

    expect(validator).toContain("purpose: 'play-release'");
    expect(validator).toContain('releasePurpose: releaseContext.purpose');
    expect(validator).toContain(
      'submissionEligible: releaseContext.submissionEligible',
    );
    expect(policy).toContain("'releasePurpose'");
    expect(policy).toContain("'submissionEligible'");
  });
});
