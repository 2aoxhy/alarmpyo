import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  approvedExceptions,
  evaluateAuditCommandResult,
  evaluateAuditReport,
  formatAuditSummary,
  parseAuditReport,
} from '../audit-dependencies.mjs';

const root = resolve(import.meta.dirname, '../..');
const policy = JSON.parse(readFileSync(resolve(root, 'dependency-security-policy.json'), 'utf8'));
const now = new Date('2026-09-30T03:00:00.000Z');

function reportWith(vulnerabilities = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const vulnerability of Object.values(vulnerabilities)) {
    counts[vulnerability.severity] += 1;
    counts.total += 1;
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: {
    vulnerabilities: counts,
    dependencies: { prod: 10, dev: 10, optional: 0, peer: 0, peerOptional: 0, total: 20 },
  } };
}

function advisory(name = 'root-package', severity = 'high') {
  return { source: 9999999, name, severity,
    url: 'https://github.com/advisories/GHSA-1111-2222-3333' };
}

function vulnerability(name, severity = 'high', via = [advisory(name, severity)]) {
  return { name, severity, via, nodes: [`node_modules/${name}`] };
}

const command = (report, status = 0) => ({ status, stdout: JSON.stringify(report), stderr: '' });

describe('활성 예외 없는 의존성 감사', () => {
  it('완전한 취약점 0건 보고서와 빈 정책을 통과시킵니다', () => {
    expect(policy.exceptions).toEqual([]);
    expect(approvedExceptions.size).toBe(0);
    expect(evaluateAuditReport(reportWith(), policy, now)).toMatchObject({
      ok: true, allowed: [], violations: [], findings: [], today: '2026-09-30',
    });
  });

  it.each(['high', 'critical'])('%s 직접 권고를 예외 없이 차단합니다', (severity) => {
    const result = evaluateAuditReport(reportWith({
      'root-package': vulnerability('root-package', severity),
    }), policy, now);
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ packageName: 'root-package', severity,
      advisory: 'GHSA-1111-2222-3333', reason: '높은 등급·치명적 취약점 차단' });
  });

  it('전이 경로와 순환 경로에서도 높은 등급 권고를 차단하고 원인을 표시합니다', () => {
    const result = evaluateAuditReport(reportWith({
      'root-package': vulnerability('root-package'),
      consumer: vulnerability('consumer', 'high', ['root-package', 'loop']),
      loop: vulnerability('loop', 'high', ['consumer']),
    }), policy, now);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ packageName: 'consumer',
        dependencyPath: 'node_modules/consumer → consumer → root-package' }),
      expect.objectContaining({ packageName: 'loop',
        dependencyPath: 'node_modules/loop → loop → consumer → root-package' }),
    ]));
  });

  it('원인 권고가 없는 순환 목록은 통과시키지 않습니다', () => {
    const result = evaluateAuditReport(reportWith({
      first: vulnerability('first', 'high', ['second']),
      second: vulnerability('second', 'high', ['first']),
    }), policy, now);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).toContain('원인이 확인되지 않은');
  });

  it('낮게 표시된 패키지 안의 높은 등급 원인 권고도 차단합니다', () => {
    const result = evaluateAuditReport(reportWith({
      'root-package': vulnerability('root-package', 'moderate', [advisory()]),
    }), policy, now);
    expect(result.ok).toBe(false);
    expect(result.findings[0].severity).toBe('high');
  });

  it('과거 만료 예외를 정책에 복원해도 허용되지 않습니다', () => {
    const result = evaluateAuditReport(reportWith(), { ...policy, exceptions: [{
      advisory: 'GHSA-w3rx-r6r6-pgpr', package: 'image-size', severity: 'high', expiresOn: '2099-01-01',
    }] }, now);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).toContain('승인된 활성 보안 예외가 없습니다');
  });

  it.each([
    ['정책 버전', { ...policy, schemaVersion: 2 }],
    ['시간대', { ...policy, timeZone: 'UTC' }],
    ['예외 배열', { ...policy, exceptions: undefined }],
  ])('잘못된 %s을 차단합니다', (_label, changedPolicy) => {
    expect(evaluateAuditReport(reportWith(), changedPolicy, now).ok).toBe(false);
  });
});

describe('감사 보고서의 완전성', () => {
  it.each([
    ['빈 객체', {}],
    ['배열', []],
    ['null', null],
    ['지원하지 않는 버전', { ...reportWith(), auditReportVersion: 3 }],
    ['누락된 목록', { ...reportWith(), vulnerabilities: undefined }],
    ['배열 목록', { ...reportWith(), vulnerabilities: [] }],
    ['누락된 집계', { ...reportWith(), metadata: {} }],
    ['누락된 의존성 집계', { ...reportWith(), metadata: { vulnerabilities: reportWith().metadata.vulnerabilities } }],
    ['감사 오류', { error: { summary: 'https://private-token@registry.example/secret' } }],
    ['잘못된 감사 오류', { ...reportWith(), error: 'private-token' }],
  ])('%s 보고서를 성공으로 처리하지 않습니다', (_label, report) => {
    const result = evaluateAuditReport(report, policy, now);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).not.toContain('private-token');
  });

  it.each([
    ['집계 누락', (report) => { delete report.metadata.vulnerabilities.high; }],
    ['집계 음수', (report) => { report.metadata.vulnerabilities.high = -1; }],
    ['목록과 집계 불일치', (report) => { report.metadata.vulnerabilities.total = 0; }],
    ['이름 누락', (report) => { delete report.vulnerabilities['root-package'].name; }],
    ['등급 누락', (report) => { delete report.vulnerabilities['root-package'].severity; }],
    ['빈 원인', (report) => { report.vulnerabilities['root-package'].via = []; }],
    ['연결 없는 원인', (report) => { report.vulnerabilities['root-package'].via = ['missing']; }],
    ['원인 권고 누락', (report) => { report.vulnerabilities['root-package'].via = [null]; }],
    ['원인 등급 누락', (report) => { delete report.vulnerabilities['root-package'].via[0].severity; }],
    ['경로 누락', (report) => { delete report.vulnerabilities['root-package'].nodes; }],
    ['빈 경로', (report) => { report.vulnerabilities['root-package'].nodes = []; }],
    ['민감한 경로', (report) => { report.vulnerabilities['root-package'].nodes = ['https://token@private/secret']; }],
  ])('%s인 불완전한 패키지를 차단합니다', (_label, change) => {
    const report = reportWith({ 'root-package': vulnerability('root-package') });
    change(report);
    expect(evaluateAuditReport(report, policy, now).ok).toBe(false);
  });
});

describe('npm 프로세스 결과', () => {
  it('취약점 0건 종료 코드 0을 허용합니다', () => {
    expect(evaluateAuditCommandResult(command(reportWith()), policy, now).ok).toBe(true);
  });

  it('정상적인 moderate 취약점 종료 코드 1은 인프라 실패가 아닙니다', () => {
    const report = reportWith({ 'root-package': vulnerability('root-package', 'moderate') });
    const result = evaluateAuditCommandResult(command(report, 1), policy, now);
    expect(result.ok).toBe(true);
    expect(result.counts.moderate).toBe(1);
    expect(result.findings[0].reason).toBe('차단 기준 미만');
  });

  it('정상적인 high 취약점 종료 코드 1은 정책으로 차단합니다', () => {
    const result = evaluateAuditCommandResult(command(reportWith({
      'root-package': vulnerability('root-package'),
    }), 1), policy, now);
    expect(result.ok).toBe(false);
    expect(result.violations.join(' ')).toContain('GHSA-1111-2222-3333');
    expect(result.violations.join(' ')).not.toContain('프로세스 오류');
  });

  it.each([
    ['빈 결과', { status: 0, stdout: '' }],
    ['잘못된 JSON', { status: 0, stdout: '{broken}' }],
    ['JSON 앞 임의 출력', { status: 0, stdout: `unexpected\n${JSON.stringify(reportWith())}` }],
    ['오류 객체가 덧붙은 결과', { status: 0, stdout: `${JSON.stringify(reportWith())}\n{"error":{}}` }],
    ['stderr만 JSON', { status: 0, stdout: '', stderr: JSON.stringify(reportWith()) }],
    ['네트워크 오류', { status: 1, stdout: '{"error":{"code":"ENOTFOUND","summary":"private-token"}}' }],
    ['프로세스 오류', { ...command(reportWith()), error: new Error('private-token') }],
    ['타임아웃', { ...command(reportWith()), signal: 'SIGTERM', status: null }],
    ['비정상 종료', command(reportWith(), 2)],
    ['0건 종료 코드 1', command(reportWith(), 1)],
  ])('%s을 실패 처리하고 원문을 노출하지 않습니다', (_label, result) => {
    const evaluation = evaluateAuditCommandResult(result, policy, now);
    expect(evaluation.ok).toBe(false);
    expect(evaluation.violations.join(' ')).not.toContain('private-token');
  });

  it('완전한 JSON 바깥에는 공백만 허용합니다', () => {
    expect(parseAuditReport(` \n${JSON.stringify(reportWith())}\n`)).toEqual(reportWith());
  });
});

describe('CI 감사 요약', () => {
  const context = { commit: 'a'.repeat(40), packageName: 'alarmpyo', packageVersion: '1.24.0', includeDev: false };

  it('커밋·패키지·권고·경로·이유를 표시합니다', () => {
    const result = evaluateAuditReport(reportWith({ 'root-package': vulnerability('root-package') }), policy, now);
    const summary = formatAuditSummary(result, context);
    for (const expected of [context.commit, 'alarmpyo 1.24.0', 'root-package', 'GHSA-1111-2222-3333', 'node_modules/root-package', '높은 등급·치명적 취약점 차단']) {
      expect(summary).toContain(expected);
    }
    expect(summary).not.toContain('https://');
  });

  it('Production과 tooling 결과를 구분하고 Markdown·HTML을 이스케이프합니다', () => {
    const summary = formatAuditSummary(evaluateAuditReport(reportWith(), policy, now), {
      ...context, includeDev: true, packageVersion: '<img> | `value`\nnext', commit: 'untrusted<script>',
    });
    expect(summary).toContain('Production + tooling');
    expect(summary).toContain('&lt;img&gt; &#124; &#96;value&#96; next');
    expect(summary).not.toContain('<script>');
    expect(summary).toContain('검사 커밋: 확인 불가');
  });

  it('조회 오류는 고정된 이유만 표시합니다', () => {
    const summary = formatAuditSummary(evaluateAuditReport({ error: { summary: 'private-token' } }, policy, now), context);
    expect(summary).toContain('레지스트리 오류 응답');
    expect(summary).not.toContain('private-token');
  });

  it('같은 취약점의 복수 설치 경로를 표시합니다', () => {
    const report = reportWith({ 'root-package': vulnerability('root-package') });
    report.vulnerabilities['root-package'].nodes.push('node_modules/consumer/node_modules/root-package');
    const summary = formatAuditSummary(evaluateAuditReport(report, policy, now), context);
    expect(summary).toContain('node_modules/consumer/node_modules/root-package');
  });
});
