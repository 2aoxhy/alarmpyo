# Google Play 릴리스 절차

이 문서는 알람표의 Play 내부 테스트부터 production 출고까지 적용하는 차단 게이트예요. 실제 업로드·트랙 배포·production 출시는 사용자가 명시적으로 요청한 경우에만 실행해요. Play 배포본은 직접 APK 설치 화면·JavaScript 코드·네이티브 설치 API·Provider·`REQUEST_INSTALL_PACKAGES`를 빌드 시점에 제외하고, 직접 배포 APK는 기존 업데이트 기능을 유지해요.

현재 AlarmPyo 계보는 `app.json`의 공식 Expo 프로젝트와 direct APK 인증서에 연결됐어요. direct 공개 정책은 production Hosting URL만 남아 `releaseState: blocked`예요. Play 정책은 이 direct Hosting 상태와 독립적이며, Google 관리 별도 App Signing 인증서를 Play Console에서 확인했어요. 각 배포 명령은 해당 정책이 활성화되기 전에는 실행하지 않아요.

## 0. 출시 전에 정책 결정을 끝내요

앱 항목을 만든 현재 단계에서는 AAB 없이도 다음 로컬 준비를 끝낼 수 있어요.

- 패키지 이름이 `com.personal.alarmpyo`인지 확인하고 다른 앱으로 새로 만들지 않아요.
- `docs/google-play-listing-ko.md`의 이름·짧은 설명·전체 설명을 Console 초안으로 저장해요.
- `assets/play-store` 아이콘·대표 그래픽을 확인하고, 최종 Play 설치본의 휴대전화 스크린샷은 아직 임시 자산으로 만들지 않아요.
- `play-release-policy.json`에 기록한 공개 GitHub Pages 주소가 로컬 `public/privacy-policy.html`과 같은 내용인지 출시마다 해시까지 다시 확인해요. 개인정보처리방침 Pages와 direct APK용 production Hosting은 별개예요.
- 광고 없음, 계정 없음, 제한 없이 접근 가능한 앱이라는 답변을 초안으로 저장하되 최종 Play 산출물에서 다시 확인해요.

다음 항목은 코드를 빌드하기 전에 Play Console과 계정 상태에서 확인해 기록해요.

- 수면 안내를 유지하는 현재 기능은 수면을 측정·추적하지 않고 근무 일정에서 준비 시점만 계산하지만, 스토어에서 수면 안내 기능으로 표시해요. 모든 앱은 건강 앱 선언을 완료해야 하며, Play 지원 답변이 달리 확인되지 않는 한 `Sleep Management`만 보수적으로 신고해요. Health Connect·수면 추적·의료·연구 기능은 선택하지 않아요. [건강 앱 선언 공식 안내](https://support.google.com/googleplay/android-developer/answer/14738291?hl=ko)
- 2026년 9월 30일부터 적용되는 Play Console 요구사항은 건강 앱 제공자를 조직 계정 등록 대상으로 명시해요. 다만 문구는 “Play Console 계정을 만들 때”의 등록 유형을 중심으로 써 있어요. 이미 만든 개인 계정의 전환 여부는 Console에 표시된 요구와 Play 지원 답변으로 확인하고, 필요하면 D-U-N-S와 조직 확인을 준비해요. 분류와 계정 적격이 미확정인 상태에서는 production을 시작하지 않아요. [Play Console 요구사항](https://support.google.com/googleplay/android-developer/answer/10788890?hl=ko)
- 2023년 11월 13일 이후 만든 개인 개발자 계정이면 production 권한 신청 전에 최소 12명이 14일 연속 참여한 비공개 테스트가 필요해요. 계정 생성일과 적용 여부를 확인하고, 해당하면 내부 테스트만으로 대체하지 않아요. [개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ko)
- 2026년 8월 31일부터 신규 앱과 앱 업데이트는 Android 16(API 36) 이상을 타깃해야 해요. 알람표의 `play-release-policy.json` 타깃은 이미 36으로 고정되어 있어요. [Target API 정책](https://support.google.com/googleplay/android-developer/answer/11926878?hl=ko)

## 1. 앱 서명과 versionCode 계보를 먼저 고정해요

AlarmPyo는 `com.personal.alarmpyo`라는 새 package 계보로 시작해요. `1.0.0(1)`은 비공개 internal canary로만 사용했고, 첫 공개·Play 후보는 `1.0.1`, Android `versionCode`는 `2`, iOS build는 `2`예요. 이전 앱의 인증서나 versionCode를 이어받지 않아요.

1. internal canary에서 만든 새 AlarmPyo direct 앱 서명 키와 `release-policy.json`의 인증서 SHA-256을 direct 계보로 유지해요.
2. Play App Signing은 direct와 같은 앱 서명 키를 사용할지 Google Play가 관리하는 별도 최종 인증서를 사용할지 먼저 결정해요. same-signer는 `appSigningStrategy: direct-compatible`, 별도 signer는 `appSigningStrategy: google-play-managed-separate`로 기록해요.
3. 업로드 키는 앱 서명 키와 구분해요. Google도 두 키를 다르게 유지하는 것을 권장하며, AAB 업로드 인증서 SHA-256을 사용자에게 전달되는 APK의 앱 서명 인증서로 잘못 기록하지 않아요.
4. Play Console의 앱 무결성 화면에서 최종 앱 서명 인증서 SHA-256을 확인해 `play-release-policy.json`의 `appSigningCertificateSha256`에 기록하고 해당 blocker를 제거해요. 현재 정책의 단일 값은 Android 12~16 Play 설치본에 사용되는 클래식 앱 서명 인증서를 뜻해요. Console에 Android 17 이상용 양자 내성 서명 인증서가 함께 보이면 그 값을 대신 넣지 말고, Android 17 검증을 도입할 때 정책·증거 형식을 별도로 확장해요. 내부 트랙 설치본에서도 기록한 값과 실제 인증서가 같은지 확인해요.

이 결정은 완료됐어요. Play Console의 App Signing 화면과 Digital Asset Links에서 Google 관리 별도 signer를 확인해 `play-release-policy.json`의 단일 기준값으로 기록했어요. direct 지문과 다르므로 `directUpgradeCompatible: false`이며, direct판 사용자는 외부 백업 후 기존 앱 제거·Play판 설치·복원 절차가 필요해요. 내부 트랙 설치본에서도 인증서를 다시 대조해야 해요.

Google은 여러 스토어에서 같은 키를 유지하려면 자체 키를 Play에 제공하거나 Play 서명 APK를 외부 배포에 사용하도록 안내해요. [Play App Signing 공식 안내](https://support.google.com/googleplay/android-developer/answer/9842756?hl=ko)

same-signer를 확정하면 direct→Play 제자리 업데이트와 자료·권한 보존 검사를 모두 통과해야 해요. 별도 signer를 확정하면 교차 업데이트는 불가능하므로, 배포판을 바꿀 때 외부 전체 백업 후 제거·새 설치·복원을 안내하고 교차 업데이트 검사를 성공 조건으로 기록하지 않아요.

현재 계보는 `google-play-managed-separate`를 선택했어요. Play에 새로 등록하는 앱이고 외부 공개 이력이 없는 `1.0.0(1)` direct 설치본은 내부 canary에만 사용했으므로, Google이 관리하는 별도 앱 서명 키를 쓰고 direct 개인키를 Play에 제공하지 않아요. 따라서 기존 direct 설치본을 제거하지 않고 Play판으로 업데이트할 수 없으며, 필요한 사용자는 외부 백업 후 기존 앱 제거·Play판 설치·복원 절차를 따라야 해요.

첫 Play 후보를 올리기 전에는 다음 두 값을 실제 배포 기록과 Play Console에서 확인해요.

- 웹 원장뿐 아니라 메신저·파일 공유·테스터 전달까지 포함한 **실제 유통 direct APK 최고 versionCode**
- 후보를 올리기 전에 Play Console의 모든 트랙·초안·과거 업로드에서 확인한 **기존 최고 versionCode**

2026-08-15 Play Console에서 확인한 활성 Alpha 최고값은 V05 `versionCode: 6`이며, 현재 V07 후보는 `versionCode: 7`이에요. 예제의 `highestPreviouslyDistributedVersionCode`와 `highestExistingPlayVersionCode`는 모두 `6`으로 기록해요. 후보 업로드 직전에 두 값을 다시 확인하고 `.release/play/release-evidence.json`에 실제 값만 기록해요. 둘 중 하나라도 `7` 이상이면 업로드를 중단하고 실제 최고값보다 큰 versionCode로 설정·문서·증거를 함께 갱신해요.

## 1-1. 별도 Play App Signing 인증서를 처음 확인해요

이 절차는 Google 관리 별도 App Signing signer를 선택했지만 인증서가 첫 AAB 이전에 보이지 않을 때만 쓰는 복구용 참고예요. 현재는 2026-08-12에 인증서가 확인되어 정책에 기록됐으므로 실행하면 안 돼요. 다른 새 계보에서 이 경로가 필요한 경우에만 먼저 사용자 승인으로 `appSigningStrategy`를 `google-play-managed-separate`로 기록하되 `appSigningCertificateSha256: null`과 해당 blocker를 유지하고, direct 인증서가 이미 확정된 깨끗한 커밋에서 1회성 opt-in을 사용해요.

```powershell
$env:ALARMPYO_ALLOW_PLAY_SIGNING_BOOTSTRAP = '1'
npm run release:preflight:play-signing-bootstrap
npm run build:aab:play-signing-bootstrap
Remove-Item Env:ALARMPYO_ALLOW_PLAY_SIGNING_BOOTSTRAP
```

전용 EAS 프로필은 `preview` 환경의 Play 형식 AAB만 만들어요. 저장소의 이 단계는 AAB 생성에서 끝나며 `submit:internal`, production 제출, 트랙 공개를 호출하지 않아요. AAB 검증 결과도 `releasePurpose: play-signing-bootstrap`, `submissionEligible: false`로 `.release/play-signing-bootstrap`에 분리해요.

```powershell
npm run release:verify:aab:play-signing-bootstrap -- `
  --aab .release/AlarmPyo-signing-bootstrap.aab `
  --eas-build .release/eas-build-play-signing-bootstrap.json
```

이 AAB를 Play Console의 App Signing 등록에 사용할지는 별도의 명시적 승인과 수동 검토가 필요해요. Console에서 Google 관리 별도 인증서를 확인한 다음 다음 순서로 일반 계보로 돌아가요.

1. 별도 signer 결정에 맞게 최종 앱 서명 인증서 SHA-256이 direct 지문과 다른지 확인해요. 같다면 값을 기록하지 말고 signer 전략을 다시 결정해요.
2. 실제 소문자 SHA-256을 `play-release-policy.json`의 `appSigningCertificateSha256`에 기록하고 `appSigningCertificateSha256` blocker를 제거해요.
3. 실제 개인정보처리방침 주소가 아직 미정이면 `releaseState: blocked`, `privacyPolicyUrl: null`과 해당 blocker는 그대로 유지해요. direct 정책의 `productionHostingUrl` 상태를 Play 정책에 복사하지 않아요.
4. 부트스트랩 opt-in을 제거해요. 인증서가 기록된 정책에서는 부트스트랩 명령이 다시 성공하면 안 돼요.
5. 모든 blocker가 해소된 새 깨끗한 커밋에서 `release:preflight:play`와 일반 `release:verify:aab`를 처음부터 다시 실행해요. 부트스트랩 출처 파일을 제출 증거로 재사용하지 않아요.

## 2. 사전 검증과 AAB를 만들어요

깨끗한 원본 Git 저장소와 릴리스 커밋에서 실행해요.

```powershell
npm ci
npm run release:preflight:play
npm run build:aab
```

`build:aab`는 기본 릴리스 검사, Play 전용 설정 검사, Play JavaScript 번들 분리 검사를 통과한 뒤 EAS `production` 프로필로 AAB를 만들어요. 이 소스 아카이브처럼 `.git`이 빠진 복사본에서는 빌드·출처 증명을 진행하지 않아요.

Play 사전 검증은 Node.js `24.16.0`·npm `11.13.0`의 실제 실행 버전, 깨끗한 소스, 앱 검사, 의존성·도구 감사, Expo Doctor, OTA 런타임 설정, Android 네이티브 테스트를 유지해요. direct APK용 `productionHostingUrl`, `public/downloads` 보존 감사와 `public/updates/latest-android.json` manifest 검사는 Play AAB의 선결 조건에서 분리해요. direct 공개 산출물 상태가 Play 빌드를 막거나, 반대로 Play 검사 통과가 direct APK 공개 검증을 대신하지 않도록 두 흐름을 구분해요.

활성 Play 정책에서는 `npm run release:verify:play-privacy-url`이 게시 주소를 읽기 전용으로 확인해요. GitHub Pages의 `/privacy-policy.html` HTTPS 최종 URL, 같은 호스트 안의 제한된 리디렉션, 2xx, UTF-8 `text/html`, 512KB 이하 본문을 요구하며 게시본의 SHA-256이 현재 `public/privacy-policy.html`과 정확히 같아야 해요. 명백한 로그인·편집 화면과 15초 안에 끝나지 않는 요청도 거부해요. 자동 검사는 로그인하지 않은 시크릿 창의 지역 제한·가독성 확인을 대신하지 않아요.

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

- 설치 출처가 `com.android.vending`이고 앱 서명 SHA-256이 `play-release-policy.json`에 별도로 확정한 Play App Signing 인증서와 같아요.
- 첫 출시는 새 설치·초기 설정을 확인하고, 후속 출시는 기존 AlarmPyo 위에 설치해 근무표·메모·설정·권한이 유지되는지 확인해요.
- 앱 종료, 재부팅, 날짜·시간·시간대 변경 뒤 근무 알람과 30분·60분 타이머 예약 복구가 동작해요.
- 근무·시험·타이머 알람이 소리와 진동으로 한 번만 울리고 끄기·5분 재알림이 정확히 동작해요.
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

검증기는 AAB SHA-256, EAS 빌드 ID, Git 커밋, versionCode 계보, Play 정책 인증서, Samsung·16KB 원본 증거 해시, 사전 출시 보고서를 대조해요. direct 인증서 지문을 Play 설치본에 자동 적용하지 않아요. 통과 결과는 `.release/play/verified-release-evidence.json`에 생성되며 14일 동안만 유효해요. 이 파일이 없거나 오래됐으면 production으로 진행하지 않아요.

## 7. 사전 출시 보고서와 정책 선언을 끝내요

Play 사전 출시 보고서가 완료될 때까지 기다리고 안정성·호환성·성능·접근성의 차단 문제를 모두 0으로 만들어요. 자동 크롤러는 알람·재부팅·위젯을 완전히 검증하지 못하므로 실기기 증거를 대체하지 않아요. [사전 출시 보고서 공식 안내](https://support.google.com/googleplay/android-developer/answer/9842757?hl=ko)

Play Console에서 다음을 완료해요.

- 데이터 보안, 개인정보 처리방침, 콘텐츠 등급, 대상 연령, 앱 액세스
- 건강 앱 선언과 `Sleep Management` 분류 결정
- `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 사용 설명
- 포그라운드 서비스 유형별 사용자 시작 과정과 기능을 보여주는 공개 접근 가능한 영상 링크
- 정확한 알람·잠금 화면 전체 화면 알람·알람음 재생을 실제 기기에서 연속으로 보여주는 검토 영상

개인정보처리방침은 `docs/privacy-policy-github-pages-ko.md`에 따라 `public/privacy-policy.html`만 GitHub Pages에 수동 게시할 수 있어요. 로그인·지역 제한 없이 열리고, PDF가 아니며, 다른 사용자가 편집할 수 없는 정적 페이지인지 확인해요. 로컬 파일 경로나 임시 문서 공유 URL을 Console에 넣지 않아요. 확인한 쿼리·조각 없는 HTTPS 주소를 `play-release-policy.json`의 `privacyPolicyUrl`에 기록하고 해당 blocker를 제거해요. 이 값은 direct APK용 `productionHostingUrl`을 자동으로 충족하지 않아요.

현재 Play 구성도 EAS Update를 활성화하므로, 데이터 보안 양식에서 Expo의 무작위 설치 토큰을 “기기 또는 기타 ID” 수집 후보로 다루어요. `수집 안 함`을 초안으로 입력하지 않고, 최종 Play 설치본의 요청과 Expo의 현행 정책을 `docs/google-play-data-safety-ko.md`에 따라 다시 확인해요. 계정 삭제 요건이 해당하지 않는 것과, Expo가 처리한 기술 정보의 데이터 삭제 지원 문항은 다른 질문이에요.

FGS 유형은 기능 설명, 지연·중단 영향, 기능 실행 과정을 보여주는 영상 링크가 필요해요. [FGS·전체 화면 Intent 선언 안내](https://support.google.com/googleplay/android-developer/answer/13392821?hl=ko) 정확한 알람은 사용자 의도에 따른 핵심 알람 기능에만 사용하고 거부·불가 상태도 검사해요. [정확한 알람 공식 안내](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms?hl=ko)

## 8. 비공개 테스트와 production 승인을 분리해요

개인 계정 테스트 요건이 적용되면 12명 이상이 14일 연속 opt-in 상태를 유지한 비공개 테스트를 완료하고 production 권한을 신청해요. 단순히 이메일 목록에 추가하거나 내부 테스트를 실행한 기간은 이 요건으로 간주하지 않아요.

production 승인 조건은 다음과 같아요.

- 자동 검사와 Play 출고 증거 게이트 통과
- 서명 연속성과 versionCode 계보 확인
- 건강 분류·계정 유형·권한·데이터 보안·스토어 등록 정보 확정
- 실제 Play 후보에서 촬영한 등록 이미지 준비와 `npm run release:verify:play-store-assets` 통과
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
