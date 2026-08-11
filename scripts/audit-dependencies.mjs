import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const policyPath = resolve(root, 'dependency-security-policy.json');
const blockingSeverities = new Set(['high', 'critical']);

export const approvedExceptions = new Map([
  [
    'GHSA-W3RX-R6R6-PGPR',
    {
      package: 'image-size',
      severity: 'high',
      expiresOn: '2026-09-09',
    },
  ],
  [
    'GHSA-5P2G-FCMC-QVQQ',
    {
      package: 'image-size',
      severity: 'high',
      expiresOn: '2026-09-09',
    },
  ],
]);

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function advisoryId(via) {
  const match = String(via?.url ?? '').match(/GHSA-[a-z0-9-]+/iu);
  return match?.[0]?.toUpperCase();
}

function validatePolicy(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1) {
    errors.push('보안 예외 정책의 schemaVersion은 1이어야 해요.');
  }
  if (policy?.timeZone !== 'Asia/Seoul') {
    errors.push('보안 예외 정책의 시간대는 Asia/Seoul이어야 해요.');
  }
  if (!Array.isArray(policy?.exceptions)) {
    errors.push('보안 예외 정책의 exceptions가 배열이 아니에요.');
    return errors;
  }

  const seen = new Set();
  for (const exception of policy.exceptions) {
    const id = String(exception?.advisory ?? '').toUpperCase();
    if (!id || seen.has(id)) {
      errors.push(`중복되거나 비어 있는 보안 예외가 있어요: ${id || '(없음)'}`);
      continue;
    }
    seen.add(id);

    const approved = approvedExceptions.get(id);
    if (!approved) {
      errors.push(`승인되지 않은 보안 예외가 정책에 추가됐어요: ${id}`);
      continue;
    }
    for (const field of ['package', 'severity', 'expiresOn']) {
      if (exception[field] !== approved[field]) {
        errors.push(`${id}의 ${field} 값이 승인된 정책과 달라요.`);
      }
    }
  }

  for (const id of approvedExceptions.keys()) {
    if (!seen.has(id)) errors.push(`필수 보안 예외가 정책에서 빠졌어요: ${id}`);
  }
  if (seen.size !== approvedExceptions.size) {
    errors.push('보안 예외 정책에는 승인된 두 항목만 있어야 해요.');
  }
  return errors;
}

function collectRootAdvisories(packageName, vulnerabilities, visited = new Set()) {
  if (visited.has(packageName)) return [];
  visited.add(packageName);

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !Array.isArray(vulnerability.via)) return [];

  const roots = [];
  for (const via of vulnerability.via) {
    if (typeof via === 'string') {
      roots.push(...collectRootAdvisories(via, vulnerabilities, visited));
    } else if (via && typeof via === 'object') {
      roots.push({ owner: packageName, advisory: via });
    }
  }
  return roots;
}

function uniqueRoots(roots) {
  const unique = new Map();
  for (const rootAdvisory of roots) {
    const id = advisoryId(rootAdvisory.advisory) ?? `source:${rootAdvisory.advisory?.source}`;
    unique.set(`${rootAdvisory.owner}:${id}`, rootAdvisory);
  }
  return [...unique.values()];
}

export function evaluateAuditReport(report, policy, now = new Date()) {
  const policyErrors = validatePolicy(policy);
  if (policyErrors.length > 0) {
    return { ok: false, violations: policyErrors, allowed: [] };
  }

  if (report?.error) {
    const detail = report.error.summary ?? report.error.message ?? '알 수 없는 npm 오류';
    return {
      ok: false,
      violations: [`npm 보안 감사를 완료하지 못했어요: ${detail}`],
      allowed: [],
    };
  }

  const vulnerabilities = report?.vulnerabilities ?? {};
  const policyById = new Map(
    policy.exceptions.map((exception) => [exception.advisory.toUpperCase(), exception]),
  );
  const today = dateInTimeZone(now, policy.timeZone);
  const violations = [];
  const allowed = [];

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!blockingSeverities.has(vulnerability?.severity)) continue;
    if (vulnerability.severity === 'critical') {
      violations.push(`${packageName}: 치명적 취약점은 예외 없이 차단해요.`);
      continue;
    }

    const roots = uniqueRoots(
      collectRootAdvisories(packageName, vulnerabilities, new Set()),
    );
    if (roots.length === 0) {
      violations.push(`${packageName}: 원인이 확인되지 않은 ${vulnerability.severity} 취약점이에요.`);
      continue;
    }

    const rootViolations = [];
    const rootIds = [];
    for (const { owner, advisory } of roots) {
      const id = advisoryId(advisory);
      rootIds.push(id ?? `source:${advisory?.source ?? 'unknown'}`);
      const exception = id ? policyById.get(id) : undefined;
      if (!exception) {
        rootViolations.push(`${id ?? advisory?.source ?? '알 수 없는 권고'}는 허용되지 않았어요.`);
        continue;
      }
      if (owner !== exception.package || advisory?.name !== exception.package) {
        rootViolations.push(`${id}가 허용된 패키지와 다른 경로에서 발견됐어요.`);
      }
      if (advisory?.severity !== exception.severity) {
        rootViolations.push(`${id}의 보안 등급이 승인된 정책과 달라요.`);
      }
      if (today > exception.expiresOn) {
        rootViolations.push(`${id} 예외가 ${exception.expiresOn}에 만료됐어요.`);
      }
    }

    if (rootViolations.length > 0) {
      violations.push(`${packageName}: ${rootViolations.join(' ')}`);
    } else {
      allowed.push({ packageName, severity: vulnerability.severity, advisories: rootIds });
    }
  }

  return { ok: violations.length === 0, violations, allowed, today };
}

function parseAuditReport(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('npm 감사 결과에서 JSON을 찾지 못했어요.');
  }
  return JSON.parse(output.slice(start, end + 1));
}

function run() {
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  const includeDevelopmentDependencies = process.argv.includes('--include-dev');
  const isWindows = process.platform === 'win32';
  const bundledNpmCli = resolve(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  // 일반 Node 설치는 실행 파일 옆에 npm CLI를 두지만, Codex처럼 Node와
  // npm을 분리해 제공하는 런타임도 있어요. `npm run`이 전달한 실제 CLI를
  // 우선 재사용하면 Windows에서 셸이나 PATH의 npm.cmd에 의존하지 않아요.
  const inheritedNpmCli = process.env.npm_execpath;
  const npmCli = existsSync(bundledNpmCli)
    ? bundledNpmCli
    : typeof inheritedNpmCli === 'string' && existsSync(inheritedNpmCli)
      ? inheritedNpmCli
      : null;
  const command = isWindows && npmCli ? process.execPath : 'npm';
  const args = [
    ...(command === process.execPath && npmCli ? [npmCli] : []),
    'audit',
    includeDevelopmentDependencies ? '--include=dev' : '--omit=dev',
    '--json',
  ];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;

  let report;
  try {
    report = parseAuditReport(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const evaluation = evaluateAuditReport(report, policy);
  if (!evaluation.ok) {
    console.error('의존성 보안 감사에 실패했어요.');
    for (const violation of evaluation.violations) console.error(`- ${violation}`);
    process.exit(1);
  }

  const uniqueAdvisories = [
    ...new Set(evaluation.allowed.flatMap((item) => item.advisories)),
  ];
  if (uniqueAdvisories.length > 0) {
    console.log(
      `검토된 image-size 보안 예외 ${uniqueAdvisories.length}개만 임시 허용했어요. ` +
        `만료일은 2026-09-09예요.`,
    );
  }
  console.log('신규 또는 만료된 높은 등급·치명적 의존성 취약점이 없어요.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) run();
