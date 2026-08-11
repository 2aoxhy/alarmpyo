# 운영 웹 배포 복구 기준 준비

APK 승격은 문제가 생겼을 때 직전 불변 배포로 즉시 되돌릴 수 있어야 시작돼요.

AlarmPyo는 새 Expo 프로젝트에 연결됐지만 production Hosting URL이 미정이라 이 절차는 차단돼요. 예제 주소나 이전 앱 deployment ID를 넣지 않아요. 실제 production Hosting을 만든 뒤 나머지 운영 값과 함께 `release-policy.json`을 활성화하고 진행해요.

1. Expo Hosting 대시보드에서 현재 production deployment ID를 확인해요.
2. 아래 명령으로 현재 불변 주소와 운영 주소가 같은 APK를 제공하는지 검사해요.

```powershell
npm run release:bootstrap:web -- --id 현재_DEPLOYMENT_ID
```

3. 검증된 ID는 `.release/production-web-deployment.json`에 저장돼요.
4. 이후 `npm run release:promote:android`가 이 ID를 자동 롤백 기준으로 사용해요.

검증 없이 ID를 저장하지 않으며, 현재 공개 APK의 URL·크기·SHA-256·manifest가 모두 일치해야 통과해요.
