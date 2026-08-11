# Google Play 릴리스 절차

이 문서는 알람표의 Play 내부 테스트부터 production 출고까지 적용하는 차단 게이트예요. 실제 업로드·트랙 배포·production 출시는 사용자가 명시적으로 요청한 경우에만 실행해요. Play 배포본은 직접 APK 설치 화면·JavaScript 코드·네이티브 설치 API·Provider·`REQUEST_INSTALL_PACKAGES`를 빌드 시점에 제외하고, 직접 배포 APK는 기존 업데이트 기능을 유지해요.

현재 AlarmPyo 계보는 Expo 프로젝트 `@2aox.hy/alarmpyo`에 연결됐지만 production Hosting URL과 앱 서명 인증서가 미정이라 `releaseState: blocked`예요. 남은 두 실제 값이 확정되기 전에는 아래 빌드·제출 절차를 실행하지 않아요.

## 0. 출시 전에 정책 결정을 끝내요

다음 항목은 코드를 빌드하기 전에 Play Console과 계정 상태에서 확인해 기록해요.

- 수면 안내를 유지하는 현재 기능은 Google의 `Sleep Management` 설명에 포함될 가능성이 있어요. 모든 앱은 건강 앱 선언을 완료해야 하며, 알람표는 Play 지원 답변이 달리 확인되지 않는 한 `Sleep Management`로 보수적으로 신고해요. 수면 기능을 Play 빌드에서 완전히 제외하기로 결정했다면 앱·스토어 설명·개인정보 처리방침을 함께 다시 검토해요. [건강 앱 선언 공식 안내](https://support.google.com/googleplay/android-developer/answer/14738291?hl=ko)
- 2026년 9월 30일부터 적용되는 Play Console 요구사항은 건강 앱 등 지정 서비스 제공자가 조직 계정으로 등록하도록 규정해요. 수면 기능 분류와 조직 계정 전환·D-U-N-S 준비 여부를 production 전에 확정해요. 미확정 상태에서는 production을 시작하지 않아요. [Play Console 요구사항](https://support.google.com/googleplay/android-developer/answer/10788890?hl=ko)
- 2023년 11월 13일 이후 만든 개인 개발자 계정이면 production 권한 신청 전에 최소 12명이 14일 연속 참여한 비공개 테스트가 필요해요. 계정 생성일과 적용 여부를 확인하고, 해당하면 내부 테스트만으로 대체하지 않아요. [개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ko)

## 1. 앱 서명과 versionCode 계보를 먼저 고정해요

AlarmPyo는 `com.personal.alarmpyo`라는 새 package 계보로 시작해요. 첫 버전은 `1.0.0`, Android `versionCode`는 `1`, iOS build는 `1`이에요. 이전 앱의 인증서나 versionCode를 이어받지 않아요.

1. 새 AlarmPyo 앱 서명 키를 안전하게 준비하고 인증서 SHA-256을 `release-policy.json`에 기록해요.
2. direct APK와 Play App Signing이 첫 출시부터 같은 앱 서명 계보를 사용하도록 결정해요. Google이 별도 키를 자동 생성하도록 확정하기 전에 direct 배포 전략과 함께 다시 확인해요.
3. 업로드 키는 앱 서명 키와 달라도 괜찮아요. AAB 업로드 서명과 사용자에게 전달되는 APK 서명을 혼동하지 않아요.
4. Play Console의 앱 무결성 화면에서 앱 서명 인증서 SHA-256을 저장하고, 내부 트랙 설치본에서도 같은 값을 확인해요.

Google은 여러 스토어에서 같은 키를 유지하려면 자체 키를 Play에 제공하거나 Play 서명 APK를 외부 배포에 사용하도록 안내해요. [Play App Signing 공식 안내](https://support.google.com/googleplay/android-developer/answer/9842756?hl=ko)

첫 Play 후보를 올리기 전에는 다음 두 값이 모두 `0`인지 확인해요.

- 웹 원장뿐 아니라 메신저·파일 공유·테스터 전달까지 포함한 **실제 유통 direct APK 최고 versionCode**
- 후보를 올리기 전에 Play Console의 모든 트랙·초안·과거 업로드에서 확인한 **기존 최고 versionCode**

두 값이 모두 `0`일 때 첫 후보는 `versionCode: 1`이에요. 후보를 업로드하기 전에 확인한 결과를 `.release/play/release-evidence.json`의 `highestPreviouslyDistributedVersionCode`와 `highestExistingPlayVersionCode`에 기록하고, 추정값을 넣지 않아요. 첫 후보보다 먼저 같은 package의 산출물을 유통하거나 Play에 올렸다면 실제 최고값보다 큰 versionCode로 다시 정하고 문서·설정·증거를 함께 갱신해요.

## 2. 사전 검증과 AAB를 만들어요

깨끗한 원본 Git 저장소와 릴리스 커밋에서 실행해요.

```powershell
npm ci
npm run release:preflight:play
npm run build:aab
```

`build:aab`는 기본 릴리스 검사, Play 전용 설정 검사, Play JavaScript 번들 분리 검사를 통과한 뒤 EAS `production` 프로필로 AAB를 만들어요. 이 소스 아카이브처럼 `.git`이 빠진 복사본에서는 빌드·출처 증명을 진행하지 않아요.

Play 사전 검증은 깨끗한 소스, 앱 검사, 의존성·도구 감사, Expo Doctor, OTA 런타임 설정, Android 네이티브 테스트를 유지해요. direct APK용 `public/downloads` 보존 감사와 `public/updates/latest-android.json` manifest 검사는 Play AAB의 선결 조건에서 분리해요. direct 공개 산출물 상태가 Play 빌드를 막거나, 반대로 Play 검사 통과가 direct APK 공개 검증을 대신하지 않도록 두 흐름을 구분해요.

## 3. EAS 원본과 AAB를 묶어요

EAS 빌드 상세 JSON을 BOM 없는 UTF-8로 저장하고 EAS 원본 AAB를 다운로드해요.

```powershell
New-Item -ItemType Directory -Force .release | Out-Null
$metadata = node scripts/run-eas-cli.mjs build:view <빌드-ID> --json
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) '.release/eas-build-play.json'),
  ($metadata -join [Environment]::NewLine),
  [System.Text.UTF8Encoding]::new($false)
)

npm run release:verify:aab -- --aab .release/AlarmPyo.aab `
  --eas-build .release/eas-build-play.json
```

AAB 검증기는 다음을 모두 확인해요.

- 고정된 bundletool의 구조 검증과 AAB JAR 서명 무결성
- `com.personal.alarmpyo`, 앱 버전, `versionCode`, `targetSdk`
- `bundletool dump config`의 `PAGE_ALIGNMENT_16K`
- `REQUEST_INSTALL_PACKAGES`, 직접 APK Provider·authority 제거
- DEX의 installer 클래스·API·설치 Intent 제거
- JavaScript 번들의 직접 APK 업데이트 화면 제거
- 로컬 AAB와 EAS 원본의 크기·SHA-256·소스 커밋 일치

결과는 `.release/play/<AAB파일명>.provenance.json`에 저장돼요. 이 파일의 `pageAlignment`가 `PAGE_ALIGNMENT_16K`가 아니면 내부 트랙에도 제출하지 않아요.

## 4. 16KB 호환성은 세 단계로 확인해요

`PAGE_ALIGNMENT_16K`는 Play가 생성할 APK의 ZIP 정렬 요청을 확인하는 기본 게이트지만, 네이티브 ELF와 실제 런타임까지 보장하지 않아요. React Native 앱은 네이티브 `.so`를 포함하므로 다음 검증을 모두 수행해요. [Android 16KB 공식 안내](https://developer.android.com/guide/practices/page-sizes?hl=ko)

1. **AAB 설정:** 위 AAB 검증기의 `bundletool dump config` 결과가 `PAGE_ALIGNMENT_16K`인지 확인해요.
2. **Play 생성 APK:** App Bundle Explorer에서 같은 versionCode의 기기별 split APK를 내려받아요. Android SDK의 `zipalign -c -P 16 -v 4 <APK>`를 모든 네이티브 라이브러리 포함 APK에 실행해요.
3. **ELF와 런타임:** Linux/macOS에서는 Android 공식 `check_elf_alignment.sh`로 모든 `.so`의 ELF `LOAD` 정렬을 확인해요. Windows에서는 Android Studio APK Analyzer의 Alignment 경고와 SDK `zipalign`을 사용하고, 필요하면 WSL/Linux에서 공식 스크립트를 실행해요. 16KB Android 15 이상 기기나 AVD에서 `adb shell getconf PAGE_SIZE`가 `16384`인지 확인한 뒤 설치·실행·알람·위젯을 검사해요.

## 5. 내부 테스트 초안에만 제출해요

```powershell
npm run submit:internal -- --aab .release/AlarmPyo.aab `
  --eas-build .release/eas-build-play.json
```

이 명령은 전체 사전 검증과 AAB·EAS 원본 검증을 다시 실행한 뒤 `internal` 트랙의 **초안**으로만 업로드해요. 업로드 후 Play Console에서 실제 내부 테스트 릴리스를 별도로 검토해요.

서명 연속성과 최종 전달물 QA에는 Internal App Sharing을 사용하지 않아요. Internal App Sharing은 테스트 인증서로 다시 서명돼요. Samsung 실기기는 내부 또는 비공개 트랙의 Play Store에서 설치하고, 16KB 환경은 App Bundle Explorer의 기기별 APK를 `adb install-multiple`로 설치해요. [Play App Signing의 테스트 안내](https://support.google.com/googleplay/android-developer/answer/9842756?hl=ko), [App Bundle Explorer 안내](https://support.google.com/googleplay/android-developer/answer/9844279?hl=ko)

## 6. Play 생성 APK의 실기기 증거를 만들어요

`docs/play-release-evidence.example.json`과 세 원본 예제를 `.release/play` 아래 대응 경로로 복사한 뒤 실제 값만 기록해요. 예제의 `false`는 검사 없이 `true`로 바꾸지 않아요.

Samsung 실기기에서는 다음을 확인해요.

- 설치 출처가 `com.android.vending`이고 앱 서명 SHA-256이 새 AlarmPyo 정책 인증서와 같아요.
- 첫 출시는 새 설치·초기 설정을 확인하고, 후속 출시는 기존 AlarmPyo 위에 설치해 근무표·메모·설정·권한이 유지되는지 확인해요.
- 앱 종료, 재부팅, 날짜·시간·시간대 변경 뒤 정확한 알람과 예약 복구가 동작해요.
- 알림 거부 상태, 전체 화면 알람, 포그라운드 알람음, 위젯을 확인해요.

16KB 기기 또는 AVD에서는 App Bundle Explorer split APK의 서명·ZIP·ELF 정렬, 설치·실행, 일정 흐름, 앱 종료·재부팅 알람과 위젯을 확인해요.

각 원본 JSON의 SHA-256을 계산해 상위 증거에 기록해요.

```powershell
Get-FileHash .release/play/device-evidence/current-samsung.json -Algorithm SHA256
Get-FileHash .release/play/device-evidence/page-size-16kb.json -Algorithm SHA256
Get-FileHash .release/play/prelaunch-evidence/report.json -Algorithm SHA256

npm run release:verify:play-evidence -- `
  --provenance .release/play/AlarmPyo.aab.provenance.json `
  --evidence .release/play/release-evidence.json
```

검증기는 AAB SHA-256, EAS 빌드 ID, Git 커밋, versionCode 계보, AlarmPyo 정책 인증서, Samsung·16KB 원본 증거 해시, 사전 출시 보고서를 대조해요. 통과 결과는 `.release/play/verified-release-evidence.json`에 생성되며 14일 동안만 유효해요. 이 파일이 없거나 오래됐으면 production으로 진행하지 않아요.

## 7. 사전 출시 보고서와 정책 선언을 끝내요

Play 사전 출시 보고서가 완료될 때까지 기다리고 안정성·호환성·성능·접근성의 차단 문제를 모두 0으로 만들어요. 자동 크롤러는 알람·재부팅·위젯을 완전히 검증하지 못하므로 실기기 증거를 대체하지 않아요. [사전 출시 보고서 공식 안내](https://support.google.com/googleplay/android-developer/answer/9842757?hl=ko)

Play Console에서 다음을 완료해요.

- 데이터 보안, 개인정보 처리방침, 콘텐츠 등급, 대상 연령, 앱 액세스
- 건강 앱 선언과 `Sleep Management` 분류 결정
- `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 사용 설명
- 포그라운드 서비스 유형별 사용자 시작 과정과 기능을 보여주는 공개 접근 가능한 영상 링크
- 정확한 알람·잠금 화면 전체 화면 알람·알람음 재생을 실제 기기에서 연속으로 보여주는 검토 영상

FGS 유형은 기능 설명, 지연·중단 영향, 기능 실행 과정을 보여주는 영상 링크가 필요해요. [FGS·전체 화면 Intent 선언 안내](https://support.google.com/googleplay/android-developer/answer/13392821?hl=ko) 정확한 알람은 사용자 의도에 따른 핵심 알람 기능에만 사용하고 거부·불가 상태도 검사해요. [정확한 알람 공식 안내](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms?hl=ko)

## 8. 비공개 테스트와 production 승인을 분리해요

개인 계정 테스트 요건이 적용되면 12명 이상이 14일 연속 opt-in 상태를 유지한 비공개 테스트를 완료하고 production 권한을 신청해요. 단순히 이메일 목록에 추가하거나 내부 테스트를 실행한 기간은 이 요건으로 간주하지 않아요.

production 승인 조건은 다음과 같아요.

- 자동 검사와 Play 출고 증거 게이트 통과
- 서명 연속성과 versionCode 계보 확인
- 건강 분류·계정 유형·권한·데이터 보안·스토어 등록 정보 확정
- Samsung 실기기와 16KB 환경에서 Play 생성 APK 검사 통과
- 사전 출시 보고서의 차단 문제 0건
- 적용되는 비공개 테스트 요건 완료

첫 production 출시는 단계적 비율 배포를 사용할 수 없으므로 비공개 테스트에서 충분히 검증한 뒤 시작해요. 이후 업데이트는 낮은 비율의 단계적 출시로 시작해 Android vitals와 사용자 신고를 확인한 다음 수동으로 확대해요. [단계적 출시 공식 안내](https://support.google.com/googleplay/android-developer/answer/6346149?hl=ko)

## 9. 운영 중단 기준을 미리 정해요

다음 중 하나라도 발생하면 확대를 멈추고 해당 출시를 중단해요.

- 설치·실행 실패, 서명 불일치, direct APK에서 업데이트 실패 또는 데이터·권한 손실
- 근무 알람 미전달, 중복 알람, 재부팅·시간대 변경 복구 실패, 전체 화면·알람음·위젯 회귀
- 새 보안·개인정보·정책 위반 또는 Play 정책 거부
- 새 crash·ANR 군집, 급격한 증가, Android vitals의 bad behavior 기준 초과
- 고객 지원으로 확인된 반복적인 일정·백업 손상

Play는 단계적 출시뿐 아니라 완전 출시된 버전도 중단할 수 있어요. 중단하면 이미 받은 사용자는 해당 버전에 남을 수 있으므로, 원인 수정과 더 높은 versionCode의 새 빌드를 함께 준비해요. [완전 출시 중단 안내](https://support.google.com/googleplay/android-developer/answer/16285429?hl=ko) [Android vitals 공식 안내](https://support.google.com/googleplay/android-developer/answer/9844486?hl=ko)

출시 직후 24시간과 72시간에 Play 정책 상태, 설치 실패, crash·ANR, 권한 거부, 사용자 문의를 확인해 기록해요. 알람 앱의 핵심 기능 회귀는 통계 표본이 적어도 즉시 중단 사유로 취급해요.
