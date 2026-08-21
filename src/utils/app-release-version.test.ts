import { describe, expect, it } from 'vitest';

import { formatAppReleaseVersion } from './app-release-version';

describe('앱 표시 버전', () => {
  it('1.0.x 버전을 V00 형식으로 표시해요', () => {
    expect(formatAppReleaseVersion('1.0.0')).toBe('V00');
    expect(formatAppReleaseVersion('1.0.5')).toBe('V05');
    expect(formatAppReleaseVersion('1.0.8')).toBe('V08');
    expect(formatAppReleaseVersion('1.0.12')).toBe('V12');
    expect(formatAppReleaseVersion('1.15')).toBe('V15');
    expect(formatAppReleaseVersion('1.16')).toBe('V16');
  });

  it('지원하지 않는 기술 버전을 그럴듯하게 추측하지 않아요', () => {
    expect(formatAppReleaseVersion('2.0.0')).toBe('V--');
    expect(formatAppReleaseVersion('1.14')).toBe('V--');
    expect(formatAppReleaseVersion(null)).toBe('V--');
  });
});
