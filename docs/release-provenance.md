# Android 릴리스 출처 증명

알람표 릴리스는 로컬 APK, EAS 빌드, Git 소스, 실기기 검증 결과가 모두 같은 산출물을 가리킬 때만 배포해요. 사람이 버전 번호만 맞춰 적는 방식은 사용하지 않아요.

현재는 Expo 프로젝트 연결을 마쳤지만 production Hosting URL과 앱 서명 인증서가 미정이라 stable 빌드와 모든 공개 릴리스 작업이 차단돼요. 남은 실제 값을 발급받아 `release-policy.json`을 활성화하기 전에는 아래 절차를 실행하지 않아요. 첫 릴리스 기준은 `1.0.0(1)`이에요.

공개하지 않는 첫 설치·네이티브 QA용 APK만 [`internal-canary-apk-ko.md`](internal-canary-apk-ko.md)의 별도 경로로 만들 수 있어요. 내부 canary는 아래 stable 출처 증명이나 공개 승격을 대체하지 않아요.

## 1. EAS 빌드 증거를 저장해요

stable APK 빌드가 완료되면 해당 빌드의 `build:view --json` 결과를 UTF-8 형식으로 `.release/eas-build.json`에 저장해요.

```powershell
$buildId = '<완료된 EAS 빌드 ID>'
New-Item -ItemType Directory -Force .release | Out-Null
$metadata = node scripts/run-eas-cli.mjs build:view $buildId --json
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) '.release/eas-build.json'),
  ($metadata -join [Environment]::NewLine),
  [System.Text.UTF8Encoding]::new($false)
)
```

증거에는 다음 값이 들어 있어야 해요.

- 상태는 `FINISHED`, 플랫폼은 `ANDROID`, 빌드 프로필은 `stable`이어야 해요.
- `id`는 EAS 빌드 ID이고 `gitCommitHash`는 40자리 Git 커밋이어야 해요.
- `artifacts.buildUrl`은 EAS가 생성한 HTTPS APK 주소여야 해요.
- `appVersion`, `appBuildVersion`, `project.id`는 현재 `app.json`과 같아야 해요.
- `completedAt` 또는 `updatedAt`에 정상적인 완료 시각이 있어야 해요.

빌드 증거 파일은 직접 수정하지 않아요. 다른 빌드의 JSON을 재사용하면 출처 검증에서 중단돼요.

## 2. staged manifest를 만들어요

로컬에 받은 EAS APK와 장기 보관용 HTTPS 주소를 지정한 뒤 manifest를 만들어요.

```powershell
$env:ALARMPYO_APK_PATH = '<다운로드한 EAS APK 경로>'
$env:ALARMPYO_APK_URL = '<장기 보관용 HTTPS APK 주소>'
$env:ALARMPYO_APK_MIRRORS = '<EAS 임시 산출물이 아닌 장기 보관용 HTTPS 미러 주소>'
$env:ALARMPYO_EAS_BUILD_METADATA_PATH = '.release/eas-build.json'
npm run release:manifest
```

이 단계는 `.release/latest-android.json`만 만들어요. 후보 APK는 `ALARMPYO_APK_PATH`의 비공개 위치에 그대로 두며 `public/downloads`로 복사하지 않아요. 따라서 일반 웹 배포나 예측 가능한 URL로 검증 전 APK가 노출되지 않아요. 기본 주소와 다르고 EAS 임시 산출물이 아닌 장기 보관용 HTTPS 미러가 한 개 이상 없으면 후보 생성부터 중단돼요.

`.release/latest-android.json`에는 다음 출처 필드가 자동으로 기록돼요.

| 필드                       | 의미                                                      |
| -------------------------- | --------------------------------------------------------- |
| `sourceCommit`             | EAS가 실제로 빌드한 40자리 Git 커밋이에요.                |
| `easBuildId`               | EAS `build:view`에서 확인한 빌드 ID예요.                  |
| `easBuildFinishedAt`       | EAS 빌드가 완료된 시각이에요.                             |
| `nativeFingerprint`        | Android 네이티브 입력 전체를 SHA-256으로 묶은 지문이에요. |
| `provenanceArtifactUrl`    | 해당 EAS 빌드가 만든 원본 APK 주소예요.                   |
| `provenanceArtifactSha256` | 원본 APK 주소에서 다시 받은 파일의 SHA-256이에요.         |
| `provenanceVerifiedAt`     | 원본 APK와 로컬 APK가 같다고 확인한 시각이에요.           |

`sha256`과 `provenanceArtifactSha256`이 같아야 해요. `sourceCommit`과 `easBuildId`는 EAS 증거와 같아야 하고, EAS 원본 APK도 로컬 APK와 바이트 단위로 같아야 해요. 이 값은 수동으로 덮어쓰지 않아요.

## 3. Samsung 실기기와 Android 12~16 에뮬레이터 검증을 기록해요

`docs/android-device-matrix.example.json`을 `.release/android-device-matrix.json`으로 복사해요. 최상위 바인딩 값은 `.release/latest-android.json`에서 그대로 옮겨요.

| 실기기 매트릭스     | staged manifest     |
| ------------------- | ------------------- |
| `packageName`       | `packageName`       |
| `versionName`       | `versionName`       |
| `versionCode`       | `versionCode`       |
| `apkSha256`         | `sha256`            |
| `sourceCommit`      | `sourceCommit`      |
| `easBuildId`        | `easBuildId`        |
| `nativeFingerprint` | `nativeFingerprint` |

현재 실제로 사용하는 Samsung 휴대폰 한 대는 `deviceType: "physical"`, `currentSamsungDevice: true`로 기록해요. 이 기록은 에뮬레이터 결과로 대체할 수 없어요. Android 12, 13, 14, 15, 16은 API 31·33·34·35·36 AVD에서 각각 검사하고 `deviceType: "emulator"`로 명확히 구분해요.

각 기기는 `.release/device-evidence/*.json` 원본 증거와 연결해요. 증거 파일은 `adb`로 수집한 SDK, 빌드 fingerprint, 검사 시각과 결과를 담고, 매트릭스의 `evidence.sha256`에는 해당 파일의 실제 SHA-256을 기록해요. 검증기는 파일 존재 여부, 심볼릭 링크 여부, SHA-256, 기기 유형, SDK, fingerprint를 모두 대조해요. 실제 확인 없이 예제의 값을 `true`로 바꾸면 안 돼요.

Samsung 실기기에서 다음 항목을 직접 확인한 뒤 해당 값만 `true`로 바꿔요.

- `upgradePreservedData`: 기존 앱 위에 설치한 뒤 근무표와 설정이 유지됐어요.
- `permissionsPreserved`: 업데이트 뒤 허용했던 권한이 유지됐어요.
- `alarmWhileClosed`: 앱을 닫아도 예약 알람이 울렸어요.
- `alarmAfterReboot`: 휴대폰을 재부팅한 뒤에도 알람이 다시 예약됐어요.
- `blockedNotificationState`: 알림 권한을 차단한 상태가 앱에 정확히 표시됐어요.
- `fullScreenAlarm`: 전체 화면 알람이 정상적으로 열렸어요.
- `widgetAvailable`: 홈 화면에서 위젯을 추가하고 내용을 확인했어요.

각 에뮬레이터에서는 `installAndLaunch`, `dataMigration`, 앱 종료·재부팅 뒤 알람, 알림 차단 상태, 전체 화면 알람, 위젯 제공자를 확인해요. API 36까지 모두 있어야 승격할 수 있어요.

기기별 `checkedAt`은 `easBuildFinishedAt` 이후여야 하고, 최상위 `checkedAt`보다 늦을 수 없어요. 최상위 `checkedAt`은 마지막 기기 검증이 끝난 시각으로 기록해요. 검증 기록은 14일 동안만 유효해요.

```powershell
npm run release:verify:device-matrix
```

검증기는 `schemaVersion: 3`, Samsung 물리 기기 한 대, API 31·33·34·35·36 에뮬레이터 다섯 대, 원본 증거 해시, APK SHA-256, Git 커밋, EAS 빌드 ID, 네이티브 지문, 검증 시각을 staged manifest와 비교해요. 증거가 없거나 일부만 있으면 승격을 차단해요.

## 4. 승격 전에 한 번에 확인해요

```powershell
npm run release:promote:android
```

승격 과정은 출처 증명이 있는 비공개 후보를 먼저 확인하고, 그 후보에 묶인 Samsung 실기기와 Android 12~16 에뮬레이터 결과를 확인한 뒤에만 APK를 `public/downloads`로 원자적으로 복사해요. 어느 한 값이라도 다르면 공개 경로는 바뀌지 않아요.

첫 `1.0.0(1)` 승격에서는 AlarmPyo 원장과 공개 manifest가 모두 비어 있어야 해요. 승격 과정은 검증된 첫 APK만 공개하고 새 원장 항목을 추가해요. 이전 앱의 공개 폴더·versionCode·서명 인증서를 자동으로 가져오거나 정리하지 않아요.

후속 승격에서는 운영 manifest보다 높은 미승격 versionCode 폴더가 `public/downloads`에 남아 있으면 일반 웹 배포를 차단해요. 검증 없이 노출된 후보는 자동으로 계보에 편입하지 않고 별도로 검토해요.

`docs/release-ledger.json`은 Git에 커밋하는 지속 가능한 APK·OTA 원장이에요. 승격 전에는 현재 운영 manifest가 원장의 마지막 운영 기록과 일치해야 해요. 승격 중에는 APK 출처, Samsung 물리 증거 해시, API 31·33·34·35·36 에뮬레이터 증거 해시와 전체 매트릭스 결합 해시를 새 기록으로 추가하고, 배포 실패 시 원장도 이전 상태로 복구해요. 검증 완료 기록의 출처나 증거 해시 한 항목만 바뀌어도 결합 검증에서 거부해요. 장기 보관 미러는 URL 등록만 확인하지 않고 실제 접근, 파일 크기, SHA-256까지 확인해요. 형식은 `docs/release-ledger.schema.json`에서 확인해요.

## 5. OTA 업데이트의 네이티브 호환성을 확인해요

OTA 업데이트 전에는 현재 소스의 `nativeFingerprint`와 공개 APK manifest의 `nativeFingerprint`를 비교해요. 두 값이 같을 때만 같은 앱 버전에 OTA 업데이트를 게시할 수 있어요.

네이티브 모듈, Android 설정, 권한, 플러그인처럼 APK 재빌드가 필요한 입력이 바뀌면 지문도 달라져요. 이때는 기존 버전으로 OTA를 게시하지 않고 `versionCode`를 올린 새 APK를 빌드하고 배포해요.

OTA는 stable 또는 canary 채널에 직접 게시하지 않아요. 고유한 `release-candidate-*` 브랜치에 먼저 게시하고 런타임·소스·기준 APK를 검증한 뒤 채널을 후보 브랜치로 한 번에 전환해요. 전환 확인이나 원장 저장이 실패하면 채널을 직전 브랜치로 되돌려요.

게시가 끝나면 `.release/latest-ota.json`에 후보 브랜치, 직전 브랜치, OTA 그룹, 업데이트 ID, 기준 APK의 `sha256`, `sourceCommit`, `easBuildId`, `nativeFingerprint`를 함께 기록해요. 같은 승격 기록은 `docs/release-ledger.json`에도 남기며, OTA의 `baseApkSha256`과 버전이 검증된 APK 원장 항목과 정확히 일치할 때만 채널을 전환해요.

## 실패했을 때 확인해요

- EAS 빌드 ID가 다르면 올바른 빌드의 `build:view --json`을 다시 저장해요.
- APK SHA-256이 다르면 다른 경로에서 받은 APK를 섞지 않았는지 확인해요.
- 소스 커밋이 다르면 빌드 이후 소스 변경을 새 빌드로 반영해요.
- 실기기 검증 시각이 빌드보다 빠르거나 14일이 지났다면 같은 APK로 다시 검증해요.
- 네이티브 지문이 다르면 OTA 대신 새 앱 버전과 새 APK로 배포해요.
