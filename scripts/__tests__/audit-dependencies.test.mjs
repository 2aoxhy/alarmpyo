import { describe, expect, it } from 'vitest';

import { evaluateAuditReport } from '../audit-dependencies.mjs';

const policy = {
  schemaVersion: 1,
  timeZone: 'Asia/Seoul',
  exceptions: [
    {
      advisory: 'GHSA-w3rx-r6r6-pgpr',
      package: 'image-size',
      severity: 'high',
      expiresOn: '2026-09-09',
    },
    {
      advisory: 'GHSA-5p2g-fcmc-qvqq',
      package: 'image-size',
      severity: 'high',
      expiresOn: '2026-09-09',
    },
  ],
};

const allowedReport = {
  auditReportVersion: 2,
  vulnerabilities: {
    'image-size': {
      severity: 'high',
      via: [
        {
          source: 1138808,
          name: 'image-size',
          severity: 'high',
          url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
        },
        {
          source: 1138809,
          name: 'image-size',
          severity: 'high',
          url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
        },
      ],
    },
    metro: { severity: 'high', via: ['image-size', 'metro-config'] },
    'metro-config': { severity: 'high', via: ['metro'] },
    expo: { severity: 'high', via: ['metro'] },
  },
};

describe('의존성 보안 예외 정책', () => {
  it('승인된 두 image-size 권고만 만료일까지 허용해요', () => {
    const result = evaluateAuditReport(
      allowedReport,
      policy,
      new Date('2026-09-09T03:00:00.000Z'),
    );

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('예외가 만료된 다음 날부터 실패해요', () => {
    const result = evaluateAuditReport(
      allowedReport,
      policy,
      new Date('2026-09-09T15:00:00.000Z'),
    );

    expect(result.ok).toBe(false);
    expect(result.violations.join('\n')).toContain('만료됐어요');
  });

  it('새로운 높은 등급 권고는 실패해요', () => {
    const report = structuredClone(allowedReport);
    report.vulnerabilities['new-package'] = {
      severity: 'high',
      via: [
        {
          source: 9999999,
          name: 'new-package',
          severity: 'high',
          url: 'https://github.com/advisories/GHSA-1111-2222-3333',
        },
      ],
    };

    const result = evaluateAuditReport(
      report,
      policy,
      new Date('2026-08-09T03:00:00.000Z'),
    );

    expect(result.ok).toBe(false);
    expect(result.violations.join('\n')).toContain('허용되지 않았어요');
  });

  it('치명적 취약점은 예외 없이 실패해요', () => {
    const report = structuredClone(allowedReport);
    report.vulnerabilities.metro.severity = 'critical';

    const result = evaluateAuditReport(
      report,
      policy,
      new Date('2026-08-09T03:00:00.000Z'),
    );

    expect(result.ok).toBe(false);
    expect(result.violations.join('\n')).toContain('치명적 취약점은 예외 없이');
  });

  it('정책에 세 번째 예외를 추가하면 실패해요', () => {
    const changedPolicy = structuredClone(policy);
    changedPolicy.exceptions.push({
      advisory: 'GHSA-1111-2222-3333',
      package: 'new-package',
      severity: 'high',
      expiresOn: '2026-09-09',
    });

    const result = evaluateAuditReport(
      allowedReport,
      changedPolicy,
      new Date('2026-08-09T03:00:00.000Z'),
    );

    expect(result.ok).toBe(false);
    expect(result.violations.join('\n')).toContain('승인되지 않은 보안 예외');
  });
});
