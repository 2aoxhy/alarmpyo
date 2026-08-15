import { describe, expect, it } from 'vitest';

import {
  createQuickTimerCountdownAnchor,
  formatQuickTimerCountdown,
  formatQuickTimerTarget,
  getQuickTimerActionPresentation,
  getQuickTimerDisplayLabel,
  getQuickTimerRemainingLabel,
  getQuickTimerRemainingMillis,
  getQuickTimerTargetAt,
  isQuickTimerScheduleConfirmed,
  resolveQuickTimerCountdownSize,
  shouldStackQuickTimerPresets,
} from './quick-timer-model';

describe('빠른 타이머 화면 모델', () => {
  it('네이티브 남은 시간을 monotonic 관측 시각에 고정해 기기 시각 변경과 분리해요', () => {
    const anchor = createQuickTimerCountdownAnchor(
      { active: true, remainingMillis: 5_500 },
      4_500,
    );

    expect(getQuickTimerRemainingMillis(anchor, 4_500)).toBe(5_500);
    expect(getQuickTimerRemainingMillis(anchor, 10_100)).toBe(0);
    expect(
      createQuickTimerCountdownAnchor(
        { active: false, remainingMillis: 5_500 },
        4_500,
      ).remainingMillis,
    ).toBe(0);
    expect(getQuickTimerTargetAt(5_500, 100_000)).toBe(105_500);
  });

  it('요청한 일반 타이머가 실제로 새로 예약된 경우만 성공으로 판정해요', () => {
    const scheduled = {
      active: true,
      durationMinutes: 30 as const,
      isRepeat: false,
      state: 'scheduled' as const,
    };

    expect(isQuickTimerScheduleConfirmed(scheduled, 30)).toBe(true);
    expect(isQuickTimerScheduleConfirmed(scheduled, 60)).toBe(false);
    expect(
      isQuickTimerScheduleConfirmed(
        { ...scheduled, state: 'action-required' },
        30,
      ),
    ).toBe(false);
    expect(isQuickTimerScheduleConfirmed({ ...scheduled, isRepeat: true }, 30)).toBe(
      false,
    );
  });

  it('남은 시간을 시·분·초와 접근성 문구로 표시해요', () => {
    expect(formatQuickTimerCountdown(30 * 60_000)).toBe('00:30:00');
    expect(formatQuickTimerCountdown(3_600_001)).toBe('01:00:01');
    expect(formatQuickTimerCountdown(-1)).toBe('00:00:00');
    expect(getQuickTimerRemainingLabel(3_661_000)).toBe('1시간 1분 1초 남음');
  });

  it('5분 재알람은 원래 30분·60분 길이로 오인되지 않게 표시해요', () => {
    expect(
      getQuickTimerDisplayLabel({
        durationMinutes: 60,
        isRepeat: true,
        state: 'scheduled',
      }),
    ).toBe('타이머 다시 울림');
    expect(
      getQuickTimerDisplayLabel({
        durationMinutes: 30,
        isRepeat: true,
        state: 'ringing',
      }),
    ).toBe('타이머가 다시 울리고 있습니다');
    expect(
      getQuickTimerDisplayLabel({
        durationMinutes: 30,
        isRepeat: false,
        state: 'scheduled',
      }),
    ).toBe('30분 타이머');
  });

  it('자정을 넘긴 목표 시각은 내일로 명확히 표시해요', () => {
    const now = new Date(2026, 7, 15, 23, 45).getTime();
    const fireAt = new Date(2026, 7, 16, 0, 15).getTime();

    expect(formatQuickTimerTarget(fireAt, now)).toBe('내일 오전 12:15');
  });

  it('좁은 화면과 큰 글자에서는 30분·60분 버튼을 세로로 배치해요', () => {
    expect(shouldStackQuickTimerPresets(320, 1)).toBe(true);
    expect(shouldStackQuickTimerPresets(412, 1.3)).toBe(true);
    expect(shouldStackQuickTimerPresets(412, 1)).toBe(false);
  });

  it('320dp의 200% 글자에서도 카운트다운 숫자가 한 줄에 들어와요', () => {
    expect(resolveQuickTimerCountdownSize(320, 2)).toBe(21);
    expect(resolveQuickTimerCountdownSize(320, 3)).toBe(21);
    expect(resolveQuickTimerCountdownSize(412, 2)).toBe(30);
    expect(resolveQuickTimerCountdownSize(412, 1)).toBe(34);
  });

  it('필요한 권한별로 한 가지 해결 안내를 제공해요', () => {
    expect(getQuickTimerActionPresentation('exact-alarm')?.title).toContain(
      '정확한 알람',
    );
    expect(getQuickTimerActionPresentation('notifications')?.title).toContain(
      '알림',
    );
    expect(getQuickTimerActionPresentation('full-screen')?.title).toContain(
      '전체 화면',
    );
    expect(getQuickTimerActionPresentation('none')).toBeNull();
  });
});
