# HTSA 리디자인 호환 기준

이 문서는 전체 리디자인과 리팩터링 과정에서 유지해야 하는 운영 계약을 기록해요.

## 배포 기준

- 현재 공개 앱 버전: `1.5.1`
- 현재 공개 Android versionCode: `44`
- 다음 검증 앱 버전: `1.7.0`
- 다음 검증 Android versionCode: `47`
- runtimeVersion 정책: `appVersion`
- 패키지: `com.personal.todayshift`
- 운영 채널: `stable`
- 기존 APK 서명 인증서 SHA-256: `302802f8fc798cf9e6ae845675860a301c98bcb3ee34e2908122b32e3b95fb1b`
- 운영 APK 주소: `https://today-shift.expo.app/downloads/v44/HTSA_20260809.apk`
- 운영 APK SHA-256: `d2b3b71f5a495bff848af31982b5ef72b762e80eee67d6e13c1701070c75651e`
- 운영 APK 크기: `111146345`바이트
- 운영 EAS 빌드 ID: `da6168f4-db5d-4a17-bd2c-11f6a23b03e3`

## 반드시 유지할 데이터 계약

- AppData 버전 17과 기존 마이그레이션 경로를 유지해요.
- `today-shift:*` AsyncStorage 키를 바꾸지 않아요.
- `htss-alarm-v1`, `htss-widget-v1`, `htss-alarm-restore-v1` SharedPreferences 키를 바꾸지 않아요.
- 네이티브 모듈 이름 `HtssAlarm`과 기존 알람·위젯·APK 업데이트 입력 형식을 유지해요.
- 화면에는 HTSA를 표시하지만, 저장소와 네이티브 계약의 HTSS 식별자는 호환성을 위해 유지해요.

## 단계별 원칙

1. 현재 기준은 공개된 `1.5.1(44)` APK와 위 SHA-256으로 고정해요.
2. 데이터 저장, 알람 예약, 위젯 동기화의 회귀 검사를 모두 통과한 뒤 한 번의 EAS 빌드를 시작해요.
3. 다음 네이티브 배포는 `1.7.0(48)`으로 만들고 기존 서명 키를 그대로 사용해요.
4. 새 APK를 `1.5.1(44)` 위에 설치해 자료와 권한을 확인한 뒤 같은 파일만 운영으로 승격해요.
5. 검증에 실패하면 새 파일을 공개하지 않고 `1.5.1(44)`을 유지해요.
6. `1.7.0(48)` APK 공개 전에는 같은 런타임의 OTA 게시를 차단해요.
