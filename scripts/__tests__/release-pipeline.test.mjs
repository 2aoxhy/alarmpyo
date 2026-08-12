import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..');

describe('릴리스 배포 절차', () => {
  it('APK 승격에서 정적 배포를 한 번만 실행해요', async () => {
    const source = await readFile(
      resolve(root, 'scripts', 'promote-android-release.mjs'),
      'utf8',
    );
    expect(source.match(/runNpm\('deploy:web'\)/g)).toHaveLength(1);
    expect(source).toContain("process.env.ALARMPYO_DEPLOY_VERIFY_RELEASE = '1'");
    expect(source).toContain("runNpm('release:verify:staged')");
    expect(source).not.toContain(
      "runNpm('release:verify:staged', ['--verify-provenance-artifact'])",
    );
    expect(
      source.indexOf("runNpm('release:verify:device-matrix')"),
    ).toBeLessThan(source.indexOf('await publishPrivateApkCandidate({'));
    expect(source).toContain('writeReleaseLedger');
    expect(source).toContain('restoreFileSnapshot(releaseLedgerPath');
    expect(source).toContain('getPromotionCleanupVersionCodes');
  });

  it('불변 주소 검증 뒤 운영 주소를 연결해요', async () => {
    const source = await readFile(
      resolve(root, 'scripts', 'deploy-production.mjs'),
      'utf8',
    );
    expect(
      source.indexOf('await verifyStagedDeployment(staged.url)'),
    ).toBeGreaterThan(-1);
    expect(source.indexOf('await promote(staged.identifier)')).toBeGreaterThan(
      source.indexOf('await verifyStagedDeployment(staged.url)'),
    );
    expect(source).toContain('await promote(previousIdentifier)');
    expect(source).toContain('allowHistorical: !releaseTransaction');
    expect(source).toContain('verifyProvenanceArtifact: releaseTransaction');
    expect(source).toContain(
      '운영 배포 전에는 검증된 직전 배포 식별자가 필요해요',
    );
    expect(source).toContain(
      'restoreFileSnapshot(statePath, previousStateSnapshot)',
    );
  });

  it('APK와 무선 업데이트 모두 깨끗한 소스와 도구 보안 검사를 요구해요', async () => {
    const pkg = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    );
    for (const name of ['release:preflight', 'release:preflight:update']) {
      expect(pkg.scripts[name]).toContain('verify:toolchain');
      expect(pkg.scripts[name]).toContain('release:source');
      expect(pkg.scripts[name]).toContain('audit:tooling');
    }
    expect(pkg.scripts['release:preflight:update']).toContain(
      'release:verify:online',
    );
    expect(pkg.scripts['deploy:web']).toContain('check-deploy-source.mjs');
    expect(pkg.scripts['deploy:web']).toContain('audit:tooling');
    expect(pkg.scripts['release:verify:staged']).not.toContain('--check-urls');
    expect(pkg.scripts['release:verify:staged']).not.toContain(
      '--verify-apk-content',
    );
  });

  it('검증된 같은 버전 APK가 없으면 OTA 게시를 막아요', async () => {
    const source = await readFile(
      resolve(root, 'scripts', 'validate-ota-runtime.mjs'),
      'utf8',
    );
    expect(source).toContain("readJson('public/updates/latest-android.json')");
    expect(source).toContain('같은 런타임의 검증된 APK를 먼저 공개한 뒤');
  });

  it('OTA 게시 결과에 커밋과 업데이트 그룹을 기록해요', async () => {
    const pkg = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts['publish:update']).toContain('publish-eas-update.mjs');
    const source = await readFile(
      resolve(root, 'scripts', 'publish-eas-update.mjs'),
      'utf8',
    );
    expect(source).toContain('sourceCommit');
    expect(source).toContain('groups');
  });

  it('APK 승격 전 커밋과 EAS 빌드 ID를 확인해요', async () => {
    const source = await readFile(
      resolve(root, 'scripts', 'promote-android-release.mjs'),
      'utf8',
    );
    expect(source.indexOf("runNpm('release:source')")).toBeLessThan(
      source.indexOf("runNpm('release:manifest')"),
    );
    expect(source).toContain('staged.sourceCommit !== readCurrentCommit()');
    expect(source).toContain('staged.easBuildId');
  });
});
