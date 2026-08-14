// Vitest는 Node.js에서 실행하지만 앱 tsconfig은 Node 타입을 노출하지 않습니다.
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error 테스트 런너에서 제공하는 Node.js 표준 모듈입니다.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function json(relativePath: string): Record<string, any> {
  return JSON.parse(source(relativePath));
}

function workflowActionReferences(relativePath: string): string[] {
  return [
    ...source(relativePath).matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/gmu),
  ].map(([, reference]) => reference);
}

describe('저장소 자동화 계약', () => {
  it('로컬과 EAS와 GitHub가 같은 Node와 npm을 사용해요', () => {
    const pkg = json('package.json');
    const lock = json('package-lock.json');
    const eas = json('eas.json');

    expect(source('.node-version').trim()).toBe('24.16.0');
    expect(pkg.engines).toEqual({ node: '24.16.0', npm: '11.13.0' });
    expect(pkg.packageManager).toBe('npm@11.13.0');
    expect(lock.packages[''].engines).toEqual(pkg.engines);
    expect(eas.build.base.node).toBe(pkg.engines.node);
    expect(pkg.scripts['verify:toolchain']).toBe(
      'node scripts/verify-toolchain.mjs',
    );
    for (const name of [
      'release:preflight',
      'release:preflight:update',
    ]) {
      expect(pkg.scripts[name]).toContain('npm run verify:toolchain');
    }
    expect(source('scripts/run-internal-canary-preflight.mjs')).toContain(
      'verifyExactToolchain();',
    );
    expect(source('scripts/run-play-preflight.mjs')).toContain(
      'verifyExactToolchain();',
    );
    expect(eas.build.stable.env).toEqual({
      ALARMPYO_DISTRIBUTION: 'direct',
    });
  });

  it('앱은 1.0.4(5) 후속 후보이고 direct·Play의 첫 릴리스 계보는 유지해요', () => {
    const pkg = json('package.json');
    const lock = json('package-lock.json');
    const app = json('app.json').expo;
    const direct = json('release-policy.json');
    const play = json('play-release-policy.json');
    const candidate = {
      versionName: app.version,
      androidVersionCode: app.android.versionCode,
      iosBuildNumber: app.ios.buildNumber,
    };

    expect(pkg.version).toBe('1.0.4');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
    expect(candidate).toEqual({
      versionName: '1.0.4',
      androidVersionCode: 5,
      iosBuildNumber: '5',
    });
    expect(direct.initialRelease).toEqual({
      versionName: '1.0.1',
      androidVersionCode: 2,
      iosBuildNumber: '2',
    });
    expect(play.initialRelease).toEqual(direct.initialRelease);
    expect(direct.releaseBlockers).toEqual(['productionHostingUrl']);
    expect(play.releaseState).toBe('active');
    expect(play.releaseBlockers).toEqual([]);
    expect(play.privacyPolicyUrl).toMatch(/^https:\/\/[^/?#@]+\/[^?#]+$/u);
    expect(play.appSigningCertificateSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(direct.signingCertificateSha256).not.toContain(
      play.appSigningCertificateSha256,
    );
    expect(play.appSigningStrategy).toBe(
      'google-play-managed-separate',
    );
    const playSchema = json('docs/play-release-policy.schema.json');
    expect(playSchema.required).toContain('privacyPolicyUrl');
    expect(playSchema.properties.releaseBlockers.items.enum).toEqual([
      'privacyPolicyUrl',
      'appSigningCertificateSha256',
    ]);
    expect(playSchema.properties.privacyPolicyUrl.oneOf[1].pattern).toBe(
      '^https://[^/?#@]+(?:/[^?#]*)?$',
    );
    expect(
      json('docs/play-release-evidence.example.json')
        .highestPreviouslyDistributedVersionCode,
    ).toBe(4);
    expect(
      json('docs/play-release-evidence.example.json')
        .highestExistingPlayVersionCode,
    ).toBe(4);
  });

  it('PR JavaScript 검사와 네이티브 경로 검사를 분리해요', () => {
    const javascript = source('.github/workflows/javascript-checks.yml');
    const native = source('.github/workflows/native-checks.yml');

    expect(javascript).toMatch(/push:\s+branches:\s+- main/u);
    expect(javascript).toContain('pull_request:');
    expect(javascript).toContain('npm ci');
    expect(javascript).toContain('npm run assets:brand:check');
    expect(javascript).toContain('npm run check');
    expect(javascript).toContain('npm run audit:dependencies');
    expect(javascript).toContain('npm run audit:tooling');
    expect(javascript.match(/github\.event_name != 'push'/gu)).toHaveLength(2);
    expect(javascript).toContain('node-version-file: .node-version');
    expect(native).toContain('modules/alarmpyo-alarm/**');
    expect(native).toContain('plugins/**');
    expect(native).toContain('npm run test:android-native');
    expect(native).toContain("java-version: '17'");
  });

  it('브랜드 마스터에서 파생 자산을 만들고 CI와 Play 사전 검사에서 드리프트를 차단해요', () => {
    const pkg = json('package.json');
    const javascript = source('.github/workflows/javascript-checks.yml');
    const playPreflight = source('scripts/run-play-preflight.mjs');

    expect(pkg.scripts['assets:brand:generate']).toBe(
      'node scripts/generate-brand-assets.mjs --write',
    );
    expect(pkg.scripts['assets:brand:check']).toBe(
      'node scripts/generate-brand-assets.mjs --check',
    );
    expect(javascript).toContain('npm run assets:brand:check');
    expect(playPreflight).toContain("runNpm(['run', 'assets:brand:check'])");
    expect(playPreflight).toContain("'release:verify:play-store-assets'");
    expect(playPreflight).toContain("'--allow-missing-screenshots'");
  });

  it('주간 보안 감사와 Dependabot 업데이트를 예약해요', () => {
    const audit = source('.github/workflows/security-audit.yml');
    const dependabot = source('.github/dependabot.yml');

    expect(audit).toContain('schedule:');
    expect(audit).toContain('node-version-file: .node-version');
    expect(audit).toContain('test "$(node --version)" = "v24.16.0"');
    expect(audit).toContain('test "$(npm --version)" = "11.13.0"');
    expect(audit).toContain('npm ci');
    expect(audit).toContain('npm run audit:dependencies');
    expect(audit).toContain('npm run audit:tooling');
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot.match(/interval: weekly/g)).toHaveLength(2);
  });

  it('CI GitHub Actions를 검증한 full commit SHA로 고정해요', () => {
    const workflowPaths = [
      '.github/workflows/javascript-checks.yml',
      '.github/workflows/native-checks.yml',
      '.github/workflows/security-audit.yml',
    ];
    const actionReferences = workflowPaths.flatMap(workflowActionReferences);

    expect(actionReferences).toHaveLength(7);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/u);
    }
    expect(actionReferences).toContain(
      'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    );
    expect(actionReferences).toContain(
      'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
    );
    expect(actionReferences).toContain(
      'actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961',
    );
  });

  it('개인정보처리방침만 수동으로 GitHub Pages에 게시해요', () => {
    const pages = source('.github/workflows/privacy-policy-pages.yml');

    expect(pages).toContain('workflow_dispatch:');
    expect(pages).not.toContain('push:');
    expect(pages).not.toContain('schedule:');
    expect(pages).toContain('permissions: {}');
    expect(pages).toContain(
      "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)",
    );
    expect(pages).toContain('contents: read');
    expect(pages).toContain('pages: read');
    expect(pages).toContain('needs: build');
    expect(pages).toContain('pages: write');
    expect(pages).toContain('id-token: write');
    expect(pages).toContain(
      'install -m 0644 public/privacy-policy.html _privacy-site/privacy-policy.html',
    );
    expect(pages).toContain(
      'install -m 0644 public/privacy-policy.html _privacy-site/index.html',
    );
    expect(pages).toContain(
      'iconv -f UTF-8 -t UTF-8 public/privacy-policy.html',
    );
    expect(pages).toContain(
      'test -z "$(find _privacy-site -mindepth 1 ! -type f -print -quit)"',
    );
    expect(pages).toContain('path: _privacy-site');
    expect(pages).not.toContain('path: public');

    const actionReferences = workflowActionReferences(
      '.github/workflows/privacy-policy-pages.yml',
    );
    expect(actionReferences).toHaveLength(4);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/u);
    }
  });
});
