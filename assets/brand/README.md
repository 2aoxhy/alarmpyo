# 알람표 브랜드 마스터

`alarmpyo-mark-master.png`가 로고 마크의 단일 원본이에요. 1024×1024 투명 RGBA 캔버스에 순백색 알람·달력 겹침 마크만 두며, 파생 PNG는 직접 수정하지 않아요. Play 대표 그래픽의 `알람표` 워드마크는 저장소의 `WantedSans-ExtraBold.ttf` 실제 글리프 윤곽을 결정적으로 래스터화해요.

- 생성: `npm run assets:brand:generate`
- 원본과 파생 파일 일치 확인: `npm run assets:brand:check`
- 배경색: `#101214`
- 대표 그래픽: 1024×500, `#101214` 배경, 왼쪽 흰색 마크와 오른쪽 흰색 `알람표`
- 파생 대상: 앱·적응형·단색·스플래시 아이콘, 48×48 웹 favicon, Play 아이콘과 대표 그래픽

Play 등록 전에는 `npm run release:verify:play-store-assets`도 실행해 크기·색상 형식과 실제 스크린샷을 확인해요.
