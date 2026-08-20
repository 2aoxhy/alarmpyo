// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('핵심 화면 탐색 계약', () => {
  it('설정 첫 화면을 핵심 네 항목으로 줄이고 세부 관리는 하위 화면에 모아요', () => {
    const settings = source('src/components/settings-home.tsx');
    const appManagement = source('src/app/app-management.tsx');

    expect(settings.match(/<ListRow/gu)).toHaveLength(4);
    expect(settings).toContain('title="근무표 설정"');
    expect(settings).toContain("router.push('/shift-settings')");
    expect(settings).toContain('title="홈 화면 위젯"');
    expect(settings).toContain('title="데이터·앱 정보"');
    expect(settings).not.toContain('title="기상 시간"');
    expect(settings).toContain('formatSettingsWorkSummary(');
    for (const title of [
      '데이터 관리',
      'Google Play 업데이트',
      '개인정보 처리방침',
    ]) {
      expect(appManagement).toContain(title);
    }
  });

  it('좁은 화면의 목록 설명은 자연스럽게 흐르고 하단 메뉴 안전 여백을 덮어쓰지 않아요', () => {
    const uiKit = source('src/components/ui-kit.tsx');
    const contentStyle = uiKit.indexOf('contentStyle,');
    const protectedBottomSpacing = uiKit.indexOf(
      ': { paddingBottom: floatingTabBarContentOffset },',
      contentStyle,
    );

    expect(uiKit).toContain(
      'allowSubtitleWrapping || reflow || fontScale >= 1.3 ? undefined : 2',
    );
    expect(contentStyle).toBeGreaterThan(-1);
    expect(protectedBottomSpacing).toBeGreaterThan(contentStyle);
  });

  it('근무 방식 개요는 시작일과 기준일 근무를 반복해서 보여 주지 않아요', () => {
    const overview = source(
      'src/features/shift-settings/work-pattern-overview.tsx',
    );

    expect(overview).not.toContain('label="일정 적용 시작일"');
    expect(overview).not.toContain('overview.referenceShiftLabel');
    expect(overview).toContain('label="근무 방식 수정하기"');
  });

  it('오늘 화면에 문구가 있는 일정 수정 버튼을 유지해요', () => {
    const today = source('src/features/today/today-hero.tsx');
    expect(today).toContain('일정 수정');
    expect(today).toContain('일정 수정하기`');
  });

  it('달력은 상단에서 선택을 시작하고 취소는 선택 패널에만 둡니다', () => {
    const calendarHeader = source(
      'src/features/calendar/calendar-screen-header.tsx',
    );
    expect(calendarHeader).toContain('label="선택"');
    expect(calendarHeader).toContain('onPress={onStartSelection}');
    expect(calendarHeader).toContain('supportsDragSelection');
    expect(calendarHeader).not.toContain('onCancelSelection');
  });

  it('데이터 화면을 기본·고급·위험 작업으로 나눠요', () => {
    const dataSettings = source('src/app/data-settings.tsx');
    for (const title of [
      '근무 설정 공유',
      '고급 관리',
      '위험 작업',
    ]) {
      expect(dataSettings).toContain(`title="${title}"`);
    }
    expect(dataSettings).toContain('title={dataCopy.backupSection.text}');
  });

  it('접힌 고급 백업은 처음 펼칠 때만 조회하고 데이터 화면은 액션만 구독해요', () => {
    const dataSettings = source('src/app/data-settings.tsx');

    expect(dataSettings).toContain('useAppStoreActions()');
    expect(dataSettings).not.toContain('useAppStore()');
    expect(dataSettings).toContain('backupLookupStartedRef.current');
    expect(dataSettings).toContain(
      'if (nextExpanded && !backupLookupStartedRef.current)',
    );
    expect(dataSettings).toContain('onPress={toggleAdvancedBackup}');
    expect(dataSettings).toContain('refreshBackupIfLoaded();');
  });

  it('데이터 초기화는 후속 알람 정리 실패를 완전 성공으로 표시하지 않아요', () => {
    const dataSettings = source('src/app/data-settings.tsx');

    expect(dataSettings).toContain('resetAllDataDetailed');
    expect(dataSettings).toContain("result.status === 'partial'");
    expect(dataSettings).toContain('초기화 후 확인이 필요합니다');
    expect(dataSettings).toContain('휴대폰 밖에 저장한 백업 파일은 지우지 않으며');
  });

  it('오늘 화면은 날짜를 화면 제목으로 안내해요', () => {
    const today = source('src/app/(tabs)/index.tsx');
    expect(today).toContain(
      'accessibilityLabel={`오늘, ${formatKoreanDate(today, true)}`}',
    );
    expect(today).toContain('accessibilityRole="header"');
  });

  it('달력의 일정 선택은 상단에서 한 번만 제공해요', () => {
    const calendarHeader = source(
      'src/features/calendar/calendar-screen-header.tsx',
    );
    const calendarSupport = source(
      'src/features/calendar/calendar-support-sections.tsx',
    );
    expect(calendarHeader).toContain('label="선택"');
    expect(calendarHeader).not.toContain('선택 취소');
    expect(calendarSupport).not.toContain('title="일정 선택"');
  });

  it('달력 메뉴는 이달 요약과 달력 내보내기를 보여 주지 않아요', () => {
    const calendar = source('src/app/(tabs)/calendar.tsx');
    const calendarSupport = source(
      'src/features/calendar/calendar-support-sections.tsx',
    );

    expect(calendarSupport).not.toContain('title="이달 요약"');
    expect(calendarSupport).not.toContain('title="달력 내보내기"');
    expect(calendarSupport).toContain('accessibilityLabel="달력 표시 안내 열기"');
    expect(calendarSupport).toContain('표시 안내');
    expect(calendar).toContain('<AppSheet');
    expect(calendar).toContain('<CalendarLegend');
    expect(calendar).toContain('visible={legendOpen}');
    expect(calendarSupport).not.toContain('legendExpanded ?');
  });

  it('좁은 달력은 주차 목록을 사용하고 월 경계는 한 번만 알립니다', () => {
    const calendar = source('src/app/(tabs)/calendar.tsx');
    const monthCard = source('src/features/calendar/calendar-month-card.tsx');

    expect(monthCard).toContain('<CalendarWeekList');
    expect(monthCard).not.toContain('ScrollView');
    expect(monthCard).not.toContain('accessibilityLiveRegion="polite"');
    expect(calendar).toContain('lastAnnouncedMonthBoundaryRef');
    expect(calendar).toContain('shouldAnnounceCalendarMonthBoundary');
    expect(calendar).toContain('`${formatMonthTitle(next.year, next.month)}로 이동하고 오늘 날짜를 강조했습니다.`');
    expect(calendar).toContain("'오늘 날짜를 강조했습니다.'");
  });

  it('홈 화면 위젯 설정은 조작할 수 없는 테마 안내를 반복하지 않아요', () => {
    const settings = source('src/components/settings-home.tsx');
    const displaySettings = source('src/app/display-settings.tsx');
    const themeProvider = source('src/providers/app-theme-provider.tsx');

    expect(settings).toContain('title="홈 화면 위젯"');
    expect(settings).toContain('subtitle="위젯 정보·추가"');
    expect(displaySettings).toContain("title: '홈 화면 위젯'");
    expect(displaySettings).not.toContain(
      '<AppText accessibilityRole="header" variant="heading">홈 화면 위젯',
    );
    expect(displaySettings).not.toContain('화면 테마');
    expect(displaySettings).not.toContain('다크 테마만 사용해요');
    expect(displaySettings).not.toContain('SegmentedControl');
    expect(displaySettings).not.toContain("value: 'light'");
    expect(themeProvider).toContain("mode: 'dark'");
    expect(themeProvider).toContain("Appearance.setColorScheme('dark')");
    expect(themeProvider).toContain("document.documentElement.style.colorScheme = 'dark'");
    expect(themeProvider).not.toContain('useColorScheme');
    expect(themeProvider).not.toContain('lightPalette');
  });

  it('설정 하위 화면은 네이티브 제목을 본문에서 반복하지 않아요', () => {
    const appManagement = source('src/app/app-management.tsx');
    const privacy = source('src/app/privacy.tsx');

    expect(appManagement.match(/데이터·앱 정보/gu)).toHaveLength(1);
    expect(privacy.match(/개인정보 처리방침/gu)).toHaveLength(1);
  });

  it('긴 화면과 웹 날짜 입력은 스크롤·키보드 포커스 단서를 보여 줘요', () => {
    const uiKit = source('src/components/ui-kit.tsx');
    const datePicker = source('src/components/date-picker-field.web.tsx');
    const nativeDatePicker = source('src/components/date-picker-field.tsx');

    expect(uiKit).toContain("showsVerticalScrollIndicator = Platform.OS !== 'web'");
    expect(uiKit).toContain(
      'showsVerticalScrollIndicator={showsVerticalScrollIndicator}',
    );
    expect(datePicker).toContain('pickerFocused');
    expect(datePicker).toContain('manualEntryFocused && styles.inputFocused');
    expect(datePicker).toContain('outlineColor: palette.indigo');
    expect(datePicker).toContain("colorScheme: 'dark'");
    expect(nativeDatePicker).toContain('themeVariant="dark"');
    expect(nativeDatePicker).not.toContain("'light'");
  });

  it('날짜·시간 설정과 업데이트 요약을 구체적인 이름과 의미로 안내해요', () => {
    const additional = source(
      'src/features/day-editor/additional-settings-section.tsx',
    );
    const shiftSettings = source('src/app/shift-settings.tsx');
    const playUpdate = source('src/features/update/play-app-update-screen.tsx');

    expect(additional).toContain('title="특별 일정·시간·알람·메모"');
    const pattern = shiftSettings.indexOf('title="근무 방식"');
    const time = shiftSettings.indexOf('title="근무 시간"');
    const routine = shiftSettings.indexOf('title="기상·출근 루틴"');
    expect(pattern).toBeGreaterThan(-1);
    expect(time).toBeGreaterThan(pattern);
    expect(routine).toBeGreaterThan(time);
    expect(playUpdate).toContain('accessibilityRole="header"');
    expect(playUpdate).not.toContain(
      'accessibilityLabel="Google Play에서 업데이트합니다.',
    );
  });

  it('출근 루틴은 교대를 시작 시각이 아니라 완료 시각으로 안내해요', () => {
    const timingEditor = source(
      'src/features/shift-settings/routine-timing-editor.tsx',
    );
    const routinePanel = source('src/components/work-routine-panel.tsx');

    expect(timingEditor).toContain("label: '교대 완료'");
    expect(timingEditor).toContain('교대 완료`}');
    expect(routinePanel).toContain('까지 교대를 마치는 일정입니다.');
    expect(routinePanel).not.toContain('교대에 맞춘 일정이에요.');
  });

  it('수면 참고 일정은 접힌 상태에서도 비의료 안내를 보여 줘요', () => {
    const sleepCard = source('src/components/sleep-timing-card.tsx');
    expect(sleepCard).toContain('수면 참고 일정');
    expect(sleepCard).toContain(
      '건강 상태를 판단하는 의료 안내가 아닙니다.',
    );
  });

  it('비안드로이드에서는 위젯 지원 범위를 분명히 알려요', () => {
    const displaySettings = source('src/app/display-settings.tsx');
    expect(displaySettings).toContain(
      '홈 화면 위젯은 안드로이드에서만 지원합니다.',
    );
    expect(displaySettings).toContain('disabled={!androidWidgetSupported}');
  });

  it('달력과 위젯의 명령형 문구를 하세요체로 통일해요', () => {
    const calendar = source('src/app/(tabs)/calendar.tsx');
    const displaySettings = source('src/app/display-settings.tsx');
    for (const screen of [calendar, displaySettings]) {
      expect(screen).not.toContain('해 주세요');
    }
  });

  it('달력 복구 동작은 자연스러운 되돌리기 용어를 사용해요', () => {
    const calendar = source('src/app/(tabs)/calendar.tsx');
    expect(calendar).toContain('기본 근무표로 되돌리기');
    expect(calendar).not.toContain('원복');
  });

  it('개인정보 문의는 개인 주소를 노출하지 않고 공개 연락 경로를 안내해요', () => {
    const privacy = source('src/app/privacy.tsx');
    expect(privacy).toContain('앱을 설치한 스토어의 개발자 연락처');
    expect(privacy).toContain('비공개 보안 신고 기능');
    expect(privacy).not.toContain('mailto:');
    expect(privacy).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  });

  it('수면 안내는 권장이 아닌 참고 일정으로 일관되게 표시해요', () => {
    const sleepCard = source('src/components/sleep-timing-card.tsx');
    expect(sleepCard).not.toContain('권장 취침');
    expect(sleepCard).not.toContain('권장 시간');
    expect(sleepCard).toContain('참고 취침');
  });

  it('알람 화면에서 수면 시작 알림의 전달 방식을 바로 확인하고 바꿔요', () => {
    const alarmSettings = source('src/app/alarm-settings.tsx');
    const sleepReminderToggle = source(
      'src/features/alarm/sleep-reminder-toggle.tsx',
    );

    expect(alarmSettings).toContain('<SleepReminderToggle');
    expect(alarmSettings).toContain('setSleepReminderEnabled');
    expect(sleepReminderToggle).toContain('title="수면 시작 알림"');
    expect(sleepReminderToggle).toContain(
      '참고 취침 시각에 일반 알림으로 알립니다.',
    );
  });

  it('알람 화면은 수면 계획 손상·복구 상태와 접근 가능한 재시도를 보여 줘요', () => {
    const alarmSettings = source('src/app/alarm-settings.tsx');
    const statusBanner = source('src/design-system/status-banner.tsx');

    expect(alarmSettings).toContain('sleepReminderStatus,');
    expect(alarmSettings).toContain("accessSummary.action === 'retry-sleep-reminders'");
    expect(alarmSettings).toContain("accessSummary.action === 'open-sleep-settings'");
    expect(alarmSettings).toContain('retrySleepReminderStorage');
    expect(alarmSettings).toContain('announceChanges');
    expect(statusBanner).toContain('accessibilityLiveRegion={liveRegion}');
    expect(statusBanner).toContain('previousAnnouncementKeyRef');
    expect(statusBanner).toContain('accessibilityRole="button"');
    expect(statusBanner).toContain('accessibilityLabel={actionLabel}');
  });

  it('오늘 화면만 활성 상태에서 수면 알림 건강 상태를 확인하고 설정 루트는 조회하지 않아요', () => {
    const today = source('src/app/(tabs)/index.tsx');
    const todayRuntime = source('src/features/today/use-today-runtime-controller.ts');
    const settings = source('src/components/settings-home.tsx');

    expect(todayRuntime).toContain('useAlarmRuntimeStatus');
    expect(today).toContain('useTodayRuntimeController');
    expect(today).toContain('data.settings.sleepReminderEnabled');
    expect(today).toContain('sleepReminderStatusError');
    expect(settings).not.toContain('getAlarmPyoSleepReminderStatus');
    expect(settings).not.toContain('getAlarmPyoAlarmStatus');
  });
});
