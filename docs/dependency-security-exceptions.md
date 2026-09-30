# 의존성 보안 예외 기록

## 현재 정책 · 2026-09-30

활성 예외는 없습니다. 기계 판독 정책은
[`dependency-security-policy.json`](../dependency-security-policy.json)의 빈 `exceptions` 배열입니다.
높은 등급·치명적 취약점은 전이 의존성을 포함해 모두 차단합니다.

`npm run audit:dependencies`는 production 의존성을, `npm run audit:tooling`은 개발 도구를 포함해 검사합니다.
원본 검사는 각각 `audit:dependencies:raw`, `audit:tooling:raw`입니다.
조회 실패, 잘못된 JSON, 지원하지 않는 보고서 버전, 불완전한 집계·권고·의존 경로도 검사 실패로 처리합니다.
npm의 정상 취약점 보고서 종료 코드 1은 조회 실패와 구분합니다.

주간·수동 검사 외에 정책·의존성·URI 호환 코드의 PR 및 `main` 변경에서도 검사합니다.
설치 성공 후 production 감사가 실패하더라도 tooling 감사를 실행하며, 어느 검사든 실패하면 작업 전체가 실패합니다.
작업 요약에는 검사 커밋, 앱 버전, 패키지, 권고, 의존 경로와 결과 이유를 남기고 레지스트리 오류 원문은 출력하지 않습니다.

## 해결된 임시 예외 · 이력 보존

검토일: 2026-08-12. 당시 만료일: 2026-09-09. 두 항목은 현재 정책에서 제거되었습니다.

| 패키지 | 보안 권고 | 등급 | 당시 만료일 | 현재 상태 |
| --- | --- | --- | --- | --- |
| `image-size` | [`GHSA-w3rx-r6r6-pgpr`](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | 높음 | 2026-09-09 | 의존성 제거·해결 |
| `image-size` | [`GHSA-5p2g-fcmc-qvqq`](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) | 높음 | 2026-09-09 | 의존성 제거·해결 |

당시 Expo·Metro가 저장소의 로컬 이미지 크기를 읽는 빌드 경로에 한정해 일시 허용했습니다.
앱의 근무표·알람 런타임에는 포함되지 않았으며, 검토 당시 공개 버전에는 수정판이 없었습니다.
현재 잠금 파일의 공식 Metro 0.84.5는 해당 `image-size` 의존성을 제거했습니다.
URI 디코더 호환 코드와 Metro의 잘못된 이미지 입력에 대한 회귀 테스트를 보안 workflow에서도 실행합니다.

예외 만료일은 연장하지 않았습니다. 이 표는 과거 검토 기록이며 현재 허용 목록이 아닙니다.
`npm audit fix --force`로 SDK나 네이티브 의존성을 임의 하향하지 않습니다.
새 예외는 정책 파일만 추가해 활성화할 수 없으며 코드와 영향 범위의 별도 검토가 필요합니다.
