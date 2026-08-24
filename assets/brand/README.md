# 알람표 브랜드 마스터

로고는 목적이 다른 세 마스터에서 결정적으로 생성해요. 파생 PNG는 직접 수정하지 않아요.

- `alarmpyo-mark-master.png`: 평면 마스터. 앱 아이콘, 적응형 전경·단색 아이콘, Play 아이콘에 사용해요.
- `alarmpyo-mark-textured-master.png`: 질감 마스터. 스플래시와 Play 대표 그래픽에만 사용해요.
- `alarmpyo-mark-compact-master.png`: 소형 마스터. 두 화살표·10시 10분 바늘·주요 눈금 4개로 favicon을 만듭니다.

평면·질감 마스터는 1024×1024, 소형 마스터는 48×48 투명 8비트 RGBA PNG이며 보이는 픽셀은 순백색이어야 해요. 평면 마스터는 적응형 아이콘 안전 영역 안에 있어야 합니다. 질감·소형 마스터는 유효 외곽 72~76%, 중심 오차 0.5% 이하, 사방 여백 12% 이상, 외곽 비율 0.98~1.02를 지켜야 해요. 세 마스터는 필수이며 개발 중에도 한쪽 파일을 다른 쪽의 대체 파일로 사용하지 않습니다.

로고 기하는 외곽 화살표 두 개의 180도 회전 대칭과 10시 10분 바늘의 세로축 좌우 대칭을 픽셀 단위로 유지합니다. 독립 크기·배경별 PNG와 세 마스터는 `scripts/finalize-v19-logo.mjs` 에서 같은 대칭 마스크로 만듭니다.

```powershell
node scripts/finalize-v19-logo.mjs --flat "<평면 PNG>" --micro "<소형 PNG>" --texture "<질감 PNG>" --output "<새 산출물 폴더>"
```

산출 폴더의 `manifest.json`에 세 입력 파일의 SHA-256와 크기별 유효 외곽을 기록합니다. 스크립트는 전체 PNG를 메모리에서 생성·검증한 뒤 기존 파일을 교체하고, 쓰기 실패 시 이전 파일을 복구합니다.

Play 대표 그래픽의 `알람표` 워드마크는 저장소의 `WantedSans-ExtraBold.ttf` 실제 글리프 윤곽을 결정적으로 래스터화해요.

- 생성: `npm run assets:brand:generate`
- 원본과 파생 파일 일치 확인: `npm run assets:brand:check`
- 배경색: `#101214`
- 대표 그래픽: 1024×500, `#101214` 배경, 왼쪽 흰색 마크와 오른쪽 흰색 `알람표`
- 평면 파생 대상: 앱·적응형·단색 아이콘, Play 아이콘
- 질감 파생 대상: 스플래시, Play 대표 그래픽
- 소형 파생 대상: 48×48 웹 favicon

Play 등록 전에는 `npm run release:verify:play-store-assets`도 실행해 크기·색상 형식과 실제 스크린샷을 확인해요.
