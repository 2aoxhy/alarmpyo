# 비공개 내부 canary APK

첫 AlarmPyo APK를 설치해 네이티브 기능과 새 서명 계보를 확인할 때는 공개 direct 릴리스와 분리된 `canary` 경로만 사용해요. 이 경로는 공개 릴리스에 승격하지 않는 EAS internal distribution APK를 만들 뿐이며, APK 공개·운영 Hosting 배포·OTA 게시·Play 제출을 승인하지 않아요.

`release-policy.json`의 `releaseState`가 `blocked`여도 production Hosting URL만 미정인 현재 상태에서는 이 내부 경로를 사용할 수 있어요. 기존 `build:apk`, `build:apk:stable`, `release:promote:android`는 운영 정책이 활성화될 때까지 계속 실패해야 해요.

## 선행 조건

- 실제 Git 저장소의 커밋된 깨끗한 HEAD가 필요해요. `.git`이 없거나 추적되지 않은 변경이 있으면 시작하지 않아요.
- Node.js 24 계열과 npm, JDK 17, Android SDK를 준비해요. Android Gradle 경로 문제를 줄이려면 영문 작업 경로를 권장해요.
- Expo/EAS에 로그인하거나 승인된 `EXPO_TOKEN`을 사용하고, `@2aox.hy/alarmpyo` 프로젝트를 읽을 권한이 있어야 해요.
- Expo 프로젝트 설정에서 **Unauthenticated access to internal builds**를 꺼요. EAS internal 배포 URL은 기본적으로 주소를 아는 누구나 열 수 있으므로, 이 설정을 끄지 않았다면 비공개 APK라고 부르거나 링크를 공유하지 않아요.
- `app.json`, `release-policy.json`의 EAS project ID가 서로 같고, 패키지가 `com.personal.alarmpyo`여야 해요.
- 첫 빌드에서 Android 자격 증명을 만들거나 선택할 때 이전 앱의 키를 사용하지 않아요. canary에 사용한 새 키를 잃어버리지 않도록 EAS 자격 증명 보관 상태를 확인해요.

EAS project ID는 앱 설정의 `extra.eas.projectId`로 프로젝트를 연결한다는 [Expo 공식 안내](https://docs.expo.dev/accounts/programmatic-access/)를 따라요. 내부 배포 APK의 접근 방식, 기본 링크 공개 범위와 인증 제한 설정은 [EAS Internal Distribution](https://docs.expo.dev/build/internal-distribution/)에서 확인해요.

## 내부 게이트

`release:preflight:canary`는 다음 항목을 모두 통과해야 해요.

1. Git 상태가 깨끗한지 확인해요.
2. TypeScript, lint, JavaScript 테스트를 실행해요.
3. 운영 의존성과 개발 도구 취약점을 감사해요.
4. Expo Doctor와 Android 네이티브 단위 테스트를 실행해요.
5. 패키지·버전·runtimeVersion·EAS project ID·canary 프로필을 검증해요.
6. `eas project:info`로 로그인 상태와 실제 원격 프로젝트 연결을 확인해요.

내부 canary에서는 Expo Updates가 `enabled: false`로 명시되어 있으면 OTA 주소 없이 빌드할 수 있어요. Updates를 켜면 `ON_LOAD`, 0 이상의 `fallbackToCacheTimeout`, 현재 project ID의 `https://u.expo.dev/<project-id>` 주소를 모두 요구해요. 이 검사는 OTA 게시 권한을 주지 않으며, `publish:update:canary`의 공개 APK 선행 게이트도 우회하지 않아요.

production Hosting URL, 공개 APK manifest, `public/downloads`, 운영 인증서 신뢰 목록, 실기기 배포 증거는 내부 APK 생성의 선결 조건이 아니에요. 대신 이 값들이 없으면 stable APK 승격과 공개는 계속 차단돼요.

## 실행 순서

의존성을 준비한 뒤 먼저 게이트만 확인할 수 있어요.

```powershell
npm ci
npm run release:preflight:canary
```

모든 검사가 통과한 같은 깨끗한 커밋에서 비공개 APK를 만들어요. 빌드 명령은 게이트를 다시 실행해요.

```powershell
npm run build:apk:canary
```

`eas build --profile canary`를 직접 실행하거나 `ALARMPYO_EAS_NO_VCS=1`로 Git 검사를 우회하지 않아요. canary 프로필은 `preview` 환경, `canary` 채널, `internal` 배포, Android `apk` 형식과 `ALARMPYO_DISTRIBUTION=direct`로 고정돼요. build profile의 환경 변수는 로컬 app config 평가와 EAS 빌더 양쪽에 적용된다는 [EAS build profile 공식 문서](https://docs.expo.dev/build/eas-json/)를 기준으로 해요.

## 빌드 뒤 사용 범위

- EAS 빌드 상세 화면의 비공개 설치 링크나 내려받은 APK로만 내부 QA를 진행해요.
- 로그아웃한 브라우저에서 설치 URL이 인증 없이 열리지 않는지 확인해요. 열리면 프로젝트의 unauthenticated access를 끄고 새 링크의 접근 제한을 다시 확인하기 전에는 공유하지 않아요.
- 빌드 ID, Git 커밋, 패키지, versionCode와 실제 서명 인증서 SHA-256을 기록해요.
- 생성된 APK를 `public/downloads`에 복사하거나 공개 manifest·릴리스 원장에 추가하지 않아요.
- 내부 검증 결과만으로 `release-policy.json`을 활성화하지 않아요. production Hosting URL과 Play App Signing 계보를 별도로 확정해야 해요.
- APK를 공개하려면 [`release-provenance.md`](release-provenance.md)의 stable 출처·실기기·장기 보관·승격 게이트를 처음부터 통과해요.

canary 설치본은 공개 업데이트 약속이 아니에요. 외부 사용자에게 배포하거나 장기 설치본으로 취급하지 않아요.
