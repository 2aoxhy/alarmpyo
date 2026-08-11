# AlarmPyo 릴리스 계보 준비 상태

`알람표`의 영문 브랜드는 `AlarmPyo`, 내부 식별자는 `alarmpyo`, 앱 패키지는 `com.personal.alarmpyo`예요. 이 계보는 이전 앱과 별개로 처음부터 시작해요.

## 현재 차단 상태

Expo 프로젝트 `@2aox.hy/alarmpyo`를 만들고 project ID `ffdda16b-a290-4fc6-919b-fddd50e0c25f`를 앱과 릴리스 정책에 연결했어요.

다음 운영 값은 아직 발급되거나 확정되지 않았어요.

- production Hosting 기준 URL
- AlarmPyo 앱 서명 인증서 SHA-256

따라서 `release-policy.json`과 `play-release-policy.json`의 `releaseState`는 `blocked`예요. stable 릴리스·공개 승격·OTA 게시·Play 제출 스크립트는 이 상태에서 성공하면 안 돼요. 임시 UUID, 예제 URL 또는 이전 앱 인증서를 운영 값으로 넣지 않아요.

예외는 공개 기능과 운영 승격을 전혀 수행하지 않는 비공개 EAS internal canary APK뿐이에요. 이 경로도 깨끗한 Git, 전체 앱 검사, 의존성·도구 감사, Expo Doctor, 네이티브 테스트, 패키지·버전·Updates·EAS 프로젝트 연결을 모두 확인해요. 절차와 사용 범위는 [`internal-canary-apk-ko.md`](internal-canary-apk-ko.md)를 따라요.

정책 형식은 [`release-policy.schema.json`](release-policy.schema.json)에 고정해요. 첫 버전은 `1.0.0`, Android `versionCode`는 `1`, iOS `buildNumber`는 `1`이에요.

## 차단 해제 조건

1. 실제 production Hosting을 만든 뒤 HTTPS 기준 URL을 `productionHostingUrl`에 기록해요.
2. 새 AlarmPyo 서명 키를 안전하게 준비하고 인증서 SHA-256을 `signingCertificateSha256`에 기록해요.
3. `releaseBlockers`를 빈 배열로 바꾸고 `releaseState`를 `active`로 전환해요.
4. 새 패키지로 빌드한 산출물과 실기기 증거를 검증한 뒤에만 `docs/release-ledger.json`에 첫 항목을 추가해요.

이전 계보의 증거는 [`legacy-today-shift`](legacy-today-shift/README.md)에만 보존해요.
