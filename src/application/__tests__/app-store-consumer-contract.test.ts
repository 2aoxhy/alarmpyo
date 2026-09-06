// Vitest runs in Node, while the app tsconfig intentionally omits Node types.
// @ts-expect-error Node standard library is provided by the test runner.
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error Node standard library is provided by the test runner.
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');

type DirectoryEntry = {
  name: string;
  isDirectory(): boolean;
};

function productionSources(directory = sourceRoot): string[] {
  const entries = readdirSync(directory, {
    withFileTypes: true,
  }) as DirectoryEntry[];

  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (path === resolve('src/store/app-store.tsx')) return [];
    return [path];
  });
}

describe('앱 Store 소비 경계', () => {
  it('화면과 기능은 전체 Store 호환 facade를 직접 구독하지 않아요', () => {
    const offenders = productionSources()
      .filter((path) => readFileSync(path, 'utf8').includes('useAppStore('))
      .map((path) => relative(sourceRoot, path));

    expect(offenders).toEqual([]);
  });
});
