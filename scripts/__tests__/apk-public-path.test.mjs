import { describe, expect, it } from 'vitest';

import { getPublicApkPathSegments } from '../apk-public-path.mjs';

const HOSTING_URL = 'https://releases.example.com';

describe('공개 APK 복사 경로', () => {
  it('설정된 Hosting의 버전 디렉터리를 그대로 보존해요', () => {
    expect(
      getPublicApkPathSegments(
        'https://releases.example.com/downloads/v1/AlarmPyo_20260726.apk',
        HOSTING_URL,
      ),
    ).toEqual(['v1', 'AlarmPyo_20260726.apk']);
  });

  it('버전 디렉터리가 없는 공개 주소도 지원해요', () => {
    expect(
      getPublicApkPathSegments(
        'https://releases.example.com/downloads/AlarmPyo_20260726.apk',
        HOSTING_URL,
      ),
    ).toEqual(['AlarmPyo_20260726.apk']);
  });

  it('다른 호스트의 장기 보관 주소는 정적 폴더 복사 대상이 아니에요', () => {
    expect(
      getPublicApkPathSegments(
        'https://mirror.example.com/alarmpyo/AlarmPyo_20260726.apk',
        HOSTING_URL,
      ),
    ).toBeNull();
  });

  it('production Hosting이 미정이면 성공으로 간주하지 않아요', () => {
    expect(() =>
      getPublicApkPathSegments(
        'https://releases.example.com/downloads/AlarmPyo_20260726.apk',
        null,
      ),
    ).toThrow('production Hosting URL');
  });

  it.each([
    'https://releases.example.com/downloads/v1/extra/AlarmPyo_20260726.apk',
    'https://releases.example.com/downloads/v0/AlarmPyo_20260726.apk',
    'https://releases.example.com/downloads/v1/not-alarmpyo.apk',
    'https://releases.example.com/downloads/%2e%2e%2fAlarmPyo_20260726.apk',
  ])('경로 탈출이나 허용되지 않은 공개 경로를 거부해요: %s', (url) => {
    expect(() => getPublicApkPathSegments(url, HOSTING_URL)).toThrow(
      '공개 APK 주소',
    );
  });
});
