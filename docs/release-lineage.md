# AlarmPyo 릴리스 계보 준비 상태

`알람표`의 영문 브랜드는 `AlarmPyo`, 내부 식별자는 `alarmpyo`, 앱 패키지는 `com.personal.alarmpyo`예요. 이 계보는 이전 앱과 별개로 처음부터 시작해요.

## 현재 차단 상태

Expo 프로젝트 `@2aox.hy/alarmpyo`를 만들고 project ID `ffdda16b-a290-4fc6-919b-fddd50e0c25f`를 앱과 릴리스 정책에 연결했어요.

direct 정책의 다음 운영 값은 아직 확정되지 않았어요.

- production Hosting 기준 URL

Play 정책에서는 다음 값이 아직 확정되지 않았어요.

- 공개 접근을 확인한 개인정보처리방침 HTTPS URL

AlarmPyo의 첫 EAS Android 키스토어는 내부 canary 빌드에서 생성했고, 앱 서명 인증서 SHA-256은 `49a23f9cc1ef3055b0f601720d6262863e27726718cf5ce6caf4f0062acabe6a`예요. 이 인증서를 direct APK 계보의 기준으로 유지해요. Play App Signing은 Google 관리 별도 signer를 사용해요. 2026-08-12 Play Console의 App Signing 화면과 Digital Asset Links에서 최종 앱 서명 인증서 SHA-256 `08fccbdd720998439752f1748f28c7c6a47430d3ddb6e02b10cdf775b479bcad`를 확인했어요. direct 지문과 다르므로 direct 설치본 위에 Play판을 제자리 업데이트하는 계보가 아니며, 실제 내부 트랙 설치본에서도 다시 확인해요.

따라서 `release-policy.json`과 `play-release-policy.json`의 `releaseState`는 각각 `blocked`예요. direct stable 릴리스·공개 승격·OTA 게이트와 Play 빌드·제출 게이트는 서로의 URL blocker를 복제하지 않아요. 각 정책의 자체 blocker가 남은 상태에서 해당 배포 명령이 성공하면 안 되며, 임시 UUID·예제 URL 또는 이전 앱 인증서를 운영 값으로 넣지 않아요.

공개 기능과 운영 승격을 전혀 수행하지 않는 비공개 EAS internal canary APK만 현재 사용할 수 있어요. Play 인증서는 이미 확인됐으므로 제출 불가 draft AAB 부트스트랩 예외는 다시 사용할 수 없어요. 관련 명령은 정책이 인증서 미확정 상태로 돌아가지 않는 한 실패해야 해요. 절차와 사용 범위는 [`internal-canary-apk-ko.md`](internal-canary-apk-ko.md)와 [`google-play-release-runbook-ko.md`](google-play-release-runbook-ko.md)를 따라요.

direct 정책 형식은 [`release-policy.schema.json`](release-policy.schema.json), Play 정책 형식은 [`play-release-policy.schema.json`](play-release-policy.schema.json)에 고정해요. 첫 공개 후보는 `1.0.1`, Android `versionCode`는 `2`, iOS `buildNumber`는 `2`예요. `1.0.0(1)` 내부 canary를 공개 후보로 재사용하지 않아요.

## 차단 해제 조건

1. 실제 production Hosting을 만든 뒤 HTTPS 기준 URL을 `productionHostingUrl`에 기록해 direct 정책의 마지막 blocker를 해제해요.
2. EAS에 보관된 direct 키스토어를 장기 보관해요.
3. 실제 개인정보처리방침 Pages를 공개·확인한 뒤 쿼리와 조각이 없는 HTTPS 주소를 `play-release-policy.json`의 `privacyPolicyUrl`에 기록해요. 이 작업은 direct `productionHostingUrl`을 변경하지 않아요.
4. Play 내부 트랙 설치본의 실제 인증서가 2026-08-12에 기록한 Google 관리 별도 signer와 같은지 다시 확인해요.
5. 각 정책의 `releaseBlockers`를 모두 해소한 배포판만 `releaseState: active`로 전환해요.
6. 새 패키지로 빌드한 산출물과 실기기 증거를 검증한 뒤에만 `docs/release-ledger.json`에 첫 항목을 추가해요.

이전 계보의 증거는 [`legacy-today-shift`](legacy-today-shift/README.md)에만 보존해요.
