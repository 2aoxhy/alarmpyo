import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..');

describe('APK 출처 증명 manifest', () => {
  it('EAS 원본 APK 바이트와 로컬 승격 APK를 직접 대조해요', async () => {
    const source = await readFile(
      resolve(root, 'scripts', 'prepare-apk-manifest.mjs'),
      'utf8',
    );

    expect(source).toContain('normalizeEasBuildProvenance');
    expect(source).toContain("'.release/eas-build.json'");
    expect(source).toContain(
      'hashRemoteApk(provenance.artifactUrl, apkStat.size)',
    );
    expect(source).toContain('remoteArtifact.sha256 !== apkSha256');
    expect(source).toContain('provenanceArtifactUrl: provenance.artifactUrl');
    expect(source).toContain('provenanceArtifactSha256: remoteArtifact.sha256');
    expect(source).toContain(
      'mirrors.filter((value) => value !== provenance.artifactUrl)',
    );
    expect(source).toContain('isEphemeralEasArtifact(primaryUrl)');
    expect(source).toContain('nativeFingerprint');
    expect(source).toContain('assertDurableApkMirrors');
    expect(source).not.toContain('copyFile(apkPath');
    expect(source).toContain('비공개 APK 후보');
  });
});
