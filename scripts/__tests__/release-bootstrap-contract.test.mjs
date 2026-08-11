import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..');

describe('운영 배포 복구 기준', () => {
  it('불변 주소와 운영 주소를 모두 완전히 검증한 뒤 상태를 저장해요', async () => {
    const source = await readFile(
      resolve(root, 'scripts', 'bootstrap-production-deployment.mjs'),
      'utf8',
    );
    expect(source).toContain('createFullDeploymentValidationArgs');
    expect(source).toContain('allowHistorical: true');
    expect(source.indexOf("verify(immutableUrl, '불변 배포')")).toBeLessThan(
      source.indexOf('writeJsonAtomic(statePath'),
    );
    expect(source.indexOf("verify(productionUrl, '운영 배포')")).toBeLessThan(
      source.indexOf('writeJsonAtomic(statePath'),
    );
  });
});
