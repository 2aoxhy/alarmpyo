import { describe, expect, it } from 'vitest';

import {
  GOOGLE_PLAY_PACKAGE_ID,
  resolveAppDistribution,
} from '../app-distribution-policy';

describe('앱 배포 방식', () => {
  it('Play 빌드만 Google Play 배포로 판별해요', () => {
    expect(resolveAppDistribution('play')).toBe('play');
    expect(resolveAppDistribution('direct')).toBe('direct');
    expect(resolveAppDistribution(undefined)).toBe('direct');
    expect(resolveAppDistribution('unknown')).toBe('direct');
  });

  it('새 앱 계보의 Android 패키지 이름을 사용해요', () => {
    expect(GOOGLE_PLAY_PACKAGE_ID).toBe('com.personal.alarmpyo');
  });
});
