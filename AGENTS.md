# 알람표 작업 안내

이 파일은 이 저장소에서 작업하는 Codex와 자동화 에이전트가 먼저 읽어야 하는 프로젝트 지침이에요. 저장소 전체에 적용해요.

## 프로젝트 개요

- 앱 표시명은 `알람표`예요. 교대 근무표, 기상 알람, 수면 안내와 위젯을 제공하는 개인용 모바일 앱이에요.
- 계정, 로그인, 광고, 분석 SDK와 자체 서버를 사용하지 않아요. 근무표·메모·설정은 사용자 기기에만 저장해요.
- 이 저장소는 PostgreSQL, Prisma, PM2, Discord 봇 또는 Guardy 대시보드를 사용하지 않아요. 다른 작업공간의 서버 운영 지침을 이 앱에 적용하지 않아요.
- 실제 소스 루트는 이 `AGENTS.md`가 있는 디렉터리예요. 상위 폴더의 APK, 스크린샷과 다른 프로젝트는 알람표 소스로 취급하지 않아요.
- 기본 근무 방식은 `3조 2교대 (주주야야휴휴)`와 `주간 고정`이에요.
- 기본 주간은 `07:00~17:45`, 기본 야간은 `18:00~다음 날 06:45`예요. 사용자가 시간을 변경할 수 있으므로 화면과 계산 코드에 중복 하드코딩하지 않아요.
- 주간 고정은 월요일~금요일 주간, 토요일·일요일은 휴무예요.
- 앱의 공식 설명과 현재 기능은 먼저 `README.md`에서 확인해요.

## 기술 구성

- Expo SDK 57, React Native 0.86, React 19, TypeScript, Expo Router를 사용해요.
- 화면 라우트는 `src/app`, 기능 단위 UI는 `src/features`, 공용 UI는 `src/components`와 `src/design-system`에 있어요.
- 일정·알람·백업 계산은 `src/services`, 상태와 저장 흐름은 `src/store`와 `src/application`에 있어요.
- 데이터 모델은 `src/models/app-data.ts`, 검증과 마이그레이션은 `src/services/app-data-service.ts`에 있어요.
- Android 알람·전체 화면·재부팅 복구·위젯은 `modules/alarmpyo-alarm`의 Kotlin 네이티브 모듈이 담당해요.
- 배포 스크립트는 `scripts`, 배포 절차와 증거 형식은 `docs`에 있어요.
- 루트의 `android`, `dist`, `.expo`, `.release`, `node_modules`와 모든 `build` 폴더는 생성물이므로 직접 기능 소스로 수정하거나 커밋하지 않아요. Android 기능은 `modules/alarmpyo-alarm`에서 수정해요.

## 새 컴퓨터 준비

Android Gradle 도구의 경로 문제를 피하려면 저장소를 `C:\work\AlarmPyo`처럼 영문 경로에 두는 것을 권장해요.

필요한 환경은 다음과 같아요.

- Git
- Node.js 24 계열과 npm (`eas.json`의 빌드는 Node 24.16.0을 사용해요.)
- Android Studio와 Android SDK
- JDK 17
- 네이티브 또는 배포 작업을 할 때만 Expo/EAS 계정

처음 받은 소스는 다음 순서로 준비해요.

```powershell
npm ci
npm run check
```

개발 서버는 다음 명령으로 열어요.

```powershell
npm start
npm run android
npm run web
```

Expo Go에서는 Kotlin 네이티브 알람과 위젯을 검증할 수 없어요. 해당 기능은 개발 빌드나 설치 APK에서 확인해요.

## 작업 원칙

1. 수정 전 `git status --short`와 관련 파일을 확인해요. 기존 변경은 사용자의 작업이므로 임의로 되돌리거나 덮어쓰지 않아요.
2. 검색은 우선 `rg`와 `rg --files`를 사용해요.
3. 요청 범위 안에서 가장 작은 변경을 만들고 관련 테스트를 함께 추가하거나 갱신해요.
4. 소스 수정 후에는 항상 `npm run check`를 실행해요.
5. Kotlin, Android 리소스, Manifest 또는 네이티브 계약을 수정하면 `npm run test:android-native`도 실행해요.
6. `package.json`의 명령을 변경했다면 `npm run register --if-present`를 실행해요. 현재 `register` 명령이 없으면 그 사실을 결과에 명시해요.
7. 의존성을 변경하면 `npm run audit:dependencies`와 `npm run audit:tooling`도 실행해요.
8. 실패한 검사를 숨기거나 테스트를 삭제해 통과시키지 않아요. 환경 문제와 코드 문제를 구분해 보고해요.
9. 요청받지 않은 빌드, 배포, 제출, 업로드와 외부 메시지 전송은 실행하지 않아요.

## AlarmPyo 계보 불변 조건

다음 값은 새 AlarmPyo 계보의 데이터·업데이트·딥링크와 연결돼요. 첫 공개 뒤에는 명시적인 마이그레이션 계획과 사용자 승인 없이 바꾸지 않아요.

- Android/iOS 패키지: `com.personal.alarmpyo`
- URL 스킴: `alarmpyo`
- Expo project ID: `ffdda16b-a290-4fc6-919b-fddd50e0c25f` (`@2aox.hy/alarmpyo`)
- production Hosting URL: 아직 미정이며 `release-policy.json`에서 명시적으로 차단
- `alarmpyo:*` AsyncStorage 키
- `modules/alarmpyo-alarm` 모듈 이름과 기존 네이티브 PendingIntent 식별자
- 운영 APK 서명 인증서: 아직 미정이며 이전 앱 인증서를 재사용하지 않음

화면 표시명은 `알람표`, 영문 브랜드는 `AlarmPyo`, 내부 식별자는 `alarmpyo`를 사용해요. 이전 앱의 릴리스 원장·서명·배포 기준은 `docs/legacy-today-shift`에만 보존하고 새 계보와 섞지 않아요.

production Hosting URL과 앱 서명 인증서 SHA-256이 모두 실제 값으로 확정될 때까지 릴리스·OTA 게시·Play 제출은 차단해요. 임시 주소나 예제 인증서를 성공 값으로 만들지 않아요.

## 데이터 변경 규칙

- 현재 앱 데이터 버전은 `APP_DATA_VERSION = 19`예요.
- 모델 필드를 추가하거나 의미를 바꾸면 버전을 올리고 이전 모든 지원 버전의 마이그레이션을 유지해요.
- 새 필드는 기본값, 입력 검증, 저장, 자동 백업, 암호화 백업, 복원과 손상 데이터 복구 경로를 함께 다뤄요.
- 날짜별 근무·시간·예외·알람 변경은 하나의 저장 트랜잭션으로 처리해 부분 저장을 만들지 않아요.
- 첫 근무일 이전에는 자동 일정을 만들지 않아요.
- 날짜와 야간 익일 종료 계산은 사용자의 현지 시각 기준을 유지해요. 무심코 UTC 문자열로 변환하지 않아요.
- 앱 삭제 시 내부 자료가 사라진다는 기존 개인정보 안내를 유지해요.

## 알람과 위젯 규칙

- 근무 알람은 단순 푸시가 아니라 Android `AlarmManager` 기반 알람표 자체 알람이에요.
- 앱 종료·기기 재부팅·시간 및 시간대 변경 뒤 예약 복구 흐름을 보존해요.
- 전체 계획과 운영체제에 실제 등록하는 가까운 알람 수를 혼동하지 않아요. 예약·복구·5분 예비 알람의 중복 방지 계약을 유지해요.
- 날짜별 `alarmOverrides`는 근무 알람, 수면 안내, 오늘 화면과 위젯에 일관되게 반영해요.
- 교육은 주간 알람 기준을 사용해요.
- 권한을 저장된 사용 의사와 실제 전달 가능 상태로 나누어 처리해요. 권한 화면을 연 직후 성공으로 단정하지 않아요.
- Android의 사용자 `강제 종료` 상태에서는 알람을 보장할 수 없다는 플랫폼 한계를 안내해요.
- 위젯은 4×1 구성을 유지하며 폴링하지 않아요. 작은 높이와 큰 글자에서도 오늘 근무와 다음 근무가 잘리지 않아야 해요.

알람·위젯 변경은 TypeScript 단위 테스트뿐 아니라 Kotlin 테스트와 실제 Samsung 기기 검증이 필요해요.

## UI와 문구 규칙

- 사용자에게 보이는 문구는 한국어로 작성하고 자연스러운 해요체를 사용해요.
- 버튼은 `저장하기`, `뒤로가기`, `설정하기`처럼 행동이 분명한 이름을 사용해요.
- 공용 색상·간격·모서리·타이포그래피는 `src/design-system`과 `src/constants/app-theme.ts`를 우선 사용해요.
- 임의의 웹 CSS 클래스명이나 기기별 고정 픽셀 값에 의존하지 않아요.
- 라이트·다크 테마, 320dp 폭, 글자 크기 200%, 화면 회전 제한과 Safe Area를 확인해요.
- 터치 대상은 가능하면 최소 48×48dp를 유지하고 색상이나 아이콘만으로 상태를 구분하지 않아요.
- TalkBack용 레이블·역할·상태를 제공하고 반복 갱신되는 시간 문구를 불필요하게 재낭독하지 않아요.
- 애니메이션은 기기의 동작 줄이기 설정을 존중하고, 화면이 비활성일 때 타이머와 장식 애니메이션을 멈춰요.

## 직접 APK와 Google Play 분리

두 배포판의 정책을 섞지 않아요.

- 기본 `direct` 빌드는 설정의 APK 다운로드·검증·설치 화면 열기 기능을 포함해요.
- `ALARMPYO_DISTRIBUTION=play` 빌드는 `REQUEST_INSTALL_PACKAGES`, 업데이트 Provider, APK 설치 클래스와 직접 설치 UI를 빌드 시점에 제외해야 해요.
- 분리 기준은 `app.config.js`, `metro.config.js`, `modules/alarmpyo-alarm/android/build.gradle`, `plugins/with-play-store-policy.js`와 관련 검증 스크립트에 있어요.
- 자바스크립트만 바뀌고 네이티브 계약이 그대로일 때만 같은 `runtimeVersion`의 무선 업데이트를 사용해요.
- 네이티브 모듈, 권한, 플러그인, 앱 설정이 바뀌면 앱 버전과 빌드 번호를 올리고 새 바이너리를 만들어요.
- 버전을 올릴 때 `package.json`, `app.json`의 버전, Android `versionCode`, iOS `buildNumber`의 정합성을 확인해요.
- 릴리스 검사는 깨끗한 Git 상태를 요구해요. 기존 변경을 임의로 커밋하거나 삭제해 조건을 맞추지 말고, 차단 상태를 사용자에게 알려요.

배포는 사용자가 명시적으로 요청한 경우에만 실행하고, 먼저 관련 문서를 읽어요.

- 직접 APK: `docs/release-provenance.md`
- Google Play: `docs/google-play-release-runbook-ko.md`
- 개인정보 및 데이터 보안: `docs/google-play-data-safety-ko.md`

주요 검증 명령은 다음과 같아요.

```powershell
npm run release:preflight
npm run release:preflight:play
npm run release:verify:aab
```

실제 빌드나 제출 명령은 검증 통과와 사용자 승인 없이는 실행하지 않아요.

## 보안과 산출물

- 토큰, 비밀번호, 서비스 계정 JSON, `.env`, `local.properties`, 키스토어와 인증서를 저장소에 추가하지 않아요.
- 비밀값을 명령행 출력, 테스트 fixture, 스크린샷 또는 보고서에 노출하지 않아요.
- `node_modules`, `.expo`, `.release`, `dist`, Android 빌드 폴더, APK, AAB와 임시 로그를 소스 변경으로 취급하지 않아요.
- `git reset --hard`, `git clean -fd`, 재귀 삭제 같은 파괴적 명령은 사용자의 명시적 승인 없이 실행하지 않아요.
- 공개 APK를 수동으로 덮어쓰지 않아요. 배포 스크립트의 SHA-256·서명·출처 검증과 원자적 승격 절차를 사용해요.

## 작업 완료 보고

최종 보고에는 다음 내용을 짧게 포함해요.

- 무엇을 변경했는지
- 사용자가 확인할 화면이나 동작
- 실행한 검사와 결과
- 실행하지 못한 검사와 정확한 이유
- 실제 기기 확인이나 배포처럼 남은 작업

검사가 통과하지 않았거나 실기기 확인을 하지 않았다면 `완벽`, `배포 준비 완료`, `알람 보장`이라고 표현하지 않아요.
