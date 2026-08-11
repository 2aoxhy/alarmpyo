import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readFileSnapshot(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function restoreFileSnapshot(path, snapshot) {
  const pending = `${path}.rollback`;
  await rm(pending, { force: true });
  if (snapshot === null) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(pending, snapshot);
  await rm(path, { force: true });
  await rename(pending, path);
}

export async function rollbackPromotionFiles({
  previousManifestPath,
  previousManifestSnapshot,
  publicApkExistedBefore,
  publicApkTarget,
  publicManifestPath,
  publicManifestSnapshot,
}) {
  await restoreFileSnapshot(publicManifestPath, publicManifestSnapshot);
  await restoreFileSnapshot(
    previousManifestPath,
    previousManifestSnapshot,
  );
  if (publicApkTarget && !publicApkExistedBefore) {
    await rm(publicApkTarget, { force: true });
  }
}
