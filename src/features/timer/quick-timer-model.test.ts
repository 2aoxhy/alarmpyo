import { describe, expect, it } from 'vitest';

import {
  clampQuickTimerDuration,
  createQuickTimerCountdownAnchor,
  formatQuickTimerCountdown,
  formatQuickTimerTarget,
  getQuickTimerActionPresentation,
  getQuickTimerDisplayLabel,
  getQuickTimerDurationStepperPresentation,
  getQuickTimerRemainingLabel,
  getQuickTimerRemainingMillis,
  getQuickTimerTargetAt,
  isQuickTimerScheduleConfirmed,
  parseQuickTimerDurationInput,
  quickTimerDurationToOffset,
  quickTimerOffsetToDuration,
  resolveQuickTimerCountdownSize,
  resolveQuickTimerPresetColumns,
  resolveQuickTimerWheelLayout,
  shouldAcceptQuickTimerWheelEvent,
  shouldStackQuickTimerActions,
} from './quick-timer-model';

describe('빠른 타이머 화면 모델', () => {
  it('네이티브 남은 시간을 monotonic 관측 시각에 고정해 기기 시각 변경과 분리해요', () => {
    const anchor = createQuickTimerCountdownAnchor(
      { active: true, remainingMillis: 5_500, state: 'scheduled' },
      4_500,
    );

    expect(getQuickTimerRemainingMillis(anchor, 4_500)).toBe(5_500);
    expect(getQuickTimerRemainingMillis(anchor, 10_100)).toBe(0);
    expect(
      createQuickTimerCountdownAnchor(
        { active: false, remainingMillis: 5_500, state: 'idle' },
        4_500,
      ).remainingMillis,
    ).toBe(0);
    expect(
      createQuickTimerCountdownAnchor(
        { active: false, remainingMillis: 5_500, state: 'paused' },
        4_500,
      ).remainingMillis,
    ).toBe(5_500);
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

  it('직접 입력은 1~60분 정수만 받고 구체적인 오류를 안내해요', () => {
    expect(parseQuickTimerDurationInput('1')).toEqual({
      valid: true,
      durationMinutes: 1,
    });
    expect(parseQuickTimerDurationInput(' 37 ')).toEqual({
      valid: true,
      durationMinutes: 37,
    });
    expect(parseQuickTimerDurationInput('60')).toEqual({
      valid: true,
      durationMinutes: 60,
    });
    expect(parseQuickTimerDurationInput('')).toMatchObject({ valid: false });
    expect(parseQuickTimerDurationInput('0')).toMatchObject({ valid: false });
    expect(parseQuickTimerDurationInput('61')).toMatchObject({ valid: false });
    expect(parseQuickTimerDurationInput('001')).toMatchObject({ valid: false });
    expect(parseQuickTimerDurationInput('99')).toMatchObject({ valid: false });
    expect(parseQuickTimerDurationInput('1.5')).toEqual({
      valid: false,
      error: '분 단위의 정수만 입력해야 합니다.',
    });
  });

  it('직접 입력과 비순환 휠의 모든 1~60분 값이 일치합니다', () => {
    for (let minutes = 1; minutes <= 60; minutes += 1) {
      expect(parseQuickTimerDurationInput(String(minutes))).toEqual({
        valid: true, durationMinutes: minutes,
      });
      for (const itemHeight of [64, 80, 104] as const) {
        expect(quickTimerOffsetToDuration(
          quickTimerDurationToOffset(minutes, itemHeight), itemHeight,
        )).toBe(minutes);
      }
    }
  });

  it('직접 입력 조절기는 현재 분과 경계를 한 번에 설명해요', () => {
    expect(getQuickTimerDurationStepperPresentation(1)).toEqual({
      durationMinutes: 1,
      accessibilityLabel: '현재 1분, 최소 1분, 최대 60분',
    });
    expect(getQuickTimerDurationStepperPresentation(60)).toMatchObject({
      durationMinutes: 60,
    });
  });

  it('스크롤 휠은 1~60분과 오프셋을 정확히 왕복 변환해요', () => {
    expect(clampQuickTimerDuration(-10)).toBe(1);
    expect(clampQuickTimerDuration(1.6)).toBe(2);
    expect(clampQuickTimerDuration(99)).toBe(60);
    expect(clampQuickTimerDuration(Number.NaN)).toBe(15);
    expect(quickTimerDurationToOffset(1, 64)).toBe(0);
    expect(quickTimerDurationToOffset(60, 64)).toBe(3_776);
    expect(quickTimerOffsetToDuration(-50, 64)).toBe(1);
    expect(quickTimerOffsetToDuration(14 * 64, 64)).toBe(15);
    expect(quickTimerOffsetToDuration(100_000, 64)).toBe(60);
  });

  it('스크롤 이벤트는 현재 보이는 휠의 같은 revision과 목표 위치만 받아요', () => {
    const currentEvent = {
      actualOffset: 896,
      currentRevision: 8,
      eventRevision: 8,
      visible: true,
      wheelActive: true,
    };
    expect(shouldAcceptQuickTimerWheelEvent(currentEvent)).toBe(true);
    expect(
      shouldAcceptQuickTimerWheelEvent({ ...currentEvent, eventRevision: 7 }),
    ).toBe(false);
    expect(
      shouldAcceptQuickTimerWheelEvent({ ...currentEvent, visible: false }),
    ).toBe(false);
    expect(
      shouldAcceptQuickTimerWheelEvent({ ...currentEvent, wheelActive: false }),
    ).toBe(false);
    expect(
      shouldAcceptQuickTimerWheelEvent({
        ...currentEvent,
        expectedOffset: 960,
      }),
    ).toBe(false);
    expect(
      shouldAcceptQuickTimerWheelEvent({
        ...currentEvent,
        actualOffset: 960.4,
        expectedOffset: 960,
      }),
    ).toBe(true);
  });

  it('일반 화면은 5행, 큰 글자나 낮은 화면은 3행, 짧은 200% 화면은 1행 휠을 사용해요', () => {
    expect(resolveQuickTimerWheelLayout(800, 1)).toEqual({
      itemHeight: 64,
      visibleItemCount: 5,
      viewportHeight: 320,
    });
    expect(resolveQuickTimerWheelLayout(699, 1)).toEqual({
      itemHeight: 64,
      visibleItemCount: 3,
      viewportHeight: 192,
    });
    expect(resolveQuickTimerWheelLayout(800, 1.4)).toEqual({
      itemHeight: 80,
      visibleItemCount: 3,
      viewportHeight: 240,
    });
    expect(resolveQuickTimerWheelLayout(800, 2)).toEqual({
      itemHeight: 104,
      visibleItemCount: 3,
      viewportHeight: 312,
    });
    expect(resolveQuickTimerWheelLayout(568, 2)).toEqual({
      itemHeight: 104,
      visibleItemCount: 1,
      viewportHeight: 104,
    });
    expect(resolveQuickTimerWheelLayout(699, 2)).toEqual({
      itemHeight: 104,
      visibleItemCount: 1,
      viewportHeight: 104,
    });
  });

  it('숫자 직접 입력 중에는 키보드가 안내 문구를 가리지 않도록 휠을 1행으로 줄여요', () => {
    expect(resolveQuickTimerWheelLayout(800, 1, true)).toEqual({
      itemHeight: 64,
      visibleItemCount: 1,
      viewportHeight: 64,
    });
    expect(resolveQuickTimerWheelLayout(800, 2, true)).toEqual({
      itemHeight: 104,
      visibleItemCount: 1,
      viewportHeight: 104,
    });
  });

  it('1분 이상은 올림한 분으로, 1분 미만은 초로 표시합니다', () => {
    expect(formatQuickTimerCountdown(30 * 60_000)).toBe('30분 남음');
    expect(formatQuickTimerCountdown(3_600_001)).toBe('61분 남음');
    expect(formatQuickTimerCountdown(59_001)).toBe('60초 남음');
    expect(formatQuickTimerCountdown(-1)).toBe('0초 남음');
    expect(getQuickTimerRemainingLabel(3_661_000)).toBe('62분 남음');
  });

  it('5분 재알람은 원래 타이머 길이로 오인되지 않게 표시해요', () => {
    expect(
      getQuickTimerDisplayLabel({
        durationMinutes: 60,
        isRepeat: true,
        state: 'scheduled',
      }),
    ).toBe('타이머 다시 울림');
    expect(
      getQuickTimerDisplayLabel({
        durationMinutes: 45,
        isRepeat: false,
        state: 'scheduled',
      }),
    ).toBe('45분 타이머');
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

  it('타이머 행동 버튼은 좁은 화면과 큰 글자에서 세로로 배치해요', () => {
    expect(shouldStackQuickTimerActions(320, 1)).toBe(true);
    expect(shouldStackQuickTimerActions(412, 1.3)).toBe(true);
    expect(shouldStackQuickTimerActions(412, 1)).toBe(false);
  });

  it('프리셋은 일반 휴대폰 2열, 큰 글자 1열, 넓은 화면 4열이에요', () => {
    expect(resolveQuickTimerPresetColumns(320, 1)).toBe(2);
    expect(resolveQuickTimerPresetColumns(360, 1.3)).toBe(2);
    expect(resolveQuickTimerPresetColumns(412, 1)).toBe(2);
    expect(resolveQuickTimerPresetColumns(412, 1.4)).toBe(1);
    expect(resolveQuickTimerPresetColumns(500, 1)).toBe(4);
    expect(resolveQuickTimerPresetColumns(768, 1.3)).toBe(4);
    expect(resolveQuickTimerPresetColumns(768, 1.4)).toBe(1);
  });

  it('320dp의 200% 글자에서도 카운트다운 숫자가 한 줄에 들어와요', () => {
    expect(resolveQuickTimerCountdownSize(320, 2)).toBe(21);
    expect(resolveQuickTimerCountdownSize(320, 3)).toBe(21);
    expect(resolveQuickTimerCountdownSize(412, 2)).toBe(30);
    expect(resolveQuickTimerCountdownSize(412, 1)).toBe(48);
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
