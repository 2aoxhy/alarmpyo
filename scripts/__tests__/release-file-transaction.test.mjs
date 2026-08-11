import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  readFileSnapshot,
  rollbackPromotionFiles,
} from '../release-file-transaction.mjs';

describe('APK 승격 파일 롤백', () => {
  it('manifest 두 개를 복구하고 새 APK만 제거해요', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alarmpyo-release-'));
    const publicManifestPath = join(directory, 'latest.json');
    const previousManifestPath = join(directory, 'previous.json');
    const apkPath = join(directory, 'new.apk');
    await writeFile(publicManifestPath, 'old-latest');
    await writeFile(previousManifestPath, 'old-previous');
    const publicManifestSnapshot = await readFileSnapshot(publicManifestPath);
    const previousManifestSnapshot = await readFileSnapshot(previousManifestPath);
    await writeFile(publicManifestPath, 'new-latest');
    await writeFile(previousManifestPath, 'new-previous');
    await writeFile(apkPath, 'new-apk');

    await rollbackPromotionFiles({
      previousManifestPath,
      previousManifestSnapshot,
      publicApkExistedBefore: false,
      publicApkTarget: apkPath,
      publicManifestPath,
      publicManifestSnapshot,
    });

    await expect(readFile(publicManifestPath, 'utf8')).resolves.toBe('old-latest');
    await expect(readFile(previousManifestPath, 'utf8')).resolves.toBe('old-previous');
    await expect(readFile(apkPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await rm(directory, { force: true, recursive: true });
  });
});
