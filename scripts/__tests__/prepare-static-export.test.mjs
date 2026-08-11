import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  prepareStaticExport,
  resolveStaticOutputDirectory,
} from '../prepare-static-export.mjs';

const temporaryDirectories = [];

async function createProject() {
  const projectRoot = await mkdtemp(join(tmpdir(), 'alarmpyo-static-output-'));
  temporaryDirectories.push(projectRoot);
  await mkdir(join(projectRoot, 'dist', '_expo'), { recursive: true });
  await mkdir(join(projectRoot, 'public'), { recursive: true });
  await writeFile(join(projectRoot, 'dist', 'index.html'), '이전 화면');
  await writeFile(join(projectRoot, 'dist', '_expo', 'bundle.js'), '이전 번들');
  await writeFile(join(projectRoot, 'public', 'keep.txt'), '보존');
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('정적 내보내기 전 산출물 정리', () => {
  it('기본 실행은 확인만 하고 파일을 삭제하지 않아요', async () => {
    const projectRoot = await createProject();

    const result = await prepareStaticExport({ projectRoot });

    expect(result).toMatchObject({
      exists: true,
      applied: false,
      files: 2,
      directories: 1,
    });
    await expect(
      readFile(join(projectRoot, 'dist', 'index.html'), 'utf8'),
    ).resolves.toBe('이전 화면');
  });

  it('--apply에 해당하는 명시적 요청에서 dist만 정리해요', async () => {
    const projectRoot = await createProject();

    const result = await prepareStaticExport({ projectRoot, apply: true });

    expect(result.applied).toBe(true);
    await expect(readFile(join(projectRoot, 'dist', 'index.html'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      readFile(join(projectRoot, 'public', 'keep.txt'), 'utf8'),
    ).resolves.toBe('보존');
  });

  it.each(['.', '..', 'public', 'dist/../public', '../dist'])(
    '허용된 dist 밖의 경로를 거부해요: %s',
    (output) => {
      const projectRoot = resolve('가상-프로젝트');
      expect(() => resolveStaticOutputDirectory(projectRoot, output)).toThrow(
        '프로젝트 안의 dist',
      );
    },
  );
});
