// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest의 Node.js 실행 환경에서 사용하는 표준 모듈이에요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('핵심 화면 탐색 계약', () => {
  it('설정 첫 화면에서 기상 시간을 바로 찾을 수 있어요', () => {
    const settings = source('src/components/settings-home.tsx');
    expect(settings).toContain('title="기상 시간"');
    expect(settings).toContain("router.push('/shift-settings?focus=wake')");
  });

  it('오늘 화면에 문구가 있는 일정 수정 버튼을 유지해요', () => {
    const today = source('src/features/today/today-hero.tsx');
    expect(today).toContain('일정 수정');
    expect(today).toContain('일정 수정하기`');
  });

  it('달력은 상단 일정 선택과 취소 동작을 함께 제공해요', () => {
    const calendarHeader = source(
      'src/features/calendar/calendar-screen-header.tsx',
    );
    expect(calendarHeader).toContain(
      "selectionMode ? '선택 취소하기' : '일정 선택하기'",
    );
    expect(calendarHeader).toContain(
      'onPress={selectionMode ? onCancelSelection : onStartSelection}',
    );
  });

  it('데이터 화면을 기본·고급·위험 작업으로 나눠요', () => {
    const dataSettings = source('src/app/data-settings.tsx');
    for (const title of [
      '근무 설정 공유',
      '백업 및 복구',
      '고급 관리',
      '위험 작업',
    ]) {
      expect(dataSettings).toContain(`title="${title}"`);
    }
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
    expect(calendarHeader).toContain(
      "label={selectionMode ? '선택 취소하기' : '일정 선택하기'}",
    );
    expect(calendarSupport).not.toContain('title="일정 선택"');
  });

  it('수면 참고 일정은 접힌 상태에서도 비의료 안내를 보여 줘요', () => {
    const sleepCard = source('src/components/sleep-timing-card.tsx');
    expect(sleepCard).toContain('수면 참고 일정');
    expect(sleepCard).toContain(
      '건강 상태를 판단하는 의료 안내가 아니에요.',
    );
  });

  it('비안드로이드에서는 위젯 지원 범위를 분명히 알려요', () => {
    const displaySettings = source('src/app/display-settings.tsx');
    expect(displaySettings).toContain(
      '홈 화면 위젯은 안드로이드에서만 지원해요.',
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

  it('개인정보 문의 이메일을 열지 못하면 주소와 후속 조치를 안내해요', () => {
    const privacy = source('src/app/privacy.tsx');
    expect(privacy).toContain('이메일 앱을 열지 못했어요');
    expect(privacy).toContain('selectable');
    expect(privacy).toContain('길게 눌러 복사');
    expect(privacy).toContain('문의 이메일 · 2aox.hy@gmail.com');
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
      '권장 취침 시각에 일반 알림으로 알려요. 무음·방해 금지 설정을 따라요.',
    );
  });
});
