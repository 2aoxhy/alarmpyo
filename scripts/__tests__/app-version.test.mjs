import { describe, expect, it } from 'vitest';

import {
  formatReleaseName,
  isSupportedAppVersion,
  isSupportedPackageVersion,
  packageVersionMatchesApp,
} from '../app-version.mjs';

describe('V16 앱 버전 계약', () => {
  it('V14 이전 계보와 V15 이후 간결 버전을 구분해요', () => {
    expect(formatReleaseName('1.0.14')).toBe('V14');
    expect(formatReleaseName('1.15')).toBe('V15');
    expect(formatReleaseName('1.16')).toBe('V16');
    expect(formatReleaseName('1.14')).toBe('V--');
  });

  it('npm용 1.16.0과 앱 표시용 1.16을 같은 릴리스로 봐요', () => {
    expect(isSupportedPackageVersion('1.15.0')).toBe(true);
    expect(isSupportedAppVersion('1.15')).toBe(true);
    expect(isSupportedPackageVersion('1.16.0')).toBe(true);
    expect(isSupportedAppVersion('1.16')).toBe(true);
    expect(packageVersionMatchesApp('1.16.0', '1.16')).toBe(true);
    expect(packageVersionMatchesApp('1.17.0', '1.16')).toBe(false);
  });

  it('기존 1.0.x 계보는 정확히 같은 값만 허용해요', () => {
    expect(packageVersionMatchesApp('1.0.14', '1.0.14')).toBe(true);
    expect(packageVersionMatchesApp('1.0.14', '1.14')).toBe(false);
  });
});
