# 알람표 V14 디자인 QA

검증일: 2026-08-21

대상: V14 Today 근무 역할 색상, 하단 바 중앙 정렬, 달력 월/주차 표현, 날짜 요약, 타이머, 설정, 최초 설정

## 비교 대상과 정규화

- source visual truth: 사용자가 대화에 첨부한 V14 Today 히어로 참고 화면
- source pixels: 1156×490, Today 히어로만 잘라 낸 참고 화면, 원본 CSS 크기와 기기 밀도는 알 수 없음
- primary implementation screenshot path: `.release/design-qa/v14/today-day-412x915-final.png`
- implementation viewport: 412×915 CSS px, page-reported DPR 2
- implementation capture pixels: 412×887. 인앱 브라우저 캡처가 브라우저의 28px 외곽 영역을 제외하고 CSS 픽셀로 정규화함
- source/implementation combined comparison: `.release/design-qa/v14/today-hero-source-vs-v14-final.png`
- density normalization: source와 구현 히어로를 각각 같은 760px 폭으로 비례 조정하여 한 캔버스에서 비교함. source가 고립된 crop이므로 전체 화면 높이나 절대 CSS 치수는 픽셀 일치 판정에 사용하지 않음
- state: 2026-08-21, 기본 주간 근무. 야간은 해당 날짜를 임시 야간으로 바꾸어 검증한 뒤 기본 근무표로 복원함

추가 구현 근거:

- `.release/design-qa/v14/today-night-412x915-final.png` — 야간 히어로
- `.release/design-qa/v14/today-day-vs-night-v14-final.png` — 같은 viewport의 주간/야간 집중 비교
- `.release/design-qa/v14/calendar-412x915-dpr2.png` — 412dp 월 달력
- `.release/design-qa/v14/calendar-week-list-320x800-top-dpr2.png` — 320dp 주차별 목록
- `.release/design-qa/v14/calendar-date-summary-412x915-final.png` — 날짜 요약과 최종 포커스 표시
- `.release/design-qa/v14/timer-320x800-dpr2.png` — 웹의 Android 전용 타이머 안내
- `.release/design-qa/v14/settings-320x800-dpr2.png` — 간결한 설정 홈
- `.release/design-qa/v14/work-settings-320x800-dpr2.png` — 근무표 설정
- `.release/design-qa/v14/setup-fresh-412x915-dpr1.png` — 별도 새 로컬 origin의 최초 설정 1단계
- `.release/design-qa/v14/setup-step2-412x915-stable-dpr1.png` — 최초 설정 2단계

## full-view comparison evidence

`today-hero-source-vs-v14-final.png`의 왼쪽은 source, 오른쪽은 V14 구현입니다. 상태 배지 → 근무 제목 → 시간 → 남은 시간 → 수정 행동의 정보 순서와 우측 하단 행동 배치는 유지되었습니다. V14에서는 요청과 새 시각 계약에 따라 중립 회색 화면을 실제 주간 의미색 `#0E4B43 → #163A35`와 민트 강조색으로 바꾸고, 주간에는 달 대신 해를 표시했습니다. source의 crop 밀도가 불명확하므로 절대 높이 차이는 판정에서 제외했으며, 412dp 실제 화면에서는 겹침·잘림 없이 다음 섹션까지 자연스럽게 이어집니다.

## focused region comparison evidence

- `today-day-vs-night-v14-final.png`: 동일 412dp 상태에서 주간은 `rgb(14,75,67) → rgb(22,58,53)`, 야간은 `rgb(17,43,70) → rgb(23,31,51)`로 계산되며, 해/달 artwork와 강조선도 실제 적용 근무에 맞게 바뀝니다.
- `bottom-bar-before-vs-after.png`: 초기 web scroll rail이 우측 경계를 가린 상태와 rail 제거 후 상태를 같은 하단 영역에서 비교했습니다.
- `calendar-date-summary-412x915-final.png`: 날짜 요약 최초 포커스가 `#89CEFF`, 2px, offset 2px로 표시되는 것을 시각 및 computed style로 확인했습니다.
- 달력 412dp와 320dp 캡처를 함께 확인하여 7열 월 달력과 주차별 세로 목록 사이의 정보 밀도·줄바꿈·하단 여백을 비교했습니다.

## 필수 fidelity surfaces

- Fonts and typography: source와 같은 굵은 고딕 계층을 유지하며 제목, 시간, 남은 시간, 버튼의 시각적 우선순위가 분명합니다. 320dp 설정·달력·타이머와 412dp Today·Setup에서 핵심 문구 잘림이나 부자연스러운 한 글자 줄바꿈이 없습니다.
- Spacing and layout rhythm: 320dp 문서 `scrollWidth=320`, 412dp 하단 바 `left=12`, `width=388`, `right=400`, 중심 오차 0px입니다. 320dp 하단 바도 `left=4`, `width=312`, 중심 오차 0px입니다. 마지막 콘텐츠와 고정 하단 UI 사이에 가림이 없습니다.
- Colors and visual tokens: 배경 `#101214`, 역할별 히어로 gradient, 민트/아이스블루 강조, 산호색 공휴일과 호박색 급여일이 의미별로 분리됩니다. 흰색 전경은 역할 배경에서 명확히 읽힙니다.
- Image quality and asset fidelity: 해·달·근무·탭 아이콘은 일관된 아이콘 계열로 선명하게 렌더링되며 압축 halo, 잘못된 crop, placeholder가 없습니다. source의 주간 달 artwork는 V14 역할 규칙에 따라 해 artwork로 의도적으로 수정했습니다.
- Copy and content: `오늘은 주간 근무`, `오후 5:45부터 다음 날 오전 6:45까지`, 공휴일·급여일 전체 명칭, Android 전용 안내가 독립적으로 이해되며 핵심 sheet 문구에 말줄임표를 사용하지 않습니다.
- Interaction and accessibility: 날짜 요약 열기/닫기와 원래 날짜 셀 포커스 복원, 월 달력·주차 목록의 `checkbox` 상태, 최초 설정 1→2단계, 탭 이동을 실제 렌더에서 확인했습니다. 선택 전후 `aria-checked=false → true`가 grid와 week-list 모두에서 전달되고 접근성 이름에는 `선택됨`을 중복 추가하지 않습니다.

## 브라우저 상호작용과 오류

- Today 주간 → 날짜 수정 → 야간 저장 → 야간 히어로 확인 → 기본 근무표 복원
- 오늘/달력/타이머/설정 탭 이동
- 달력 날짜 요약 열기·닫기, 닫은 뒤 원래 8월 21일 셀로 포커스 복원
- 월 달력과 320dp 주차 목록에서 선택 모드 진입, 체크 상태 전환, 선택 취소
- 새 local origin에서 최초 설정 `주간 고정` 선택, 버튼 활성화, 2단계 이동
- console errors: main 0건, fresh setup 0건
- 알려진 비차단 개발 경고: React Native Web의 `pointerEvents` 및 `shadow*` deprecated 경고

## comparison history

1. P1 — 하단 바가 web scroll rail과 겹쳐 보임
   - earlier evidence: `.release/design-qa/v14/today-day-412x915-dpr2.png`; `innerWidth=412`, `clientWidth=404`, bar `12..400`으로 우측 8px rail이 경계를 덮고 사용 가능 영역 기준 약 4px 우측으로 보였습니다.
   - fix: 공통 Screen에서 web scroll indicator를 숨기고 native indicator 동작은 유지했습니다.
   - post-fix evidence: `.release/design-qa/v14/today-day-412x915-final.png`; `innerWidth=clientWidth=412`, scrollbar width 0, bar center 206, center error 0, right border visible.

2. P2 — 날짜 요약 제목에 브라우저 기본 1px focus outline 사용
   - earlier evidence: `.release/design-qa/v14/calendar-date-summary-412x915-dpr2.png`; `outline: auto 1px`, offset 0.
   - fix: focusable sheet heading에 공통 `#89CEFF` focus treatment를 적용했습니다.
   - post-fix evidence: `.release/design-qa/v14/calendar-date-summary-412x915-final.png`; `outline: rgb(137,206,255) solid 2px`, offset 2px.

3. P2 — Today `일정 수정하기` 터치 높이 44px
   - fix: 동작 영역 최소 높이를 48dp로 높였습니다.
   - post-fix evidence: day와 night 모두 실제 128.7×48 CSS px로 측정되었습니다.

4. P1 — 달력 선택 셀이 `role=checkbox`이지만 checked 상태를 전달하지 않음
   - earlier evidence: 선택 패널은 `전체 1일 · 이 달 1일`이었으나 `aria-checked`가 없고 DOM snapshot에 checked 상태가 없었습니다.
   - fix: 월 달력 셀과 주차 목록 행에 명시적 `aria-checked`를 native `accessibilityState`와 함께 전달했습니다.
   - post-fix evidence: 412dp grid와 320dp week-list에서 선택 전 `false`, 선택 후 `true`; 접근성 이름은 전후 동일하여 `선택됨` 중복이 없습니다.

## Findings

남아 있는 actionable P0/P1/P2 차이는 없습니다.

P3/검증 범위 메모:

- source는 Today 히어로만 잘린 파일이며 원본 CSS viewport와 밀도를 알 수 없어 절대 픽셀 높이 일치는 판정하지 않았습니다.
- 웹에서는 Android 전용 타이머·알람 실행을 검증할 수 없어 지원 불가 안내 상태만 확인했습니다. 네이티브 실행은 Android 검증 절차가 담당합니다.

final result: passed
