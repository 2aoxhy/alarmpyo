# AlarmPyo 릴리스 계보 준비 상태

`알람표`의 영문 브랜드는 `AlarmPyo`입니다. 패키지와 내부 식별자는 공개 문서에 반복하지 않고 공식 설정 파일을 단일 기준으로 사용하며, 이 계보는 이전 앱과 별개로 처음부터 시작합니다.

## 현재 차단 상태

공식 Expo 프로젝트를 만들고 project ID를 `app.json`과 릴리스 정책의 단일 기준값으로 연결했습니다. 계정명과 식별자는 문서·예제에 반복하지 않습니다.

direct 정책의 다음 운영 값은 아직 확정되지 않았습니다.

- production Hosting 기준 URL

Play 정책의 공개 개인정보처리방침 URL과 Google 관리 App Signing 계보는 확인을 마쳤고 `releaseState: active`입니다. 개인정보처리방침 URL에 포함된 공개 호스팅 계정명은 현재 Play 등록 주소이므로, 새 조직 또는 커스텀 도메인으로 실제 이전하기 전까지 임의로 바꾸지 않습니다.

AlarmPyo의 첫 EAS Android 키스토어는 내부 canary 빌드에서 생성했고, 인증서 지문은 `release-policy.json`만 단일 기준으로 유지합니다. Play App Signing은 Google 관리 별도 signer를 사용하며 최종 앱 서명 지문은 `play-release-policy.json`만 기준으로 삼습니다. 두 지문이 다르므로 direct 설치본 위에 Play판을 제자리 업데이트하는 계보가 아니며, 실제 내부 트랙 설치본에서도 다시 확인합니다.

따라서 `release-policy.json`은 `blocked`, `play-release-policy.json`은 `active`입니다. direct stable 릴리스·공개 승격·OTA 게이트와 Play 빌드·제출 게이트는 서로의 URL blocker를 복제하지 않습니다. 각 정책의 자체 blocker가 남은 상태에서 해당 배포 명령이 성공하면 안 되며, 임시 UUID·예제 URL 또는 이전 앱 인증서를 운영 값으로 넣지 않습니다.

direct 공개 기능과 운영 승격을 수행하지 않는 비공개 EAS internal canary APK는 계속 사용할 수 있습니다. Play는 활성 정책의 일반 AAB 경로를 사용하며, 제출 불가 draft AAB 부트스트랩 예외는 다시 사용할 수 없습니다. 관련 명령은 정책이 인증서 미확정 상태로 돌아가지 않는 한 실패해야 합니다. 절차와 사용 범위는 [`internal-canary-apk-ko.md`](internal-canary-apk-ko.md)와 [`google-play-release-runbook-ko.md`](google-play-release-runbook-ko.md)를 따릅니다.

direct 정책 형식은 [`release-policy.schema.json`](release-policy.schema.json), Play 정책 형식은 [`play-release-policy.schema.json`](play-release-policy.schema.json)에 고정합니다. 첫 공개 후보는 `1.0.1`, Android `versionCode`는 `2`, iOS `buildNumber`는 `2`였습니다. V11 · `versionCode 11`은 로컬 구현·검증만 완료하고 Play에 업로드하지 않았습니다. V12 · `1.0.12(12)`는 Play internal에 배포했습니다. V13 · `1.0.13(13)`은 2026-08-21 Play internal과 Alpha에 배포되었습니다. V14 · `1.0.14(14)`와 V15 · `1.15(15)`는 Play internal에 배포했으며, 현재 소스의 후속 후보는 `V16 · 1.16(16)`입니다. V09는 사용하지 않습니다. V15부터 사용자·Play 버전은 `1.x`, npm SemVer는 `1.x.0`으로 관리합니다. `1.0.0(1)` 내부 canary는 공개 후보로 재사용하지 않습니다.

## 차단 해제 조건

1. 실제 production Hosting을 만든 뒤 HTTPS 기준 URL을 `productionHostingUrl`에 기록해 direct 정책의 마지막 blocker를 해제합니다.
2. EAS에 보관된 direct 키스토어를 장기 보관합니다.
3. Play 개인정보처리방침 Pages URL 등록은 완료했습니다. V12 본문과 공식 서명 패턴 세 파일은 2026년 8월 20일 `main` 커밋 `c7a155f`의 GitHub Actions 실행 `#5`로 게시했으며, 로컬 원본 일치와 세 서명을 확인했습니다. 이후 본문이나 시행일을 바꾼 릴리스는 같은 URL에 새 원본을 다시 게시하고 로컬 SHA-256과 일치하는지 확인하며, 이 작업은 direct `productionHostingUrl`을 변경하지 않습니다.
4. Play 내부 트랙 설치본의 실제 인증서가 2026-08-12에 기록한 Google 관리 별도 signer와 같은지 다시 확인합니다.
5. 각 정책의 `releaseBlockers`를 모두 해소한 배포판만 `releaseState: active`로 전환합니다.
6. 새 패키지로 빌드한 산출물과 실기기 증거를 검증한 뒤에만 `docs/release-ledger.json`에 첫 항목을 추가합니다.

이전 계보의 정확한 운영 증거는 공개 저장소 밖에 보관하고, [`legacy-today-shift`](legacy-today-shift/README.md)에는 분리 원칙만 남깁니다.
