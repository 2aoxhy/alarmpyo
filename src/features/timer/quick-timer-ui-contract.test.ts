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
  const stepper = source('src/features/timer/quick-timer-duration-stepper.tsx');
  const controller = source('src/features/timer/quick-timer-controller.ts');
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
    expect(tabs).toContain('detachInactiveScreens');
  });

  it('15분·30분·45분·직접 입력을 제공하고 실행 중에는 교체 확인을 거칩니다', () => {
    expect(timer).toContain('quickTimerController.durations.map');
    expect(controller).toContain('QUICK_TIMER_DURATIONS');
    expect(timer).toContain('label="직접 입력"');
    expect(timer).toContain('<QuickTimerDurationStepper');
    expect(timer).toContain('onSubmit={submitCustomDuration}');
    expect(timer).not.toContain('label="60분"');
    expect(timer).toContain('한 번에 1개만 실행');
    expect(timer).toContain('`${durationMinutes}분으로 변경`');
    expect(timer).toContain('현재 타이머를 취소하고');
  });

  it('실행 중에는 일시정지·초기화, 일시정지 중에는 재개를 제공합니다', () => {
    expect(timer).toContain("status.state === 'paused'");
    expect(timer).toContain('quickTimerController.pause()');
    expect(timer).toContain('quickTimerController.resume()');
    expect(timer).toContain('quickTimerController.reset()');
    expect(timer).toContain("label={paused ? '타이머 재개' : '일시정지'}");
    expect(timer).toContain("label={ringing ? '타이머 종료' : '초기화'}");
    expect(countdown).toContain('재개하면 남은 시간부터 다시 시작합니다.');
    expect(countdown).toContain('paused\n    ? anchor.remainingMillis');
    expect(countdown).toContain('if (!active || !screenActive) return;');
  });

  it('화면은 네이티브 서비스 대신 기능 controller만 사용합니다', () => {
    expect(timer).not.toContain("@/services/quick-timer-service");
    expect(timer).toContain("@/features/timer/quick-timer-controller");
    expect(controller).toContain("from '../../services/quick-timer-service'");
    expect(controller).toContain('createQuickTimerController');
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
    expect(countdown).toContain('`${label}. 일시정지했습니다.');
    expect(countdown).toContain('`${label}. ${formatQuickTimerTarget(');
  });

  it('지원하지 않는 플랫폼과 권한 문제를 명시적으로 안내해요', () => {
    expect(timer).toContain('Android 설치본에서만');
    expect(timer).toContain('actionLabel={alarmCopy.openSettings.text}');
    expect(timer).toContain('알람음·진동');
    expect(settings).toContain('근무표와 알람');
  });

  it('프리셋은 화면 폭과 글자 크기에 따라 1·2·4열로 재배치해요', () => {
    expect(timer).toContain('shouldStackQuickTimerActions(width, fontScale)');
    expect(timer).toContain('resolveQuickTimerPresetColumns(width, fontScale)');
    expect(timer).toContain('styles.presetButtonFull');
    expect(timer).toContain('styles.presetButtonHalf');
    expect(timer).toContain('styles.presetButtonQuarter');
    expect(timer).toContain("flexWrap: 'wrap'");
    expect(timer).toContain('minHeight: 64');
    expect(timer).toContain('elementRef={directInputButtonRef}');
    expect(timer).toContain('restoreDirectInputFocus');
    expect(timer).toContain('customDurationInitialMinutes');
    expect(timer).not.toContain('key={`${customDurationOpen}');
    expect(countdown).toContain('maxFontSizeMultiplier={2}');
    expect(timer).toContain('resolveQuickTimerCountdownSize(width, fontScale)');
  });

  it('직접 입력은 1~60분 비순환 세로 휠과 하나의 접근성 조절기를 제공해요', () => {
    expect(stepper).toContain('presentationStyle="fullScreen"');
    expect(stepper).toContain('onRequestClose={onCancel}');
    expect(stepper).toContain('<FlatList');
    expect(stepper).toContain('snapToInterval={wheelLayout.itemHeight}');
    expect(stepper).toContain('disableIntervalMomentum');
    expect(stepper).toContain('quickTimerOffsetToDuration(');
    expect(stepper).toContain('quickTimerDurationToOffset(');
    expect(stepper).toContain('accessibilityRole="adjustable"');
    expect(stepper).toContain("actionName === 'increment'");
    expect(stepper).toContain("actionName === 'decrement'");
    expect(stepper).toContain('importantForAccessibility="no-hide-descendants"');
    expect(stepper).toContain('quick-timer-stepper-start');
    expect(stepper).toContain('accessibilityViewIsModal');
    expect(stepper).toContain("from 'react-native-safe-area-context'");
    expect(stepper).toContain('includeFontPadding: false');
    expect(stepper).toContain('wasVisibleRef');
    expect(stepper).not.toContain('<ScrollView');
    expect(stepper).not.toContain('quick-timer-adjust-');
    expect(stepper).not.toContain('초');
    expect(stepper).not.toContain('00시');
  });

  it('공통 버튼은 아이콘과 문구를 같은 기준선의 콘텐츠 묶음에 배치해요', () => {
    const button = source('src/design-system/button.tsx');

    expect(button).toContain('style={styles.content}');
    expect(button).toContain('style={styles.iconSlot}');
    expect(button).toContain('includeFontPadding: false');
    expect(button).toContain("alignItems: 'center'");
    expect(button).not.toContain('minWidth: size.regularControl');
  });

  it('상태 관측 revision으로 오래된 조회가 새 작업 결과를 덮지 않아요', () => {
    expect(timer).toContain('observationRevisionRef');
    expect(timer).toContain('observationRevision !== observationRevisionRef.current');
    expect(timer).toContain('actionRevisionRef');
    expect(timer).toContain("claimTimerAction('schedule')");
    expect(timer).toContain('releaseTimerAction(observationRevision)');
    expect(timer).toContain('actionRevisionRef.current !== null');
  });
});
