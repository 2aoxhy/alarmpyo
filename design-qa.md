# V19 Design QA

## V18 Baseline Evidence

- V19는 아래 V18 실행 화면을 비교 기준으로 사용합니다. V19 최종 판정은 Play Internal 설치본의 새 스크린샷과 실기기 검증을 필요로 합니다.
- Selected V18 source visual: `C:/Users/2aoxh/.codex/generated_images/019ff187-2bce-7f70-9a41-84c0e4483ced/exec-7faa73e9-9fad-45f3-8261-1c16865f2769.png`
- Source normalization: `docs/design-qa/v18/source-reference-normalized-426.png`
- Browser implementation: `docs/design-qa/v18/implementation-normalized-426.png`
- Side-by-side comparison: `docs/design-qa/v18/comparison-setup-source-step.png`
- Additional browser captures: `setup-source-step-320.png`, `today-390.png`, `calendar-390.png`, `timer-390.png`, `settings-390.png`, `alarm-settings-390.png`, `data-settings-390.png`
- Reference size: 853 × 1844 px, normalized to 426 × 922 px.
- Implementation viewport: 426 × 922 CSS px at device scale factor 1. A second setup capture used 320 × 844 CSS px.
- Compared state: quick setup step 1, with recommended/custom pattern details collapsed and the primary next action visible.

## V18 Final Comparison

- No visible P0, P1, or P2 issue remains in the side-by-side comparison.
- Typography: hierarchy is now factual and compact. The oversized assistant-style question and explanatory paragraph were intentionally replaced by a short heading, concrete example, and direct actions.
- Spacing: the thin progress indicator, flat information rows, and fixed primary action remain legible without overlap at both tested widths. The open lower area is intentional and keeps the setup decision uncluttered.
- Color: semantic day/night shift colors remain, while decorative pills, nested cards, and broad accent fills were reduced. Focus and action colors retain their functional meaning.
- Imagery: no new decorative illustration was introduced. Existing product icons are used only when they clarify an action or state.
- Copy: explanations were shortened to user actions and verifiable facts, including `주간·주간·야간·야간·휴무·휴무` and `기기 저장 · 서버 전송 없음`.
- Console: the fresh browser session after restarting Metro had 0 errors. One React Native Web `shadow*` deprecation warning remains and does not affect behavior or layout.
- The full 864 × 922 side-by-side image was sufficient to inspect the complete screen, labels, controls, and spacing; no additional focused-region crop was required.

## V19 Release Checks

- `근무표와 알람` 통합 허브와 이어서 설정하기·처음부터 흐름을 320~768dp에서 확인합니다.
- 오늘 화면 권한 안내, 1~60분 타이머 조절, 날짜 자동 형식 변환, 패턴 삭제·복구를 TalkBack과 200% 글자에서 확인합니다.
- 달력 PNG에는 월·날짜·요일·실제 근무·공휴일만 노출되고, 메모·알람·패턴명·사용자 정보가 없는지 실제 공유 파일로 확인합니다.
- 하단 탭·선택 패널·고정 하단 영역의 중앙 오차가 대칭·비대칭 안전 영역에서 1dp 이하인지 확인합니다.
- 새 화면은 `01 오늘 → 02 달력 → 03 타이머 → 04 설정` 순으로 V19 Play 설치본에서 다시 촬영합니다.

## Previous Interaction and Responsive Checks

- Verified step 1 → today-work step → alarm-readiness step, then back navigation to step 1.
- No settings were saved during visual QA, so the existing user configuration was not modified.
- Verified the 320 × 844 setup view: no horizontal clipping, truncated copy, or covered bottom action.
- Verified Today, Calendar, Timer, Settings, Alarm Settings, and Data Settings at 390dp browser width after the shared flat-row redesign.
- Physical Samsung checks, Android native alarm/keypad rendering, and 200% device-font validation remain release-gate checks rather than browser claims.

## Comparison History

1. The earlier screen used a decorative three-part stepper, a large assistant-like question, long guidance copy, repeated badges, and nested cards.
2. The setup flow was changed to one compact progress line, direct choices, an always-visible factual example, and a single bottom action.
3. Shared settings components were flattened into divider-based rows with small semantic rails only where status needs emphasis.
4. Today retained useful shift color but removed atmospheric decoration and repeated callouts. Timer, alarm, and data screens now use shorter operational wording.
5. The final post-fix side-by-side comparison confirms the intentional utility-first result while preserving the selected flow and all required actions.

## Remaining P3 Release Checks

- Confirm 140–200% Android font scaling and native full-screen alarm rendering on a Samsung device.
- Recapture final Play Store screenshots from the verified V19 installation.
- Remove the React Native Web shadow deprecation warning during a later compatibility cleanup.

V18 baseline result: passed
V19 release result: pending Internal-device verification
