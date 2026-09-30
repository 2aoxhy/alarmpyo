import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const policyPath = resolve(root, 'dependency-security-policy.json');
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const blockingSeverities = new Set(['high', 'critical']);

// Former image-size exceptions are resolved. New exceptions require review of
// both this approval list and the machine-readable policy.
export const approvedExceptions = new Map();

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const packagePattern = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/iu;

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function advisoryId(via) {
  return String(via?.url ?? '').match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/iu)?.[0]?.toUpperCase();
}

function failed(violations, findings = []) {
  return { ok: false, violations, findings, allowed: [] };
}

function validatePolicy(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1) errors.push('보안 정책 schemaVersion은 1이어야 합니다.');
  if (policy?.timeZone !== 'Asia/Seoul') errors.push('보안 정책 시간대는 Asia/Seoul이어야 합니다.');
  if (!Array.isArray(policy?.exceptions)) {
    errors.push('보안 정책 exceptions 배열이 없습니다.');
  } else if (policy.exceptions.length !== 0 || approvedExceptions.size !== 0) {
    errors.push('승인된 활성 보안 예외가 없습니다. 높은 등급·치명적 취약점은 모두 차단합니다.');
  }
  return errors;
}

function isDependencyPath(value) {
  return typeof value === 'string' && value.startsWith('node_modules/') &&
    !/[\s<>|`:\\]/u.test(value) && !value.split('/').includes('..');
}

// A successful process with {} or a truncated report is not a successful
// audit. Validate every package and compare npm's summary with its findings.
function validateReport(report) {
  if (!isRecord(report) || report.auditReportVersion !== 2 ||
      !isRecord(report.vulnerabilities) || !isRecord(report.metadata?.vulnerabilities) ||
      !isRecord(report.metadata?.dependencies)) {
    return ['npm 감사 보고서가 불완전하거나 지원하지 않는 형식입니다.'];
  }
  const summary = report.metadata.vulnerabilities;
  const dependencies = report.metadata.dependencies;
  if (![...severities, 'total'].every((key) => isCount(summary[key])) ||
      !['prod', 'dev', 'optional', 'peer', 'total'].every((key) => isCount(dependencies[key])) ||
      (dependencies.peerOptional !== undefined && !isCount(dependencies.peerOptional))) {
    return ['npm 감사 보고서의 취약점·의존성 집계가 불완전합니다.'];
  }
  const errors = [];
  const counts = Object.fromEntries(severities.map((severity) => [severity, 0]));
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!packagePattern.test(name) || !isRecord(vulnerability) || vulnerability.name !== name ||
        !severities.includes(vulnerability.severity) || !Array.isArray(vulnerability.via) ||
        vulnerability.via.length === 0 || !Array.isArray(vulnerability.nodes) ||
        vulnerability.nodes.length === 0 || !vulnerability.nodes.every(isDependencyPath)) {
      errors.push('npm 감사 보고서에 불완전한 패키지 항목이 있습니다.');
      continue;
    }
    counts[vulnerability.severity] += 1;
    for (const via of vulnerability.via) {
      if (typeof via === 'string') {
        if (!Object.hasOwn(report.vulnerabilities, via)) {
          errors.push('npm 감사 보고서에 연결되지 않은 전이 취약점이 있습니다.');
        }
      } else if (!isRecord(via) || !Number.isSafeInteger(via.source) || via.source <= 0 ||
                 via.name !== name || !severities.includes(via.severity) ||
                 typeof via.url !== 'string' || !via.url.startsWith('https://')) {
        errors.push('npm 감사 보고서에 불완전한 보안 권고가 있습니다.');
      }
    }
  }
  if (severities.some((severity) => counts[severity] !== summary[severity]) ||
      summary.total !== Object.keys(report.vulnerabilities).length ||
      summary.total !== severities.reduce((total, severity) => total + summary[severity], 0)) {
    errors.push('npm 감사 보고서의 취약점 목록과 집계가 일치하지 않습니다.');
  }
  return [...new Set(errors)];
}

function collectRootAdvisories(packageName, vulnerabilities, path = []) {
  if (path.includes(packageName)) return [];
  const nextPath = [...path, packageName];
  return vulnerabilities[packageName].via.flatMap((via) =>
    typeof via === 'string'
      ? collectRootAdvisories(via, vulnerabilities, nextPath)
      : [{ advisory: via, path: nextPath }],
  );
}

export function evaluateAuditReport(report, policy, now = new Date()) {
  const policyErrors = validatePolicy(policy);
  if (policyErrors.length > 0) return failed(policyErrors);
  if (isRecord(report) && Object.hasOwn(report, 'error')) {
    // Do not copy registry error messages/URLs, credentials or stderr to CI.
    return failed(['npm 감사 조회 실패: 레지스트리 오류 응답.']);
  }
  const reportErrors = validateReport(report);
  if (reportErrors.length > 0) return failed(reportErrors);

  const findings = [];
  const violations = [];
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
    const roots = collectRootAdvisories(packageName, report.vulnerabilities);
    const unique = new Map(roots.map((item) => [
      `${item.advisory.source}:${item.path.join('>')}`, item,
    ]));
    if (roots.length === 0) {
      violations.push(`${packageName}: 원인이 확인되지 않은 취약점입니다.`);
      findings.push({ packageName, severity: vulnerability.severity, advisory: '확인 불가',
        dependencyPath: vulnerability.nodes[0], reason: '원인 권고 확인 실패' });
      continue;
    }
    for (const { advisory, path } of unique.values()) {
      const blocking = blockingSeverities.has(vulnerability.severity) || blockingSeverities.has(advisory.severity);
      const id = advisoryId(advisory) ?? `source:${advisory.source}`;
      const severity = severities.indexOf(advisory.severity) > severities.indexOf(vulnerability.severity)
        ? advisory.severity : vulnerability.severity;
      const reason = blocking ? '높은 등급·치명적 취약점 차단' : '차단 기준 미만';
      const dependencyPath = `${vulnerability.nodes.join(', ')} → ${path.join(' → ')}`;
      findings.push({ packageName, severity, advisory: id, dependencyPath, reason });
      if (blocking) violations.push(`${packageName}: ${id} (${severity}), ${dependencyPath}: ${reason}.`);
    }
  }
  return { ok: violations.length === 0, violations, findings, allowed: [],
    today: dateInTimeZone(now, policy.timeZone), counts: report.metadata.vulnerabilities };
}

export function parseAuditReport(output) {
  // npm --json emits JSON on stdout. Searching for a JSON fragment could accept
  // a partial response embedded in arbitrary output or a second error object.
  try {
    return JSON.parse(output.trim());
  } catch {
    throw new Error('npm 감사 결과를 JSON으로 읽지 못했습니다.');
  }
}

export function evaluateAuditCommandResult(result, policy, now = new Date()) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    return failed(['npm 감사 실행 실패: 프로세스 오류·중단 또는 비정상 종료.']);
  }
  let report;
  try {
    report = parseAuditReport(result.stdout ?? '');
  } catch (error) {
    return failed([error.message]);
  }
  const evaluation = evaluateAuditReport(report, policy, now);
  if (evaluation.ok && result.status === 1 && report.metadata.vulnerabilities.total === 0) {
    return failed(['npm 감사 실행 실패: 종료 코드와 빈 취약점 보고서가 일치하지 않습니다.']);
  }
  // npm exits 1 for valid vulnerability reports, including moderate findings.
  // High/critical policy comes from the validated report, not its exit code.
  return evaluation;
}

function summaryText(value) {
  return String(value ?? '').replace(/[\r\n\t]/gu, ' ').slice(0, 500)
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/\|/gu, '&#124;').replace(/`/gu, '&#96;');
}

export function formatAuditSummary(evaluation, context) {
  const commit = /^[a-f0-9]{40}$/iu.test(context.commit ?? '') ? context.commit : '확인 불가';
  const lines = [
    `### 의존성 보안 감사 · ${context.includeDev ? 'Production + tooling' : 'Production'}`,
    '',
    `- 결과: ${evaluation.ok ? '통과' : '실패'}`,
    `- 검사 커밋: ${commit}`,
    `- 앱: ${summaryText(context.packageName)} ${summaryText(context.packageVersion)}`,
    '',
  ];
  if (evaluation.counts) {
    lines.push(`높음 ${evaluation.counts.high} · 치명적 ${evaluation.counts.critical} · 전체 ${evaluation.counts.total}`, '');
  }
  if (evaluation.findings.length > 0) {
    lines.push('| 패키지 | 등급 | 권고 | 의존 경로 | 결과 이유 |', '| --- | --- | --- | --- | --- |');
    for (const item of evaluation.findings.slice(0, 200)) {
      lines.push(`| ${[item.packageName, item.severity, item.advisory, item.dependencyPath, item.reason].map(summaryText).join(' | ')} |`);
    }
    if (evaluation.findings.length > 200) lines.push('', '표는 처음 200개 경로만 표시합니다. 모든 항목을 차단 검사했습니다.');
  } else if (!evaluation.ok) {
    lines.push(...evaluation.violations.map((reason) => `- ${summaryText(reason)}`));
  } else {
    lines.push('높은 등급·치명적 취약점 없음. 활성 예외 없음.');
  }
  return `${lines.join('\n')}\n\n`;
}

function run() {
  const includeDev = process.argv.includes('--include-dev');
  let evaluation;
  try {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    const bundledNpmCli = resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const inheritedNpmCli = process.env.npm_execpath;
    const npmCli = existsSync(bundledNpmCli) ? bundledNpmCli
      : typeof inheritedNpmCli === 'string' && existsSync(inheritedNpmCli) ? inheritedNpmCli : null;
    const command = process.platform === 'win32' && npmCli ? process.execPath : 'npm';
    const args = [
      ...(command === process.execPath && npmCli ? [npmCli] : []),
      'audit', includeDev ? '--include=dev' : '--omit=dev', '--json',
    ];
    evaluation = evaluateAuditCommandResult(spawnSync(command, args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000,
    }), policy);
  } catch {
    evaluation = failed(['보안 정책 읽기 또는 감사 실행 실패.']);
  }
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const localCommit = process.env.GITHUB_SHA ?? spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', timeout: 5_000,
  }).stdout?.trim();
  const context = {
    includeDev, packageName: pkg.name, packageVersion: pkg.version, commit: localCommit,
  };
  let summary = formatAuditSummary(evaluation, context);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
    } catch {
      evaluation = failed([...evaluation.violations, 'GitHub 감사 요약 저장 실패.'], evaluation.findings);
      summary = formatAuditSummary(evaluation, context);
    }
  }
  console.log(summary.trim());
  if (!evaluation.ok) {
    for (const violation of evaluation.violations.slice(0, 200)) console.error(`- ${violation}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) run();
