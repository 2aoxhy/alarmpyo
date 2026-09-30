import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const workflow = load(readFileSync(resolve(import.meta.dirname, '../../.github/workflows/security-audit.yml'), 'utf8'));
const steps = workflow.jobs.audit.steps;

describe('주간 보안 감사 workflow', () => {
  it('주간·수동 실행을 유지하고 의존성 변경 PR 및 main에 실행됩니다', () => {
    expect(workflow.on.schedule).toEqual([{ cron: '17 18 * * 1' }]);
    expect(Object.hasOwn(workflow.on, 'workflow_dispatch')).toBe(true);
    for (const event of ['pull_request', 'push']) {
      expect(workflow.on[event].branches).toEqual(['main']);
      expect(workflow.on[event].paths).toEqual(expect.arrayContaining([
        'package.json', 'package-lock.json', 'dependency-security-policy.json',
        '.github/workflows/security-audit.yml', 'scripts/audit-dependencies.mjs',
        'tooling/uri-decoder-compat/**', 'scripts/__tests__/*security.test.mjs',
      ]));
    }
  });

  it('고정 도구와 읽기 권한·고정 action SHA만 사용합니다', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const step of steps.filter((step) => step.uses)) expect(step.uses).toMatch(/@[a-f0-9]{40}$/u);
    expect(steps.find((step) => step.name === 'Verify pinned toolchain').run).toContain('v24.16.0');
    expect(steps.find((step) => step.name === 'Verify pinned toolchain').run).toContain('11.13.0');
    expect(steps.find((step) => step.id === 'install').run).toBe('npm ci');
  });

  it('설치 성공 후 이전 감사가 실패해도 두 감사를 실행하며 실패를 숨기지 않습니다', () => {
    const audits = steps.filter((step) => /^npm run audit:/u.test(step.run ?? ''));
    expect(audits.map((step) => step.run)).toEqual(['npm run audit:dependencies', 'npm run audit:tooling']);
    for (const step of audits) {
      expect(step.if).toBe("${{ !cancelled() && steps.install.outcome == 'success' }}");
      expect(step['continue-on-error']).toBeUndefined();
    }
    const shouldRun = (cancelled, installOutcome) => !cancelled && installOutcome === 'success';
    expect(shouldRun(false, 'success')).toBe(true); // Prior production failure does not enter this condition.
    expect(shouldRun(false, 'failure')).toBe(false);
    expect(shouldRun(true, 'success')).toBe(false);
    expect(workflow.jobs.audit['continue-on-error']).toBeUndefined();
  });

  it('URI 호환 코드·Metro 이미지·감사 회귀 검사를 함께 실행합니다', () => {
    const step = steps.find((item) => item.name === 'Verify audit policy and dependency compatibility');
    for (const name of ['audit-dependencies', 'security-audit-workflow', 'uri-decoder-security', 'metro-image-security']) {
      expect(step.run).toContain(`scripts/__tests__/${name}.test.mjs`);
    }
  });
});
