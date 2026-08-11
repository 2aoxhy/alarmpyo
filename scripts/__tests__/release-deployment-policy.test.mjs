import { describe, expect, it } from 'vitest';

import {
  assertPromotionResult,
  manifestsHaveSameIdentity,
  resolvePreviousDeploymentState,
} from '../release-deployment-policy.mjs';

describe('운영 배포 상태 정책', () => {
  it('alias 응답의 식별자와 production URL을 검증해요', () => {
    expect(
      assertPromotionResult(
        { identifier: 'abc123', production: { url: 'https://app.expo.app' } },
        'abc123',
      ).identifier,
    ).toBe('abc123');
    expect(() =>
      assertPromotionResult(
        { identifier: 'wrong', production: { url: 'https://app.expo.app' } },
        'abc123',
      ),
    ).toThrow('목표 불변 배포');
  });

  it('저장 상태 또는 명시한 ID로 롤백 불변 주소를 결정해요', () => {
    expect(
      resolvePreviousDeploymentState({
        environmentIdentifier: undefined,
        previousState: { identifier: 'saved', url: 'https://saved.expo.app/' },
        productionUrl: 'https://fixture-project.expo.app/',
      }),
    ).toEqual({ identifier: 'saved', url: 'https://saved.expo.app/' });
    expect(
      resolvePreviousDeploymentState({
        environmentIdentifier: 'manual',
        previousState: { identifier: 'saved', url: 'https://saved.expo.app/' },
        productionUrl: 'https://fixture-project.expo.app/',
      }),
    ).toEqual({
      identifier: 'manual',
      url: 'https://fixture-project--manual.expo.app/',
    });
  });

  it('버전·해시·배포 시각이 모두 같아야 반영 완료로 판단해요', () => {
    const expected = { versionCode: 2, sha256: 'abc', publishedAt: 'now' };
    expect(manifestsHaveSameIdentity({ ...expected }, expected)).toBe(true);
    expect(
      manifestsHaveSameIdentity({ ...expected, sha256: 'wrong' }, expected),
    ).toBe(false);
  });
});
