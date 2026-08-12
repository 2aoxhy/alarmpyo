# 의존성 보안 예외 기록

검토일은 2026-08-12이며 예외 만료일은 2026-09-09예요. 기계 판독 정책은
[`dependency-security-policy.json`](../dependency-security-policy.json)에 있어요.

## 임시 허용 항목

| 패키지 | 보안 권고 | 등급 | 만료일 |
| --- | --- | --- | --- |
| `image-size` | [`GHSA-w3rx-r6r6-pgpr`](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | 높음 | 2026-09-09 |
| `image-size` | [`GHSA-5p2g-fcmc-qvqq`](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) | 높음 | 2026-09-09 |

두 항목은 Expo와 Metro가 빌드 과정에서 저장소의 로컬 이미지 크기를 읽을 때
사용하는 `image-size`의 서비스 거부 취약점이에요. 현재 공개된 최신 버전
`2.0.2`까지 영향을 받고 수정 버전은 아직 없어요. 앱에 설치되는 근무표와 알람
런타임에는 `image-size`가 포함되지 않으며, 빌드에서는 관리 중인 로컬 자산만
처리해요.

`npm run audit:dependencies`는 npm 감사 결과를 읽고 위 두 권고에서 파생된
경고만 만료일까지 허용해요. 새로운 높은 등급 또는 치명적 취약점, 정책과 다른
패키지의 경고, 만료된 예외는 모두 실패해요. 원본 결과가 필요하면
`npm run audit:dependencies:raw`를 실행해요. 개발 도구까지 포함한 검사는
`npm run audit:tooling`, 원본 검사는 `npm run audit:tooling:raw`로 실행해요.

`npm audit fix --force`가 제안하는 Expo·React Native 하향은 현재 SDK와 네이티브
모듈 호환성을 깨뜨리므로 적용하지 않아요. `image-size` 수정 버전이 공개되거나
Expo의 Metro 의존성이 교체되면 예외를 제거하고 즉시 다시 검사해요.

만료 전에 수정 버전이 나오면 Expo·Metro 호환성을 확인해 갱신한 뒤 이 예외를
제거해요. 수정 버전이 계속 없다면 신뢰한 저장소 이미지에만 쓰이는 빌드 도구라는
노출 범위를 다시 확인하고, 검토일로부터 최대 30일까지만 새 만료일을 승인해요.
검토 없이 만료일만 늘리지 않으며 만료된 예외는 canary 검사도 차단해요.
