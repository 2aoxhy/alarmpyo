import { describe, expect, it } from 'vitest';

import {
  deploymentAssetUrl,
  deploymentManifestUrl,
  immutableDeploymentUrl,
  normalizeDeploymentBaseUrl,
} from '../release-deployment-url.mjs';

describe('불변 배포 주소', () => {
  it('운영 APK 경로를 스테이징 배포 주소로 바꿔요', () => {
    expect(
      deploymentAssetUrl(
        'https://immutable-deployment.expo.app',
        'https://fixture-project.expo.app/downloads/v2/AlarmPyo_20260809.apk',
      ),
    ).toBe(
      'https://immutable-deployment.expo.app/downloads/v2/AlarmPyo_20260809.apk',
    );
  });

  it('운영 주소와 식별자로 직전 불변 배포 주소를 만들어요', () => {
    expect(
      immutableDeploymentUrl('https://fixture-project.expo.app', 'abc123'),
    ).toBe('https://fixture-project--abc123.expo.app/');
    expect(() =>
      immutableDeploymentUrl('https://fixture-project.expo.app', '../wrong'),
    ).toThrow('불변 배포 식별자가 올바르지 않아요.');
  });

  it('스테이징 배포의 APK 정보 주소를 만들어요', () => {
    expect(deploymentManifestUrl('https://immutable-deployment.expo.app/path')).toBe(
      'https://immutable-deployment.expo.app/updates/latest-android.json',
    );
  });

  it('배포 주소의 검색어와 하위 경로를 제거해요', () => {
    expect(normalizeDeploymentBaseUrl('https://example.com/path?q=1')?.toString()).toBe(
      'https://example.com/',
    );
  });
});
