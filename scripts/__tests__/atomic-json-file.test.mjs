import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeJsonAtomic } from '../atomic-json-file.mjs';
import {
  readFileSnapshot,
  restoreFileSnapshot,
} from '../release-file-transaction.mjs';

let directory;
afterEach(async () => {
  if (directory) await rm(directory, { force: true, recursive: true });
  directory = undefined;
});

describe('원자 JSON 저장', () => {
  it('기존 배포 상태를 완성된 새 상태로 한 번에 교체해요', async () => {
    directory = await mkdtemp(join(tmpdir(), 'alarmpyo-release-state-'));
    const path = join(directory, 'production.json');
    await writeJsonAtomic(path, { identifier: 'old' });
    await writeJsonAtomic(path, { identifier: 'new', schemaVersion: 1 });

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      identifier: 'new',
      schemaVersion: 1,
    });
    await expect(readdir(directory)).resolves.toEqual(['production.json']);
  });

  it('배포 실패 시 저장 전 상태 snapshot으로 복구해요', async () => {
    directory = await mkdtemp(join(tmpdir(), 'alarmpyo-release-state-'));
    const path = join(directory, 'production.json');
    await writeJsonAtomic(path, { identifier: 'verified-old' });
    const snapshot = await readFileSnapshot(path);

    await writeJsonAtomic(path, { identifier: 'failed-new' });
    await restoreFileSnapshot(path, snapshot);

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      identifier: 'verified-old',
    });
  });
});
