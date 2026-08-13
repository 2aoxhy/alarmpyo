// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { existsSync, readFileSync, statSync } from 'node:fs';
// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { extname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const textExtensions = new Set([
  '', '.cjs', '.css', '.gradle', '.html', '.js', '.json', '.kt', '.kts',
  '.md', '.mjs', '.properties', '.ps1', '.sh', '.toml', '.ts', '.tsx',
  '.txt', '.xml', '.yaml', '.yml',
]);

function trackedTextFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  ) as unknown as string;
  return output
    .split('\0')
    .filter(Boolean)
    .filter((path) => textExtensions.has(extname(path).toLowerCase()))
    .filter((path) => existsSync(resolve(process.cwd(), path)))
    .filter((path) => statSync(resolve(process.cwd(), path)).size <= 1_000_000);
}

describe('공개 저장소 정보 위생', () => {
  it('제품 소스와 문서에 자격증명·개인 연락처·로컬 경로를 남기지 않아요', () => {
    const violations: string[] = [];
    const ignoredFixture = (path: string) =>
      path.includes('__tests__/') || path.endsWith('.example.json');
    const forbidden = [
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u,
      /\bAIza[0-9A-Za-z_-]{20,}\b/u,
      /\bgh[pousr]_[0-9A-Za-z]{20,}\b/u,
      /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u,
      /https:\/\/play\.google\.com\/console\/[^\s"']*\/developers\/\d+/u,
      /[A-Za-z]:\\Users\\/u,
    ];
    const personalEmail = /[A-Z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Z0-9.-]+\.[A-Z]{2,}/iu;

    for (const path of trackedTextFiles()) {
      const contents = readFileSync(resolve(process.cwd(), path), 'utf8');
      if (forbidden.some((pattern) => pattern.test(contents))) {
        violations.push(path);
        continue;
      }
      if (!ignoredFixture(path) && personalEmail.test(contents)) {
        violations.push(path);
      }
    }

    expect(violations).toEqual([]);
  });

  it('공개 계보 식별자는 정책 파일에만 두고 문서에 복제하지 않아요', () => {
    const app = JSON.parse(readFileSync(resolve(process.cwd(), 'app.json'), 'utf8')).expo;
    const direct = JSON.parse(readFileSync(resolve(process.cwd(), 'release-policy.json'), 'utf8'));
    const play = JSON.parse(readFileSync(resolve(process.cwd(), 'play-release-policy.json'), 'utf8'));
    const docs = trackedTextFiles()
      .filter((path) => path.endsWith('.md') || path.endsWith('.txt'))
      .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
      .join('\n');

    expect(docs).not.toContain(app.extra.eas.projectId);
    for (const fingerprint of [
      ...direct.signingCertificateSha256,
      play.appSigningCertificateSha256,
    ]) {
      expect(docs).not.toContain(fingerprint);
    }
  });
});
