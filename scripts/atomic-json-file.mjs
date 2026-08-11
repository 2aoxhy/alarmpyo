import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeJsonAtomic(path, value) {
  const pendingPath = `${path}.${process.pid}.${randomUUID()}.pending`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(pendingPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(pendingPath, path);
  } finally {
    await rm(pendingPath, { force: true });
  }
}
