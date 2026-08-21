import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const publicPolicy = source('public/privacy-policy.html');
const inAppPolicy = source('src/app/privacy.tsx');
const listing = source('docs/google-play-listing-ko.md');
const dataSafety = source('docs/google-play-data-safety-ko.md');
const playPolicy = JSON.parse(source('play-release-policy.json'));

describe('Google Play 개인정보·건강 선언 계약', () => {
  it('EAS Update 실제 구성과 공개·앱 내 방침이 일치해요', () => {
    const app = JSON.parse(source('app.json')).expo;

    expect(app.updates).toMatchObject({
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      url: `https://u.expo.dev/${app.extra.eas.projectId}`,
    });
    for (const contents of [publicPolicy, inAppPolicy]) {
      expect(contents).toContain('EAS Update');
      expect(contents).toContain('무작위 설치 토큰');
      expect(contents).toContain('IP 주소');
      expect(contents).not.toContain(
        '별도 업데이트 서버에 접속하지 않아요',
      );
    }
    expect(dataSafety).toContain(
      '“수집하는 데이터 없음”을 바로 선택하면 안 돼요',
    );
    expect(dataSafety).toContain('`수집·필수·앱 기능`');
  });

  it('GitHub Pages의 수동 공식 패턴 조회와 앱 데이터 전송을 구분합니다', () => {
    for (const contents of [publicPolicy, inAppPolicy]) {
      expect(contents).toContain('GitHub Pages');
      expect(contents).toContain('보안과 무결성');
      expect(contents).toContain('IP 주소');
      expect(contents).toContain('근무표·메모·알람·타이머 설정');
    }
    expect(publicPolicy).toContain(
      'https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages',
    );
    expect(inAppPolicy).toContain('근무 패턴 보관함을 열거나 새로고침하면');
    expect(inAppPolicy).toContain('백그라운드에서 주기적으로 조회하지 않으며');
    expect(inAppPolicy).toContain('설정을 요청에 포함하지 않습니다');
  });

  it('날씨·공기 기능과 모든 위치 권한을 배포판에서 제외해요', () => {
    const app = JSON.parse(source('app.json')).expo;
    const pkg = JSON.parse(source('package.json'));
    const nativeCheck = source('scripts/run-native-unit-tests.mjs');
    expect(app.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
      ]),
    );
    expect(app.plugins).not.toContain('expo-location');
    expect(pkg.dependencies).not.toHaveProperty('expo-location');
    for (const contents of [publicPolicy, inAppPolicy]) {
      expect(contents).toContain('위치 권한');
      expect(contents).not.toContain('Cloudflare');
      expect(contents).not.toContain('에어코리아');
    }
    expect(dataSafety).toContain('자체 서버: 없음');
    expect(nativeCheck).toContain(':app:processDebugMainManifest');
    expect(nativeCheck).toContain('validateMergedLocationPermissions(androidRoot)');
    expect(nativeCheck).toContain('android.permission.ACCESS_COARSE_LOCATION');
    expect(nativeCheck).toContain('위치 권한이 없음을 확인했어요');
  });

  it('초기화가 내부 안전 백업을 남긴다는 삭제 범위를 숨기지 않아요', () => {
    const store = source('src/store/app-store.tsx');
    const resetStart = store.indexOf('const resetAllData');
    const resetFlow = store.slice(resetStart, resetStart + 1_200);

    expect(resetFlow.indexOf('await createBackupInternal()')).toBeGreaterThan(
      -1,
    );
    const replacementIndex = resetFlow.indexOf(
      'replaceDataAndPersistDetailedInternal',
    );
    expect(replacementIndex).toBeGreaterThan(-1);
    expect(resetFlow.indexOf('await createBackupInternal()')).toBeLessThan(
      replacementIndex,
    );
    for (const contents of [publicPolicy, inAppPolicy, dataSafety]) {
      expect(contents).toContain('내부 안전 백업');
      expect(contents).toContain('앱을 삭제하면');
      expect(contents).toContain('외부로 내보낸 백업');
    }
  });

  it('Sleep Management 범위와 비의료 안내를 정확히 제한해요', () => {
    for (const contents of [publicPolicy, inAppPolicy]) {
      expect(contents).toContain('진단·치료·치유·예방');
      expect(contents).toContain('의료 전문가와 상담');
    }
    expect(listing).toContain('수면 준비 알림');
    expect(listing).not.toContain('진단·치료·치유·예방');
    expect(listing).not.toContain('의료 전문가와 상담');
    expect(dataSafety).toContain('`Sleep Management`');
    expect(dataSafety).toContain('Health Connect·센서·의료 데이터 권한');
    expect(dataSafety).toContain('의료·연구·다른 건강 기능은 선택하지 않아요');
  });

  it('공개 방침을 앱과 같은 시행일·다크 전용으로 유지해요', () => {
    expect(publicPolicy).toContain('Content-Security-Policy');
    expect(publicPolicy).toContain("default-src 'none'");
    expect(publicPolicy).toContain('<meta name="referrer" content="no-referrer"');
    expect(publicPolicy).toContain('<meta name="color-scheme" content="dark"');
    expect(publicPolicy).toContain('color-scheme: dark');
    expect(publicPolicy).not.toContain('prefers-color-scheme');
    expect(publicPolicy).not.toContain('light dark');
    expect(publicPolicy).toContain('시행일 2026년 8월 21일');
    expect(inAppPolicy).toContain('시행일 2026년 8월 21일');
  });

  it('스토어 초안은 활성 방침 상태를 반영하되 소유자 URL을 복제하지 않아요', () => {
    expect(playPolicy).toMatchObject({ releaseState: 'active', releaseBlockers: [] });
    expect(playPolicy.privacyPolicyUrl).toMatch(/^https:\/\//u);
    expect(listing).toContain('play-release-policy.json');
    expect(listing).toContain('활성 HTTPS 페이지');
    expect(listing).not.toContain('게시 전');
    expect(listing).not.toContain(playPolicy.privacyPolicyUrl);
  });
});
