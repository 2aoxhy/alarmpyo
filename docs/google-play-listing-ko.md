# 알람표 Google Play 등록 초안

이 문서는 스토어 입력용 초안이에요. 실제 AAB와 Play Console 선언이 확정된 뒤 문구·이미지·정책 답변이 서로 일치하는지 마지막으로 대조해요.

## 기본 정보

- 앱 이름: `알람표`
- 기본 언어: 한국어
- 앱 또는 게임: 앱
- 카테고리: 생산성
- 광고 포함: 아니요
- 계정 생성: 아니요
- 대상 사용자: 성인 주간·교대 근무자
- 패키지 이름: `com.personal.alarmpyo`
- 지원 이메일: Play Console에 등록한 검증된 앱 지원 연락처(개인 주소를 저장소에 복사하지 않아요)
- 개인정보 처리방침: `play-release-policy.json`에 기록된 활성 HTTPS 페이지와 동일한 주소를 Play Console에 등록해요. 개인 연락처나 소유자 식별 주소는 이 문서에 복사하지 않아요.

## 짧은 설명

교대 근무표와 근무·타이머 알람을 한눈에 관리하세요.

## 전체 설명

알람표는 교대·주간 근무 일정과 알람을 간편하게 관리하는 앱이에요.

주요 기능

- 대표 교대 근무와 직접 편집하는 반복 순서·근무시간
- 근무·휴무·공휴일·급여일 달력
- 근무 기상 알람과 30분·60분 소리·진동 타이머
- 근무 전환에 맞춘 수면 준비 알림
- 오늘·다음 근무·다음 알람 홈 화면 위젯
- 근무표 공유와 백업·복구

로그인 없이 사용할 수 있고 근무표, 메모와 설정은 기기에 저장해요.

## 그래픽 자료

최종 업로드에는 AlarmPyo 계보 자산을 사용해요.

- 브랜드 파생 자산 생성: `npm run assets:brand:generate`
- 브랜드 마스터 일치 검사: `npm run assets:brand:check`
- 최종 512×512 아이콘: `assets/play-store/alarmpyo-icon-512.png`
- 최종 1024×500 대표 그래픽: `assets/play-store/alarmpyo-feature-graphic.png`
- 앱 아이콘 파생 자산: `assets/images/alarmpyo-*.png`
- 휴대전화 스크린샷: `assets/play-store/phone-screenshots`에 현재 릴리스 후보를 **Play 내부 트랙으로 설치한 실제 Android 기기**에서 새로 촬영해요.

Google Play의 현재 필수 형식은 다음과 같아요.

- 앱 아이콘: 512×512px, 알파 채널이 있는 32비트 sRGB PNG, 1024KB 이하
- 대표 그래픽: 1024×500px, JPEG 또는 알파 없는 24비트 PNG
- 스크린샷: 전체 기기 유형을 합쳐 최소 2장, 기기 유형별 최대 8장, JPEG 또는 알파 없는 24비트 PNG
- 스크린샷 크기: 짧은 변 320px 이상, 긴 변 3840px 이하이며 긴 변이 짧은 변의 두 배를 넘지 않아야 해요.

로컬 검증기는 PNG의 청크 CRC, zlib 압축 해제, 픽셀 행 길이와 필터 값을 검사하기 위해 비인터레이스 PNG만 허용해요. JPEG는 마커 구조·크기·채널당 8비트 RGB 3채널 메타데이터만 검사하며 엔트로피 픽셀을 디코딩하지 않아요. 따라서 JPEG는 이 검사 통과만으로 파일 전체 무결성을 보장하지 않으며 Play Console 업로드와 미리보기에서도 정상적으로 열리는지 확인해야 해요. 비인터레이스 PNG와 RGB JPEG 제한은 Google Play의 형식 문구보다 보수적인 AlarmPyo 등록 계약이에요.

앱은 세로 고정이므로 휴대전화 화면에는 1080×1920px 9:16 스크린샷을 4장 이상 준비하는 것을 권장해요. 이는 게시 최소 조건보다 엄격한 Google Play 추천 노출 기준이에요. 각 그래픽과 스크린샷을 Console에 올릴 때 140자 이하의 대체 텍스트도 함께 작성해요. [Google Play 미리보기 자산 공식 요구사항](https://support.google.com/googleplay/android-developer/answer/9866151?hl=ko), [Google Play 아이콘 설계 사양](https://developer.android.com/distribute/google-play/resources/icon-design-specifications?hl=ko)

현재 아이콘과 대표 그래픽만 검사하고 스크린샷 누락을 경고로 확인하려면 다음 명령을 사용해요.

```powershell
node scripts/validate-play-store-assets.mjs --allow-missing-screenshots
```

실제 등록 직전에는 예외 없는 다음 명령이 통과해야 해요. 스크린샷이 2장 미만이면 의도적으로 실패해요.

```powershell
npm run release:verify:play-store-assets
```

권장 스크린샷 순서

1. 오늘 근무와 다음 근무
2. 대표 교대 순서와 급여 표시 근무 달력
3. 실행 중인 30분 타이머
4. 근무 알람과 소리·진동 상태
5. 근무 방식·회사 근무시간 설정

스크린샷은 현재 기능만 보여주고, 상태 표시줄의 개인정보·테스터 이메일·기기 식별 정보는 제거해요. 실제 앱의 다크 테마를 사용하고 화면을 합성해 존재하지 않는 기능을 만들지 않아요. 알림이나 통신사 이름이 보이지 않게 하고 배터리·Wi-Fi·셀룰러 상태 아이콘은 정상 상태로 촬영해요. 첫 3장은 실제 앱 UI를 우선 보여주고 서로 같은 화면을 반복하지 않아요.

로컬 검사는 파일 SHA-256도 비교해 이름만 다른 동일 스크린샷을 중복 등록하는 경우를 차단해요. 서로 다른 화면을 실제 기기에서 촬영해야 하며, 같은 화면을 재인코딩해 중복 검사를 피하는 것은 등록 증거로 인정하지 않아요.

이미지 규격 검사는 PNG 압축 데이터와 JPEG 구조·메타데이터, 크기를 자동으로 확인해요. 업로드 전에는 Play Console 미리보기에서 다음을 직접 확인해요.

- Google이 적용하는 둥근 마스크와 그림자 안에서 아이콘의 외곽선이 잘리거나 이중으로 보이지 않는지
- 대표 그래픽의 핵심 요소가 중앙에 있고 다양한 노출 비율에서 잘리지 않는지
- 스크린샷이 최신 Play 빌드의 실제 동작과 문구를 정확히 반영하는지
- 타사 상표, 순위·가격·할인 표현, Play 배지 또는 오해를 유발하는 문구가 없는지

## 건강 기능과 계정 유형 결정

Google의 건강 앱 선언에는 `Sleep Management`가 별도 항목으로 있어요. 알람표는 수면을 측정·추적하지 않지만, 근무 일정에서 수면 준비 시점을 계산해 일반 알림으로 제공해요. 이 기능을 스토어에서 명시하므로 Play 지원의 다른 확인이 없는 한 `Sleep Management`만 보수적으로 신고해요. 의료·연구·다른 건강 기능이나 Health Connect·센서 데이터 접근은 선택하지 않아요. 건강 데이터 수집 여부와 건강 기능 제공 여부는 별도 질문이에요. [건강 앱 선언 공식 안내](https://support.google.com/googleplay/android-developer/answer/14738291?hl=ko)

2026년 9월 30일부터 적용되는 Play Console 요구사항에는 건강 앱 제공자의 조직 계정 등록 요건이 있어요. 다만 공식 문구는 Play Console 계정을 만들 때의 등록 유형을 중심으로 써 있으므로, 이미 만든 개인 계정은 Console의 전환 요구나 Play 지원 답변으로 적격을 확인해요. 필요한 경우 D-U-N-S와 조직 확인을 준비하고, 분류와 계정 적격이 미확정이면 production을 시작하지 않아요. [Play Console 요구사항](https://support.google.com/googleplay/android-developer/answer/10788890?hl=ko)

## 제출 전 Play Console 작업

1. 앱 액세스는 `모든 기능을 제한 없이 이용할 수 있음`으로 답하고, 로그인·회원가입·특별 접근 절차가 없음을 실제 Play 산출물에서 다시 확인해요.
2. 실제 지원 이메일·전화번호와 개발자 프로필 확인을 끝내요.
3. `play-release-policy.json`에 기록된 활성 개인정보처리방침 주소가 로그인·지역 제한 없이 열리고, PDF가 아닌 사용자가 수정할 수 없는 HTTPS 페이지인지 다시 확인해요. Play Console에도 같은 주소가 등록되어 있어야 해요.
4. 데이터 보안 양식을 `docs/google-play-data-safety-ko.md`와 최종 AAB의 SDK·네트워크 동작에 맞춰 작성해요.
5. 건강 앱 선언과 `Sleep Management` 분류, 비의료 안내를 확정해요.
6. 정확한 알람, 전체 화면 알람, 포그라운드 미디어 재생 권한을 신고해요.
7. 실제 Samsung 기기에서 정확한 근무·타이머 알람 예약, 앱 종료 상태 알람, 잠금 화면 전체 화면 표시, 소리·진동과 알람 종료를 순서대로 보여주는 검토 영상을 준비해요. FGS 유형별 기능 실행 과정이 분명하게 보여야 해요. [FGS·전체 화면 Intent 선언 안내](https://support.google.com/googleplay/android-developer/answer/13392821?hl=ko)
8. 콘텐츠 등급, 대상 연령, 광고 없음, 금융 기능 없음, 정부 앱 아님을 실제 동작과 맞게 답해요.
9. 첫 제출은 내부 테스트 초안으로 올리고, Play 생성 APK의 서명·실기기·16KB·사전 출시 보고서를 검증한 뒤 공개 범위를 결정해요.
10. 2023년 11월 13일 이후 만든 개인 계정이면 12명·14일 비공개 테스트 요건을 완료해요. [개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ko)

## 등록 중단 조건

다음 중 하나라도 미확정이면 production 등록을 중단해요.

- 수면 기능 분류 또는 개발자 계정 유형
- 활성 개인정보처리방침 URL 또는 별도로 결정할 Play App Signing 인증서
- 현재 V05 후보 `1.0.5(6)`가 Play Console의 기존 V04 `versionCode 5`보다 높은 같은 package 계보인지 확인
- 권한·FGS 선언 영상, 데이터 보안, 개인정보 처리방침
- 실제 기기 스크린샷과 지원 연락처
- Play 생성 APK 실기기 QA, 16KB 환경, 사전 출시 보고서
