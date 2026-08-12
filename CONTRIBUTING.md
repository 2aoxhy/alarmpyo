# 알람표(AlarmPyo) 기여 안내

알람표는 주간·교대 근무자의 근무표, 기상 알람, 수면 준비와 위젯을 다루는 로컬 우선 모바일 앱이에요. 기여해 주셔서 고마워요.

## 시작하기

Windows에서는 Android Gradle 도구의 경로 문제를 피하도록 `C:\work\AlarmPyo`처럼 영문 경로를 권장해요.

필요한 도구:

- Node.js 24.16.0과 npm 11.13.0
- JDK 17
- Android Studio와 Android SDK
- Git

```powershell
npm ci
npm run check
```

Expo Go에서는 Kotlin 네이티브 알람과 위젯을 검증할 수 없어요. 이 기능은 개발 빌드나 설치 APK에서 확인해요.

## 변경 원칙

- 작업 전에 `AGENTS.md`와 관련 소스·테스트를 읽어 주세요.
- 한 PR에는 하나의 문제나 밀접한 변경만 담아 주세요.
- 계정·광고·분석 SDK·자체 서버를 새로 도입하려면 먼저 이슈에서 제품·개인정보 영향을 논의해 주세요.
- 사용자 문구는 자연스러운 한국어 해요체로 작성해 주세요.
- 320dp 폭, 글자 200%, 다크 테마와 TalkBack을 고려해 주세요.
- 모델이나 저장 의미를 바꾸면 데이터 버전, 마이그레이션, 백업·복원과 손상 복구를 함께 다뤄 주세요.
- 알람 변경은 앱 종료·재부팅·시간대 변경 복구, 예비 알람 중복 방지와 실제 Android 기기 동작을 함께 확인해 주세요.
- 생성물인 `android`, `dist`, `.expo`, `.release`, `node_modules`와 모든 `build` 폴더는 소스 변경으로 제출하지 마세요.

표시명은 `알람표`, 영문 브랜드는 `AlarmPyo`, 내부 식별자는 `alarmpyo`, 패키지는 `com.personal.alarmpyo`예요. Expo 프로젝트는 `@2aox.hy/alarmpyo`에 연결됐고 direct APK 인증서는 새 AlarmPyo 계보로 확정됐어요. 남은 direct 공개 배포 blocker는 production Hosting URL이며, Play App Signing signer 전략은 아직 결정하지 않았어요. Google 관리 별도 signer를 선택한 경우의 첫 인증서 확인용 draft AAB도 명시적 1회성 opt-in과 깨끗한 커밋에서만 만들며 자동 제출하지 않아요. 임시 URL이나 예제 인증서를 운영 설정처럼 추가하지 마세요.

## 검사

모든 소스 변경:

```powershell
npm run check
```

Kotlin, Android 리소스, Manifest 또는 네이티브 계약 변경:

```powershell
npm run test:android-native
```

의존성 변경:

```powershell
npm run audit:dependencies
npm run audit:tooling
```

실행하지 못한 검사가 있다면 PR 본문에 명령과 정확한 이유를 적어 주세요. 실패한 검사를 삭제하거나 완화해 통과시키지 마세요.

## PR 체크리스트

- 변경 목적과 사용자 영향을 설명했어요.
- 관련 테스트를 추가하거나 갱신했어요.
- 실행한 검사와 결과를 기록했어요.
- 실제 기기가 필요한 변경은 확인 기기·Android 버전과 남은 검증을 적었어요.
- 개인정보, 권한, 백업 또는 데이터 마이그레이션 영향을 검토했어요.
- 비밀값, APK/AAB, 키스토어, 인증서와 개인 정보가 포함되지 않았어요.

보안 취약점은 공개 이슈나 PR에 적지 말고 [`SECURITY.md`](SECURITY.md)의 비공개 신고 절차를 이용해 주세요.
