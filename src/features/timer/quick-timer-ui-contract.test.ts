// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서 Node 내장 모듈을 제공해요.
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('빠른 타이머 화면 계약', () => {
  const tabs = source('src/app/(tabs)/_layout.tsx');
  const timer = source('src/app/(tabs)/timer.tsx');
  const countdown = source('src/features/timer/quick-timer-countdown.tsx');
  const settings = source('src/components/settings-home.tsx');

  it('하단 메뉴를 오늘·달력·타이머·설정 순서로 표시해요', () => {
    const today = tabs.indexOf('name="index"');
    const calendar = tabs.indexOf('name="calendar"');
    const quickTimer = tabs.indexOf('name="timer"');
    const settings = tabs.indexOf('name="settings"');

    expect(today).toBeGreaterThan(-1);
    expect(calendar).toBeGreaterThan(today);
    expect(quickTimer).toBeGreaterThan(calendar);
    expect(settings).toBeGreaterThan(quickTimer);
    expect(tabs).toContain("title: '타이머'");
    expect(tabs).toContain('resolveFloatingTabBarHorizontalLayout(windowWidth, 4)');
  });

  it('30분·60분만 제공하고 실행 중에는 교체 확인을 거쳐요', () => {
    expect(timer).toContain('QUICK_TIMER_DURATIONS.map');
    expect(timer).toContain('한 번에 하나의 타이머만 실행할 수 있습니다.');
    expect(timer).toContain('실행 중인 타이머를 변경하시겠습니까?');
    expect(timer).toContain('현재 타이머를 취소하고');
  });

  it('활성 화면에서만 monotonic 남은 시간을 갱신하고 카운트다운을 자동 낭독하지 않아요', () => {
    expect(timer).toContain('const screenActive = useScreenActive();');
    expect(timer).toContain('monotonic: performance.now()');
    expect(timer).toContain('createQuickTimerCountdownAnchor(');
    expect(timer).toContain('nextStatus.remainingMillis');
    expect(countdown).toContain('getQuickTimerRemainingMillis(');
    expect(countdown).not.toContain('status.fireAt -');
    expect(countdown).not.toContain('accessibilityLiveRegion="polite"');
    expect(countdown).toContain('getQuickTimerRemainingLabel(remainingMillis)');
  });

  it('권한 조치가 필요하면 기존 활성 타이머를 새 예약 성공으로 오인하지 않아요', () => {
    const actionRequired = timer.indexOf(
      "if (nextStatus.state === 'action-required')",
    );
    const confirmed = timer.indexOf(
      'isQuickTimerScheduleConfirmed(nextStatus, durationMinutes)',
    );

    expect(actionRequired).toBeGreaterThanOrEqual(0);
    expect(confirmed).toBeGreaterThan(actionRequired);
    expect(timer).toContain("status.state !== 'action-required'");
  });

  it('목표 시각 직후 네이티브 발화·5분 재알림 전환을 제한적으로 다시 확인해요', () => {
    expect(timer).toContain('FIRE_SETTLE_POLL_INTERVAL_MS = 750');
    expect(timer).toContain('FIRE_SETTLE_MAX_ATTEMPTS = 8');
    expect(timer).toContain('const pollSettledStatus = async () =>');
    expect(timer).toContain('await refreshStatus();');
    expect(timer).toContain('if (timeout) clearTimeout(timeout);');
    expect(timer).not.toContain('fireRefreshRef.current === status.fireAt');
  });

  it('5분 재알람은 원래 타이머 길이 대신 재알람 상태로 읽어요', () => {
    expect(timer).toContain('getQuickTimerDisplayLabel(status)');
    expect(countdown).toContain('accessibilityLabel={`${label}.');
  });

  it('지원하지 않는 플랫폼과 권한 문제를 명시적으로 안내해요', () => {
    expect(timer).toContain('지원되는 Android 설치본');
    expect(timer).toContain('actionLabel={alarmCopy.openSettings.text}');
    expect(timer).toContain('알람음·진동');
    expect(settings).toContain('소리·진동·권한');
  });

  it('큰 글자에서는 버튼을 세로로 재배치하고 최소 64dp 높이를 사용해요', () => {
    expect(timer).toContain('shouldStackQuickTimerPresets(width, fontScale)');
    expect(timer).toContain('styles.presetButtonsStacked');
    expect(timer).toContain('minHeight: 64');
    expect(countdown).toContain('maxFontSizeMultiplier={2}');
    expect(timer).toContain('resolveQuickTimerCountdownSize(width, fontScale)');
  });
});
