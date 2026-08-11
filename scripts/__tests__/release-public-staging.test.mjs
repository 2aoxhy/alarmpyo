import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findUnpromotedPublicVersionCodes,
  getPromotionCleanupVersionCodes,
  publishPrivateApkCandidate,
  quarantinePublicCandidateDirectories,
  restoreQuarantinedCandidates,
} from '../release-public-staging.mjs';

const directories = [];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('비공개 APK 후보 승격', () => {
  it('기기 검증 뒤 호출할 때만 후보 APK를 공개 경로로 원자적으로 복사해요', async () => {
    const root = await mkdtemp(join(tmpdir(), 'alarmpyo-private-apk-'));
    directories.push(root);
    const sourcePath = join(root, '.release', 'candidate.apk');
    const targetPath = join(root, 'public', 'downloads', 'v2', 'AlarmPyo.apk');
    const contents = Buffer.from('verified APK bytes');
    await mkdir(join(root, '.release'), { recursive: true });
    await writeFile(sourcePath, contents);

    await publishPrivateApkCandidate({
      sourcePath,
      targetPath,
      expectedSha256: sha256(contents),
      expectedSizeBytes: contents.length,
    });

    await expect(readFile(targetPath)).resolves.toEqual(contents);
    await expect(
      publishPrivateApkCandidate({
        sourcePath,
        targetPath,
        expectedSha256: sha256(contents),
        expectedSizeBytes: contents.length,
      }),
    ).rejects.toThrow('이미 있어');
  });

  it('새 계보에서는 이전 앱 후보를 자동 정리하지 않고 수동 격리만 복구 가능해요', async () => {
    expect(
      getPromotionCleanupVersionCodes({
        currentVersionCode: 1,
        targetVersionCode: 2,
        targetVersionName: '1.0.1',
      }),
    ).toEqual([]);

    const root = await mkdtemp(join(tmpdir(), 'alarmpyo-public-cleanup-'));
    directories.push(root);
    for (const versionCode of [1, 2, 3]) {
      const directory = join(root, 'public', 'downloads', `v${versionCode}`);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'AlarmPyo.apk'), `v${versionCode}`);
    }
    const moves = await quarantinePublicCandidateDirectories({
      projectRoot: root,
      versionCodes: [2, 3],
    });
    await expect(
      readFile(join(root, 'public', 'downloads', 'v1', 'AlarmPyo.apk'), 'utf8'),
    ).resolves.toBe('v1');
    await expect(
      findUnpromotedPublicVersionCodes({
        projectRoot: root,
        currentVersionCode: 1,
      }),
    ).resolves.toEqual([]);
    await expect(
      readFile(join(root, 'public', 'downloads', 'v2', 'AlarmPyo.apk'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await restoreQuarantinedCandidates(moves);
    await expect(
      readFile(join(root, 'public', 'downloads', 'v3', 'AlarmPyo.apk'), 'utf8'),
    ).resolves.toBe('v3');
    await expect(
      findUnpromotedPublicVersionCodes({
        projectRoot: root,
        currentVersionCode: 1,
      }),
    ).resolves.toEqual([2, 3]);
  });
});
