# V12 공식 근무 패턴 서명·배포 계약

## 신뢰 경계

- 공식 파일 형식은 `alarmpyo.shiftpattern`, 형식 버전은 `1`입니다.
- 공식 ID는 `humantss_a`, `humantss_b`, `humantss_c` 세 개로 고정합니다.
- 기준일은 모두 `2026-08-01`이며 순서는 각각 `야야휴휴주주`, `휴휴주주야야`, `주주야야휴휴`입니다.
- 앱은 UTF-8 256KB 상한, 알려지지 않은 필드와 중복 JSON 키 거부, NFC 정규화, 고정 키 순서 canonical JSON, SHA-256, ECDSA P-256 compact low-S 서명을 모두 통과한 공식 파일만 사용합니다.
- 공식 ID의 hash, 서명, 공개키 또는 고정 내용이 잘못되면 가져오기를 중단합니다. 사용자 패턴으로 변경하여 처리하지 않습니다.
- 외부 파일에는 근무 코드와 기준일만 있습니다. 근무 시간, 알람, 권한, 날짜별 예외를 변경하는 필드는 스키마에서 허용하지 않습니다.
- 공식 조회 함수는 화면 진입 또는 사용자의 새로고침 동작에서만 호출합니다. 백그라운드 작업, 주기 조회, 자동 재시도를 만들지 않습니다.

## 파일과 키

| 항목 | 고정 값 |
|---|---|
| GitHub Environment | `official-pattern-signing` |
| Environment secret | `SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM` |
| 알고리즘 | `ECDSA_P256_SHA256` |
| 비공개키 인코딩 | PKCS#8 PEM, P-256(`prime256v1`) |
| 공개키 인코딩 | 비압축 SEC1 65바이트의 canonical Base64 |
| keyId | `alarmpyo-official-patterns-v1` |
| 공개 keyring | `official-patterns/public-keyring.json` |

비공개키는 저장소, 앱, Pages artifact, 로그에 넣지 않습니다. 저장소에는 공개키만 커밋합니다. `official-patterns/sources/*.source.json`은 `signature`와 `contentSha256`이 없는 명시적 unsigned source입니다. 따라서 키를 준비하기 전 파일을 공식 서명본으로 오인할 수 없습니다.

## 최초 키 준비

키 bootstrap은 저장소 밖의 새 파일만 만들며 기존 파일을 덮어쓰지 않습니다. 다음 PowerShell 예시는 비공개키 원문을 터미널에 출력하지 않습니다.

```powershell
$patternKeyPath = Join-Path $env:TEMP 'alarmpyo-official-patterns-v1-private.pem'
node scripts/bootstrap-official-pattern-signing-key.mjs --private-key-output $patternKeyPath
npm run patterns:validate:sources
```

bootstrap은 `official-patterns/public-keyring.json`에 공개키를 추가합니다. 해당 JSON과 unsigned source만 커밋합니다. `$patternKeyPath` 파일은 커밋하지 않습니다.

1. GitHub 저장소의 **Settings → Environments → New environment**에서 `official-pattern-signing`을 만듭니다.
2. 해당 Environment의 secret으로 `SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM`을 만듭니다.
3. Windows에서 `Set-Clipboard -Value ([IO.File]::ReadAllText($patternKeyPath))`를 실행하고 secret 값 입력란에 붙여 넣습니다. 비공개키를 채팅, 작업 로그 또는 명령행 인수에 넣지 않습니다.
4. 저장을 확인한 직후 `Set-Clipboard -Value ''`와 `Remove-Item -LiteralPath $patternKeyPath`를 실행합니다.
5. `git diff -- official-patterns/public-keyring.json`에 공개키만 있는지 확인합니다. PEM 본문이나 `PRIVATE KEY` 문자열이 있으면 진행을 중단합니다.

키를 잃으면 같은 `keyId`에 새 공개키를 자동으로 덮어쓰지 않습니다. 별도 keyId를 추가하고 앱 keyring을 먼저 배포한 뒤 서명키를 전환해야 합니다.

## 서명과 검증

로컬 보안 테스트는 다음 명령으로 실행합니다.

```powershell
npm run patterns:validate:sources
npm run test -- --run scripts/__tests__/official-shift-pattern-signing.test.mjs
```

`patterns:validate:sources`는 manifest의 `keyId`와 같은 실제 공개키가 정확히 한 개 없으면 실패합니다. 따라서 공식 파일을 모두 `unknown-key`로 거부하는 AAB는 전체 `npm run check`를 통과할 수 없습니다.

서명 스크립트는 다음 두 입력 중 정확히 하나만 받습니다.

- `SHIFT_PATTERN_SIGNING_PRIVATE_KEY_PEM`: GitHub Environment secret의 PEM 원문
- `SHIFT_PATTERN_SIGNING_PRIVATE_KEY_FILE`: 저장소 밖 PEM 파일의 경로

두 변수를 함께 지정하거나 모두 생략하면 실패합니다. 스크립트는 비공개키 원문과 하위 crypto 예외를 stdout 또는 stderr에 출력하지 않습니다. 출력 파일은 canonical payload의 SHA-256과 compact low-S ECDSA P-256 서명을 포함하며, 검증 스크립트가 세 파일 전체를 다시 확인합니다.

## GitHub Pages 배포

`.github/workflows/privacy-policy-pages.yml`은 수동 실행만 허용합니다. 기본 브랜치의 커밋에서 `official-pattern-signing` Environment secret으로 임시 artifact 안의 세 파일을 서명하고 즉시 검증합니다. 저장소의 `public/`이나 작업 트리에는 서명본을 쓰지 않습니다.

게시 경로는 다음과 같습니다.

```text
https://2aoxhy.github.io/alarmpyo/humantss_a.json
https://2aoxhy.github.io/alarmpyo/humantss_b.json
https://2aoxhy.github.io/alarmpyo/humantss_c.json
```

Pages artifact는 `index.html`, `privacy-policy.html`, 공식 JSON 세 개만 허용합니다. 키가 없거나 공개 keyring과 다르거나 한 파일이라도 변조되면 artifact 업로드 전에 실패합니다.
