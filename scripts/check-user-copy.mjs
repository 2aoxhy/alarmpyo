import { resolve } from 'node:path';

import { inspectRepositoryCopy } from './copy-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const violations = inspectRepositoryCopy(root);

if (violations.length > 0) {
  console.error('사용자 문구 정책을 통과하지 못했습니다.');
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} [${violation.kind}] ${violation.match} — ${violation.excerpt}`,
    );
  }
  process.exit(1);
}

console.log('사용자 문구 정책을 확인했습니다.');
