# V1.24 의존성 보안 보완 — 2026-09-13

## 범위와 현재 상태

사용자가 승인한 보안 의존성 대체와 Expo SDK 패치 보완 기록이다. SDK·Metro 1차 검증 이력과 최종 설치 구성을 구분한다. 최종 구성의 전체 코드 검사는 통과했으며, 실기기·전체 릴리스 preflight·배포는 완료하지 않았다.

- 완료: Expo SDK 57 패치 15종, 공식 Metro 0.84.5 정렬, `image-size` 제거, 공식 URI 디코더 0.5.0 호환 연결, Vitest 4.1.11.
- 최종 코드 검사: 236개 파일·1,836개 테스트, TypeScript·ESLint·문구·패턴 검사 통과. Expo Doctor 20/20, 최종 Android Play JS export 통과. npm 감사 모든 등급 0건.
- 네이티브: SDK·Metro 구성의 Play 214개 통과, 최종 URI·Vitest 구성을 포함한 direct 215개 통과. Play의 초기 lock과 최종 direct lock은 아래에서 구분한다.
- 미실시: 새 의존성 구성의 실기기 검증, EAS production 빌드, AAB 생성, 업로드, Internal 출시, Alpha 승격. Production도 변경하지 않았다.

## 적용 완료

### Expo SDK 57 유지보수 패치

SDK·React Native의 주요 버전은 유지하고 다음 선언을 SDK 권장 패치 범위로 갱신했다.

| 패키지 | 이전 | 변경 |
| --- | --- | --- |
| `@expo/ui` | `~57.0.16` | `~57.0.18` |
| `expo` | `~57.0.20` | `~57.0.22` |
| `expo-constants` | `~57.0.17` | `~57.0.18` |
| `expo-crypto` | `~57.0.2` | `~57.0.3` |
| `expo-document-picker` | `~57.0.1` | `~57.0.2` |
| `expo-file-system` | `~57.0.6` | `~57.0.7` |
| `expo-font` | `~57.0.3` | `~57.0.4` |
| `expo-haptics` | `~57.0.2` | `~57.0.3` |
| `expo-linking` | `~57.0.9` | `~57.0.10` |
| `expo-router` | `~57.0.19` | `~57.0.21` |
| `expo-sharing` | `~57.0.18` | `~57.0.19` |
| `expo-splash-screen` | `~57.0.8` | `~57.0.9` |
| `expo-system-ui` | `~57.0.3` | `~57.0.4` |
| `expo-updates` | `~57.0.21` | `~57.0.22` |
| `@expo/fingerprint` | `~0.20.12` | `~0.20.13` |

### Metro의 공식 이미지 파서로 대체

`metro`, `metro-config`, `metro-core`, `metro-resolver`, `metro-runtime` 5개 override를 `0.84.5`로 맞췄다. 설치된 Metro 계열 14개 패키지가 Expo의 Metro 요구 버전과 같은 `0.84.5`로 정렬되었고, lockfile과 설치 트리의 `image-size`는 0개로 확인했다. React Native CLI·Worklets·Expo에서 해석하는 Metro 경로도 회귀 검사에 포함했다.

이는 취약한 패키지의 이름만 바꾼 로컬 포크가 아니다. [Metro 0.84.5 공식 릴리스](https://github.com/react/metro/releases/tag/v0.84.5)와 [공식 변경 #1860](https://github.com/react/metro/pull/1860)이 `image-size` 의존성을 제거하고 Metro에 필요한 이미지 크기 파서를 제공한다. [해당 태그의 구현](https://github.com/react/metro/blob/v0.84.5/packages/metro/src/lib/imageSize.js)은 원래 코드의 MIT 라이선스 고지를 유지한다.

- Metro가 사용하는 PNG·JPEG·BMP·GIF·WebP·PSD·SVG·TIFF·KTX 경로를 지원한다. 취약 권고와 관련된 ICNS·JXL·HEIF 파서는 포함하지 않는다.
- JPEG·WebP·TIFF의 길이·오프셋 검사와 SVG 헤더 64KiB 제한을 확인했다. 잘못된 입력은 제한 시간 안에 거부하는지 별도 검사했다.
- 파일 확장자가 달라도 내용으로 식별 가능한 지원 이미지는 허용하는 공식 동작을 유지한다. 확장자 불일치 전체를 거부한다고 기록하지 않는다.
- 이 검증은 크기 조회 계약과 제한된 잘못된 입력의 회귀 검사다. 전체 이미지 디코딩·CRC 검증이나 모든 입력에 대한 보안 증명은 아니다.

기존 `dependency-security-policy.json`, 보안 예외 기록과 감사 검증기는 변경하지 않았다. 2026-09-09에 만료된 예외를 연장하거나 감사 결과를 숨겨 통과시키지 않았다. 앞선 js-yaml·xmldom·sharp 공식 패치도 유지한다.

## SDK·Metro 1차 검사 이력

Node 24.16.0 / npm 11.13.0을 사용한 SDK·Metro 1차 검증 결과다. 후속 URI·Vitest 변경의 결과로 재사용하지 않는다.

| 검사 | 결과와 한계 |
| --- | --- |
| Metro 이미지 보안 회귀 | `scripts/__tests__/metro-image-security.test.mjs` 29개 통과. 해당 파일 ESLint 오류 0개 |
| 실제 앱 PNG | 13개 파일의 크기를 Sharp와 Metro 결과로 대조해 일치 |
| 잘못된 이미지 입력 | ICNS·JXL·HEIF·JPEG·WebP·TIFF·SVG·PNG 12개 케이스 거부. 각 child process는 stdin 입력, 2초 제한, 출력 크기 제한을 사용하며 임시 파일을 생성하지 않음 |
| 의존성 정렬 | `image-size` 부재, Metro 공식 registry 출처·integrity·설치 버전 및 주요 소비 경로 확인 |
| Expo Doctor | 20/20 통과. 기존 SDK 패치 불일치 검사 해소 |
| Play JS export | 통과. Android 네이티브 컴파일·실기기 동작 완료를 뜻하지 않음 |
| 전체 테스트 | 235개 스위트 실행에서 1,798개 테스트 통과, 브랜드 검사 1건 timeout. 전체 통과가 아니며 병렬 작업 종료 후 재검사 필요 |
| npm 감사 중간 결과 | SDK·Metro 보완 후 high 0, moderate 5 확인. 후속 변경 설치 후 최종 감사를 다시 해야 함 |

Metro 단독 회귀 명령은 고정 Node로 `node_modules/vitest/vitest.mjs run scripts/__tests__/metro-image-security.test.mjs --maxWorkers=1`이다. 앞선 전체 테스트 성공 기록은 이전 의존성 구성의 결과로 보존하며 현재 구성의 성공 근거로 대체하지 않는다.

## URI·테스트 도구 후속 보완

- [URI 권고 GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)의 공식 수정판 `decode-uri-component@0.5.0`을 사용한다. `query-string@7.1.3`의 CommonJS 함수 호출을 유지하기 위해 `tooling/uri-decoder-compat/index.cjs`에서 공식 ESM default 함수를 그대로 연결한다. 디코더 구현을 복사하거나 취약 코드의 이름만 바꾸지 않았다.
- root production 의존성에 로컬 어댑터와 공식 `decode-uri-component-patched` alias를 선언하고, `query-string@7.1.3` 하위 decoder는 `$decode-uri-component`로 root 선언을 참조한다. 공식 tarball URL·SHA-512 integrity를 lock에 유지한다.
- 최초 상대 `file:` override는 npm이 `query-string/tooling/...`으로 해석해 존재하지 않는 링크를 만들었다. 새 작은 프로젝트에서는 root 의존성 참조로 정상 설치됨을 확인한 뒤, 이전 시도에서 남은 dangling lock 항목 두 개만 제거하고 npm으로 다시 해석했다. 유효 의존성·무결성·감사 정책은 제거하지 않았다. 이후 엄격한 `npm ci`와 별도 네이티브 복사본의 production install이 모두 통과했다.
- [Vitest 4.1.11 공식 릴리스](https://github.com/vitest-dev/vitest/releases/tag/v4.1.11)로 테스트 도구를 갱신했다. 개발 서버 관련 [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)도 최종 감사에 남지 않는다.

## 최종 설치 구성 검증

고정 Node 24.16.0 / npm 11.13.0 / JDK 17.0.20을 프로세스 한정으로 사용했다.

| 검사 | 최종 결과 |
| --- | --- |
| root clean install | `npm ci` 성공, 887개 설치·890개 감사, 취약점 0건 |
| 전체 코드 검사 | `VITEST_MAX_WORKERS=1 npm run check`: 236개 파일·1,836개 통과(138.07초), 문구·패턴·TypeScript·ESLint 통과 |
| 이전 브랜드 timeout | 테스트 본문·기본 시간 제한을 바꾸지 않고 최종 전체 검사에서 통과 |
| URI 회귀 | 37개 통과. 공식 함수 identity·출처·정상 링크, 한국어·이모지·배열·중복·null·URL 왕복, 긴 malformed 입력 두 경로의 child 2초 제한 검사 |
| Metro 이미지 회귀 | 최종 전체 검사에도 29개 포함·통과 |
| 의존성 감사 | `audit-dependencies.mjs` production/dev 모두 통과. `npm audit --include=dev --json`의 info·low·moderate·high·critical 모두 0 |
| Expo Doctor | 최종 설치 후 20/20 통과 |
| Android Play JS export | 최종 URI 연결 후 통과. 직접 APK 업데이트 코드 제외 확인 |
| Play 네이티브 1차 | 25개 suite·214개 통과. URI/Vitest 후속 변경 전 SDK·Metro lock 기준 |
| direct 네이티브 최종 | 26개 suite·215개 통과. 최종 lock의 clean install, 어댑터 복사·해시 일치, R8·리소스 축소 설정·위치 권한 제외 확인 |

최종 package SHA-256은 `b4a82f3c9dd3545f263081be08bfccfd794b27deb4ef7d2b25af7c91df004337`, lock SHA-256은 `900bd98c8aa58af588e38ed146877e8d22a3eb4705c409cd69d2553a963fd144`다. Play 네이티브 1차 lock은 `0d864c53116ebead8944ec861973ed7d5b72e84335d631f81fa5abb02a814734`이며 최종 lock 검증으로 바꿔 기록하지 않는다. 네이티브 소스와 SDK 버전은 그 사이 바뀌지 않았다.

네이티브 원본 XML·manifest·설치 실패 이력은 `.artifacts/v124-sdk-native-20260913/`에 보존했다. 최종 direct 증거는 `direct-verified/result.json`이다. direct manifest에는 기존 APK 설치 권한이 있으며 Play 1차 manifest에는 없다. R8 설정 확인은 실제 AAB mapping 생성이나 검증이 아니다.

기기는 여전히 미연결이다. 새 SDK 구성의 실제 Hermes 실행·화면·알람·파일 선택 복귀는 미검증이며, Node 회귀와 Android export만으로 실기기 호환성을 단정하지 않는다. 기존 화면검증 APK나 V1.23의 알람 확인은 새 SDK 구성의 증거가 아니다.

## 남은 배포 게이트

사용자가 2026-09-13에 AAB 생성·배포를 다시 요청해, 기기 미연결 상태에서는 Internal까지 먼저 진행한다. 순서는 소스 확정·깨끗한 커밋의 전체 Play preflight(최종 lock의 Play 네이티브 검사 포함) → Play code 재확인 → EAS production AAB 한 번 생성·검증 → Internal 출시 → 해당 Play 설치본에서 수정 화면·새 SDK·데이터·알람·CPU·16KB·사전 출시 보고서 검증 → 동일 code 24의 Alpha 승격이다. 실기기 확인을 생략하거나 합격 처리하지 않으며 Alpha 게이트는 유지한다. 이 준비 문서 작성 시점에는 소스 커밋·전체 preflight·빌드·업로드를 아직 실행하지 않았다.

기존 V1.23 백그라운드 CPU와 실제 16KB 런타임·사전 출시 보고서 보류 항목은 이번 의존성 보완만으로 해결됐다고 보지 않는다. Alpha 승격은 새 증거가 갖춰진 뒤 진행하며 재업로드·`submit:alpha`·Production 배포는 하지 않는다.
