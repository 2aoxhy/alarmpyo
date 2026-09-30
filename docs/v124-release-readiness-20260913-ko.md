# V1.24 배포 준비 점검 — 2026-09-13

## 현재 상태

V1.24(24)는 작업 폴더의 **미배포 후보**다. 이번 요청에서 EAS production 빌드, AAB 생성, 업로드, Internal 출시, Alpha 승격은 실행하지 않았다. Production도 변경하지 않았다.

후속 보안 보완을 마쳤다. SDK 패치 15종·공식 Metro 0.84.5·공식 URI 디코더 0.5.0 연결·Vitest 4.1.11을 반영했고, 최종 `npm ci`, 전체 236개 파일·1,836개 테스트, Expo Doctor 20/20, Android Play JS export와 모든 등급 감사 0건을 확인했다. Play 네이티브 1차 214개, 최종 direct 215개 테스트도 통과했다. 실기기 재확인·깨끗한 커밋의 전체 Play preflight·배포는 남아 있다. 자세한 구성과 Play/direct lock 차이는 [V1.24 의존성 보안 보완 기록](v124-dependency-hardening-20260913-ko.md)을 기준으로 확인한다. 아래 초기 검사 결과는 당시 이력으로 보존한다.

Play Console에서 직접 확인한 상태:

- Internal: V1.23(23) 활성.
- Alpha: V1.21(21) 활성.
- 전체 App Bundle 목록 두 페이지, 총 19개 확인. 최고 versionCode 23이며 24는 없음.
- 업로드 직전 전체 트랙·초안·번들 목록을 다시 확인해야 한다. 이번 확인은 code 24 예약이나 출시 승인이 아니다.

## 반영한 변경

- 기존 휴대폰 리팩터링(하단바 글자 폭·접근성, 타이머 시간 표시, 배터리 앱 정보 바로가기)을 보존했다.
- 실행·일시정지 중 타이머의 네 시간 변경 버튼만 `ghost`에서 `secondary`로 바꿨다. 대기 화면 버튼과 네이티브 타이머 계약은 유지했다.
- package 1.24.0, Expo 1.24, Android versionCode 24, iOS buildNumber 24와 릴리스 계약·문서를 갱신했다.
- `js-yaml` 4.3.1 → 4.3.2, `@xmldom/xmldom` 0.8.13 → 0.8.15 및 0.9.10 → 0.9.12, 개발 도구 `sharp` 0.35.3 → 0.35.4의 공식 보안 패치를 lockfile에 반영했다. Expo SDK나 React Native의 주요 버전은 변경하지 않았다.
- 만료된 보안 예외와 감사·릴리스 검증기는 변경하지 않았다.

## 빌드 도구와 초기 검증 이력

- 작업 전용 Node 24.16.0 / npm 11.13.0을 공식 배포 파일의 체크섬과 대조했다. 기존 JDK 17.0.20을 프로세스 한정으로 사용한다. 전역 도구나 PATH를 바꾸지 않았다.
- EAS CLI 21.7.0 읽기 전용 로그인 확인 성공. 빌드·제출은 실행하지 않았다.
- 버전·릴리스 계약 관련 5개 파일 / 45개 테스트와 프리셋·UI 계약 2개 파일 / 21개 테스트 통과.
- 고정 Node/npm으로 `npm ci` 성공. 이후 sharp 최종 패치를 설치했고, 실제 sharp 0.35.4의 32×32 PNG 인코딩·디코딩 smoke test도 통과했다. 최종 릴리스 전에는 확정 lockfile로 clean install을 다시 해야 한다.
- 문구 정책·패턴 source 검증·TypeScript·ESLint 통과. 전체 테스트는 **234개 파일 / 1,770개 통과**했고, sharp 최종 패치 설치 후 다시 실행한 동일 전체 테스트도 통과했다.
- Play 설정과 공개 개인정보처리방침 검증 통과. 스토어 자산 검사는 `--allow-missing-screenshots` 조건으로만 통과했으며 V1.24 실기기 스크린샷은 0개/재촬영 필요 상태다. 게시 자산 완료가 아니다.
- 패치 설치 후 `audit:dependencies`, `audit:tooling` 모두 image-size 두 권고 및 Metro 전이 경로 때문에 실패했다. 전체 npm 감사의 9건은 moderate 5건과 동일 image-size 원인의 high 패키지 경로 4건이다. js-yaml·xmldom·sharp의 앞서 확인한 high 항목은 남지 않았다.
- 소스는 미커밋 작업 상태다. 전체 release preflight와 production 빌드·네이티브 릴리스 검증은 실행하지 않았다. 부분 검사 성공을 전체 preflight 통과로 보지 않는다.

## 초기 차단 항목과 현재 처리 상태

1. **초기 image-size 보안 감사 실패 → 해당 의존성 제거 확인.** Metro가 사용하는 image-size의 `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq` high 예외가 2026-09-09에 만료됐다. 2026-09-13 초기 확인 시 npm 최신 버전은 2.0.2이며 두 권고 모두 공식 수정 버전이 없었다. 이후 공식 Metro 0.84.5로 정렬해 lockfile·설치 트리의 image-size 0개와 29개 회귀 테스트 통과를 확인했다. 예외·감사 정책은 변경하지 않았다. URI·Vitest 후속 변경을 포함한 최종 감사 완료와는 구분한다.
2. **초기 Expo Doctor 19/20 → 패치 후 20/20 통과.** SDK 57 패치 버전 15개가 권장 범위보다 낮아 초기 검사에 실패했다. 대상은 `@expo/ui`, `expo`, `expo-constants`, `expo-crypto`, `expo-document-picker`, `expo-file-system`, `expo-font`, `expo-haptics`, `expo-linking`, `expo-router`, `expo-sharing`, `expo-splash-screen`, `expo-system-ui`, `expo-updates`, `@expo/fingerprint`다. 이후 승인된 패치를 적용해 해당 불일치 검사를 해소했다. 제외 목록은 추가하지 않았으며 네이티브·실기기 검증은 별도로 남아 있다.
3. **기기 미연결.** 이번 배포 준비 시 ADB 목록이 비어 있어 새 프리셋 수정 APK를 설치하거나 화면을 재확인하지 못했다.
4. **Alpha 실증 게이트 미완료.** 이전 V1.23의 백그라운드 CPU, 실제 16KB 런타임, 사전 출시 보고서 보류 사유는 아직 해소되지 않았다. 코드 재검토에서 지속 CPU의 확정 원인은 찾지 못했으며, 현재 화면 수정으로 CPU 문제가 해결됐다고 기록하지 않는다. 후보 AAB의 Play 설치본에서 새 증거가 필요하다.
5. **최종 의존성·코드 검사 완료 / 출고 preflight는 미완료.** URI 디코더 호환 연결과 Vitest 4.1.11 반영 후 strict clean install 및 전체 1,836개 테스트·모든 등급 감사 0건을 확인했다. 이전 브랜드 timeout은 검증 내용·시간 제한을 바꾸지 않고 단일 worker 전체 검사에서 통과했다. 네이티브는 Play 1차 214개, 최종 direct 215개 통과이며 source commit 및 최종 lock의 전체 Play preflight는 아직 실행하지 않았다.

## 별도 화면 검증 APK

- 파일: `.artifacts/phone-screen-check-20260913/preset-fix/AlarmPyo-ScreenCheck-preset-fix-debug.apk`
- SHA-256: `1528e3090ada6e7905d55a1b4b9ece2c9d17ee22c4dce9654c12eaaa9f9210c0`
- 패키지 `com.personal.alarmpyo.screencheck`, 표시 이름 `알람표 화면검증`, 검증용 버전 1.23(23). 운영 앱이나 V1.24 배포 파일이 아니다.
- 기존 검증 앱과 같은 v2 debug 서명. 전체 ZIP 엔트리 비교에서 JS 번들만 바뀌었으며 나머지 엔트리 내용은 동일했다.
- 단일 증분 `packageDebug` 빌드 성공. 기존 APK·소스·증거를 덮어쓰지 않았다.
- 실제 기기 설치·화면 확인은 **미실시**. 예전 화면 검증 결과는 `phone-device-screen-check-20260913-ko.md`에 그대로 보존했다.

## 후속 순서

사용자가 2026-09-13에 AAB 생성·배포를 다시 요청했다. 기기 미연결 상태에서는 소스 확정·깨끗한 커밋의 전체 Play preflight → Play code 재확인 → EAS production AAB 한 번 생성·검증 → Internal 출시까지 먼저 진행한다. 그 뒤 해당 Play 설치본의 수정 화면·새 SDK·데이터·알람·CPU·16KB·사전 출시 보고서 검증을 통과해야 같은 code 24 번들을 Alpha로 승격한다. 실기기 검증을 합격 처리하거나 게이트를 완화하지 않는다. 재업로드·`submit:alpha`·Production 배포는 하지 않는다.

## 공식 근거

- [image-size ICNS 권고](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
- [image-size JXL·HEIF 권고](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
- [js-yaml 수정 버전](https://github.com/advisories/GHSA-2883-xcg3-v3hh)
- [xmldom 변경 이력](https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md)
- [sharp 수정 버전](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
