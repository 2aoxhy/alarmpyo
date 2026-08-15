# 개인정보처리방침 GitHub Pages 게시 절차

이 절차는 `public/privacy-policy.html`만 공개하는 별도 정적 사이트를 준비합니다. 앱 소스가 공개 저장소에 있더라도 APK, AAB, 업데이트 manifest와 `.release` 산출물은 이 Pages 배포에 포함하지 않습니다.

## 배포 경계

- `.github/workflows/privacy-policy-pages.yml`은 자동 배포하지 않고 GitHub Actions에서 수동으로 실행할 때만 동작합니다.
- 기본 브랜치의 커밋에서 실행한 경우에만 게시 작업이 진행됩니다. 작업 중인 로컬 파일, 다른 브랜치와 커밋되지 않은 변경은 게시되지 않습니다.
- 워크플로는 `public/privacy-policy.html`만 임시 디렉터리에 복사하고, 같은 본문을 사이트 루트의 `index.html`과 `/privacy-policy.html`로 게시합니다.
- 게시 전 원본이 유효한 UTF-8이고 필수 제목·문자셋 선언을 포함하는지 확인합니다. 산출물에는 원본과 바이트 단위로 같은 두 HTML 파일만 들어가며 하위 디렉터리·심볼릭 링크·다른 공개 파일은 허용하지 않습니다.
- 포장 작업은 저장소 읽기와 Pages 읽기 권한만 사용하고, 실제 게시 작업만 `pages: write`와 OIDC `id-token: write` 권한을 사용합니다. 외부 Actions는 검토한 릴리스의 변경 불가능한 전체 커밋 SHA로 고정합니다.
- 개인정보처리방침 게시와 direct APK용 production Hosting은 서로 다른 결정입니다. Pages 주소가 열렸다는 이유만으로 `release-policy.json`의 `productionHostingUrl` 또는 blocker를 변경하지 않습니다.
- 실제 Pages 주소가 확인되기 전에는 Play Console이나 `play-release-policy.json`에 예시 주소를 넣지 않습니다. Play 정책은 `privacyPolicyUrl: null`과 해당 blocker를 유지합니다.

## 처음 게시하기

1. 비밀 파일이 추적되지 않는지 확인한 뒤 이 저장소를 원하는 GitHub 공개 저장소에 연결합니다.
2. GitHub 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. **Settings → Environments → github-pages**에서 가능한 경우 배포 브랜치를 기본 브랜치로 제한하고, 필요한 검토자 승인 규칙을 설정합니다.
4. **Actions → Publish privacy policy to GitHub Pages → Run workflow**에서 기본 브랜치를 선택해 수동 실행합니다. 다른 브랜치를 선택하면 워크플로가 게시하지 않고 종료합니다.
5. 완료된 작업의 `github-pages` 환경에 표시된 실제 주소를 복사합니다.

프로젝트 Pages의 일반적인 주소는 다음 형태지만 저장소 이름과 대소문자, 사용자·조직 Pages 여부에 따라 달라질 수 있으므로 워크플로 결과를 기준으로 합니다.

```text
https://<GitHub-ID>.github.io/<저장소이름>/privacy-policy.html
```

## 공개 상태 확인하기

실제 주소를 넣어 다음처럼 HTTPS 응답과 본문을 확인합니다.

```powershell
$policyUrl = 'https://<GitHub-ID>.github.io/<저장소이름>/privacy-policy.html'
$response = Invoke-WebRequest -Uri $policyUrl
$response.StatusCode
$response.Headers['Content-Type']
$response.Content | Select-String '알람표 개인정보 처리방침'
```

다음 조건도 브라우저의 로그아웃·시크릿 창에서 직접 확인합니다.

- 로그인이나 접근 승인 없이 열림
- 지역 제한이 없고 HTTPS 최종 주소에서 정상 응답
- PDF나 편집 화면이 아닌 읽기 전용 HTML
- JavaScript를 끈 표준 브라우저에서도 전체 본문과 문의 주소가 보임
- 앱 이름, 개발자, 데이터 처리·공유·보관·삭제 설명과 시행일이 최신 앱 내 방침과 같음

GitHub는 Pages 방문자의 IP 주소를 로그인 여부와 관계없이 보안 목적으로 기록·저장한다고 안내합니다. 공개 HTML과 앱 내 방침은 이 웹 방문 로그가 앱의 근무표·메모·알람 설정 전송과 다르다는 점을 함께 고지합니다. [GitHub Pages 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [GitHub 개인정보처리방침](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

모든 확인이 끝난 실제 `/privacy-policy.html` 주소만 Play Console 개인정보처리방침 필드에 입력합니다. 같은 주소를 `play-release-policy.json`의 `privacyPolicyUrl`에 기록하고 `privacyPolicyUrl` blocker를 제거합니다. 정책 검증은 HTTPS 경로를 허용하지만 인증 정보, 쿼리 또는 조각이 포함된 주소는 거부합니다. 이때 direct `release-policy.json`은 변경하지 않습니다. Google Play는 활성 상태이고 공개 접근 가능하며 지역 제한이 없는 비편집 HTML 주소를 요구합니다. [Google Play 개인정보처리방침 요구사항](https://support.google.com/googleplay/android-developer/answer/17105854?rd=5)

기록한 뒤 `npm run release:verify:play-privacy-url`로 실제 2xx UTF-8 HTML 응답을 확인합니다. 이 검사는 공개 GitHub Pages의 `/privacy-policy.html` 본문 SHA-256이 현재 `public/privacy-policy.html` 원본과 정확히 같은지도 확인해 오래되거나 무관한 페이지를 허용하지 않습니다. 다른 호스트로 이동하는 리디렉션, 로그인·편집 화면, 512KB를 넘는 응답과 15초 안에 끝나지 않는 요청도 거부합니다.

## 변경 후 다시 게시하기

본문이나 시행일을 변경하면 앱 내 `src/app/privacy.tsx`와 `public/privacy-policy.html`을 함께 수정하고 `npm run check`가 통과한 커밋에서 수동 워크플로를 다시 실행합니다. 게시 후에는 실제 URL의 본문이 해당 커밋과 같은지 다시 확인합니다.
