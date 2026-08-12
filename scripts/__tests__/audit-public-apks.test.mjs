import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPublicApkRetention } from '../audit-public-apks.mjs';

const temporaryDirectories = [];
const TRUSTED_CERTIFICATE = 'a'.repeat(64);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function apkFileName() {
  return 'AlarmPyo_20260726.apk';
}

async function createProject({
  referencedVersion = 3,
  manifestContent = '현재 APK',
  manifestSize,
  manifestHash,
} = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'alarmpyo-apk-retention-'));
  temporaryDirectories.push(projectRoot);
  await mkdir(join(projectRoot, 'public', 'updates'), { recursive: true });
  await mkdir(join(projectRoot, 'public', 'downloads'), { recursive: true });

  for (const versionCode of [1, 2, 3]) {
    const versionDirectory = join(
      projectRoot,
      'public',
      'downloads',
      `v${versionCode}`,
    );
    await mkdir(versionDirectory, { recursive: true });
    const content =
      versionCode === referencedVersion
        ? manifestContent
        : `과거 APK ${versionCode}`;
    await writeFile(join(versionDirectory, apkFileName(versionCode)), content);
  }
  await writeFile(
    join(projectRoot, 'public', 'downloads', 'AlarmPyo_20260726.apk'),
    '루트 호환본',
  );

  const manifest = {
    apkUrl: `https://releases.example.com/downloads/v${referencedVersion}/${apkFileName(referencedVersion)}`,
    sizeBytes: manifestSize ?? Buffer.byteLength(manifestContent),
    sha256: manifestHash ?? sha256(manifestContent),
  };
  await writeFile(
    join(projectRoot, 'public', 'updates', 'latest-android.json'),
    JSON.stringify(manifest),
  );
  await writeFile(
    join(projectRoot, 'release-policy.json'),
    JSON.stringify({
      schemaVersion: 2,
      lineage: 'alarmpyo',
      packageName: 'com.personal.alarmpyo',
      initialRelease: {
        versionName: '1.0.1',
        androidVersionCode: 2,
        iosBuildNumber: '2',
      },
      releaseState: 'active',
      releaseBlockers: [],
      expoProjectId: '11111111-1111-4111-8111-111111111111',
      productionHostingUrl: 'https://releases.example.com',
      signingCertificateSha256: [TRUSTED_CERTIFICATE],
      keepPublicApkVersions: 3,
    }),
  );
  return projectRoot;
}

function auditProject(options) {
  return auditPublicApkRetention({
    ...options,
    readSigningCertificates: async () => [TRUSTED_CERTIFICATE],
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('공개 APK 보존 정책', () => {
  it('현재 참조 파일과 최근 버전 폴더를 보호하고 나머지는 보고만 해요', async () => {
    const projectRoot = await createProject();

    const report = await auditProject({
      projectRoot,
      keepRecent: 2,
    });

    expect(report.ok).toBe(true);
    expect(report.deletionPerformed).toBe(false);
    expect(report.manifestReferencedFile).toBe(
      'v3/AlarmPyo_20260726.apk',
    );
    expect(report.protectedVersionDirectories).toEqual(['v3', 'v2']);
    expect(report.protectedFiles).toEqual([
      'v2/AlarmPyo_20260726.apk',
      'v3/AlarmPyo_20260726.apk',
    ]);
    expect(report.reviewFiles).toEqual([
      'AlarmPyo_20260726.apk',
      'v1/AlarmPyo_20260726.apk',
    ]);
    await expect(
      readFile(
        join(
          projectRoot,
          'public',
          'downloads',
          'v1',
          'AlarmPyo_20260726.apk',
        ),
        'utf8',
      ),
    ).resolves.toBe('과거 APK 1');
  });

  it('최근 범위 밖이어도 현재 배포 정보가 참조하면 보호해요', async () => {
    const projectRoot = await createProject({
      referencedVersion: 1,
      manifestContent: '현재 APK',
    });

    const report = await auditProject({
      projectRoot,
      keepRecent: 2,
    });

    expect(report.ok).toBe(true);
    expect(report.protectedVersionDirectories).toEqual(['v3', 'v2', 'v1']);
    expect(report.protectedFiles).toContain('v1/AlarmPyo_20260726.apk');
  });

  it('현재 참조 APK의 크기와 해시 불일치를 오류로 알려요', async () => {
    const projectRoot = await createProject({
      manifestSize: 999,
      manifestHash: '0'.repeat(64),
    });

    const report = await auditProject({ projectRoot });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('파일 크기'),
        expect.stringContaining('SHA-256'),
      ]),
    );
    expect(report.deletionPerformed).toBe(false);
  });

  it('배포 정보의 경로 탈출 시도를 거부해요', async () => {
    const projectRoot = await createProject();
    const manifestPath = join(
      projectRoot,
      'public',
      'updates',
      'latest-android.json',
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        apkUrl:
          'https://releases.example.com/downloads/%2e%2e%2fAlarmPyo_20260726.apk',
        sizeBytes: 1,
        sha256: '0'.repeat(64),
      }),
    );

    await expect(
      auditProject({ projectRoot }),
    ).rejects.toThrow('공개 APK 주소');
  });

  it('적용 모드에서도 현재와 직전 배포 APK를 보호하고 오래된 파일만 정리해요', async () => {
    const projectRoot = await createProject();
    await writeFile(
      join(projectRoot, 'public', 'updates', 'previous-android.json'),
      JSON.stringify({
        apkUrl:
          'https://releases.example.com/downloads/v2/AlarmPyo_20260726.apk',
      }),
    );

    const report = await auditProject({
      projectRoot,
      keepRecent: 1,
      apply: true,
    });

    expect(report.ok).toBe(true);
    expect(report.protectedVersionDirectories).toEqual(['v3', 'v2']);
    expect(report.deletedFiles).toEqual([
      'AlarmPyo_20260726.apk',
      'v1/AlarmPyo_20260726.apk',
    ]);
    await expect(
      readFile(
        join(projectRoot, 'public', 'downloads', 'v2', 'AlarmPyo_20260726.apk'),
        'utf8',
      ),
    ).resolves.toBe('과거 APK 2');
  });
});
