# `.release` 비공개 릴리스 자료

`.release`는 Git과 정적 웹 배포에서 제외하는 로컬 전용 영역이에요. 이 폴더의 파일 자체는 운영 기록이 아니며, 검증을 통과한 요약만 `docs/release-ledger.json`에 남겨요.

| 경로                                     | 스키마                       | 역할                                                                          |
| ---------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `.release/eas-build.json`                | EAS `build:view --json` 원본 | 빌드 ID, 소스 커밋, APK 원본 주소를 증명해요.                                 |
| `.release/latest-android.json`           | `schemaVersion: 1`           | 공개 전 APK 후보 manifest예요. 후보 APK 바이트를 공개 폴더로 복사하지 않아요. |
| `.release/android-device-matrix.json`    | `schemaVersion: 3`           | 현재 Samsung 물리 기기와 API 31·33·34·35·36 에뮬레이터 결과를 묶어요.         |
| `.release/device-evidence/*.json`        | `schemaVersion: 1`           | `adb`로 수집한 기기 정보와 실제 검사 결과 원본이에요.                         |
| `.release/verified-device-matrix.json`   | `schemaVersion: 1`           | 원본 증거 파일의 SHA-256까지 검증한 파생 요약이에요. 직접 작성하지 않아요.    |
| `.release/latest-ota.json`               | `schemaVersion: 2`           | 후보 브랜치에서 운영 채널로 승격한 최신 OTA 결과예요.                         |
| `.release/public-candidate-quarantine/*` | 내부 트랜잭션                | 검증 중 공개 후보를 잠시 격리해야 할 때만 사용해요. 직접 사용하지 않아요.     |
| `.release/play/*.provenance.json`        | `schemaVersion: 1`           | EAS AAB의 SHA-256·소스·16KB 정렬 요청을 묶은 자동 검증 결과예요.              |
| `.release/play/release-evidence.json`    | `schemaVersion: 1`           | Play 생성 APK·서명·versionCode·실기기·사전 출시 보고서를 묶어요.              |
| `.release/play/device-evidence/*.json`   | `schemaVersion: 1`           | Play Samsung 설치본과 16KB split APK의 원본 기기 증거예요.                    |
| `.release/play/prelaunch-evidence/*.json`| `schemaVersion: 1`           | 같은 AAB에 대한 Play 사전 출시 보고서 요약 원본이에요.                        |
| `.release/play/verified-release-evidence.json` | `schemaVersion: 1`     | 원본 파일 SHA-256까지 확인한 Play production 게이트 결과예요.                 |

## 기기 원본 증거 형식

`docs/android-device-evidence.example.json`을 참고해요. `captureMethod`는 `adb`, `deviceType`은 `physical` 또는 `emulator`이고, `sdk`, `checkedAt`, `properties.buildFingerprint`가 매트릭스와 같아야 해요. 매트릭스에는 증거 파일의 상대 경로와 실제 SHA-256을 기록해요. 정식 형식은 `docs/android-device-matrix.schema.json`과 `docs/android-device-evidence.schema.json`에 있어요.

예제 파일은 검증 증거가 아니에요. 실제 Samsung 휴대폰을 검사하지 못했거나 API 31·33·34·35·36 AVD 중 하나라도 빠지면 `release:verify:device-matrix`와 APK 승격이 실패하는 것이 정상이에요.

## Play 원본 증거 형식

`docs/play-release-evidence.example.json`, `docs/play-physical-device-evidence.example.json`, `docs/play-16kb-device-evidence.example.json`, `docs/play-prelaunch-evidence.example.json`을 참고해요. 정식 형식은 `docs/play-release-evidence.schema.json`, `docs/play-device-evidence.schema.json`, `docs/play-prelaunch-evidence.schema.json`에 있어요.

Play 증거는 검증된 AAB 출처 기록의 SHA-256·EAS 빌드 ID·Git 커밋과 같아야 해요. Samsung 원본은 Play 내부 또는 비공개 트랙 설치본이어야 하고, 16KB 원본은 App Bundle Explorer가 생성한 split APK의 ZIP·ELF 정렬과 `PAGE_SIZE=16384` 런타임을 기록해요. 사전 출시 보고서의 안정성·호환성·성능·접근성 차단 문제도 모두 0이어야 해요.

```powershell
npm run release:verify:play-evidence -- `
  --provenance .release/play/AlarmPyo.aab.provenance.json `
  --evidence .release/play/release-evidence.json
```

예제의 `false` 값이나 임의 SHA-256은 실제 증거가 아니에요. 검증된 요약은 직접 편집하지 않고, 원본 증거가 바뀌면 SHA-256을 다시 계산해 게이트를 재실행해요.

## 공개 시점

`release:manifest`는 비공개 자료만 만들어요. `release:promote:android`가 모든 증거를 통과한 다음에만 APK를 예측 가능한 `public/downloads/v<versionCode>/...apk` 경로로 원자적으로 복사해요. 실패하면 새 APK, manifest와 원장을 한 트랜잭션으로 되돌려요. 빈 AlarmPyo 원장에 이전 앱의 APK나 versionCode를 추가하지 않아요.
