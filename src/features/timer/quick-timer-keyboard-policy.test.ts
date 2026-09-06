import { describe, expect, it, vi } from 'vitest';

import {
  createQuickTimerKeyboardLayoutSession,
  resolveQuickTimerKeyboardInset,
  resolveQuickTimerModalBackAction,
} from './quick-timer-keyboard-policy';

describe('타이머 Android 키보드 영역', () => {
  it('edge-to-edge 모달은 상태 표시줄 높이를 빼지 않는 화면 원점을 사용합니다', () => {
    // The visible header is inset by SafeAreaView; the measured outer viewport
    // still starts at display y=0, including the 24dp status bar area.
    expect(resolveQuickTimerKeyboardInset(
      { y: 0, height: 804 },
      { screenY: 460, height: 344 },
    )).toBe(344);
    expect(resolveQuickTimerKeyboardInset(
      { y: 0, height: 460 },
      { screenY: 460, height: 344 },
    )).toBe(0);
  });

  it('창이 줄어들지 않으면 IME와 겹친 부분만 확보합니다', () => {
    expect(
      resolveQuickTimerKeyboardInset(
        { y: 24, height: 780 },
        { screenY: 460, height: 344 },
      ),
    ).toBe(344);
  });

  it('adjustResize가 이미 확보한 여백을 다시 더하지 않습니다', () => {
    expect(
      resolveQuickTimerKeyboardInset(
        { y: 24, height: 436 },
        { screenY: 460, height: 344 },
      ),
    ).toBe(0);
    expect(
      resolveQuickTimerKeyboardInset(
        { y: 24, height: 480 },
        { screenY: 460, height: 344 },
      ),
    ).toBe(44);
  });

  it('소수점 겹침은 올리고 사라진 키보드나 잘못된 프레임은 제외합니다', () => {
    expect(
      resolveQuickTimerKeyboardInset(
        { y: 24, height: 780 },
        { screenY: 460.5, height: 343.5 },
      ),
    ).toBe(344);
    for (const keyboard of [
      null,
      { screenY: -1, height: 344 },
      { screenY: 0, height: 0 },
      { screenY: NaN, height: 300 },
    ]) {
      expect(
        resolveQuickTimerKeyboardInset({ y: 24, height: 780 }, keyboard),
      ).toBe(0);
    }
    expect(
      resolveQuickTimerKeyboardInset(
        { y: NaN, height: 780 },
        { screenY: 460, height: 344 },
      ),
    ).toBe(0);
  });

  function makeSession() {
    const measurements: ((frame: { y: number; height: number }) => void)[] = [];
    const publishInset = vi.fn();
    const session = createQuickTimerKeyboardLayoutSession({
      measureViewport: (callback) => {
        measurements.push(callback);
      },
      publishInset,
    });
    return { measurements, publishInset, session };
  }

  it('회전·창 크기 변경 뒤에 도착한 이전 측정은 폐기합니다', () => {
    const { measurements, publishInset, session } = makeSession();
    session.observeKeyboard({ screenY: 460, height: 344 });
    session.refresh();
    measurements[1]({ y: 24, height: 436 });
    measurements[0]({ y: 24, height: 780 });
    expect(publishInset.mock.calls).toEqual([[0]]);
  });

  it('키보드 높이 변경은 최신 값으로만 반영합니다', () => {
    const { measurements, publishInset, session } = makeSession();
    session.observeKeyboard({ screenY: 460, height: 344 });
    session.observeKeyboard({ screenY: 400, height: 404 });
    measurements[0]({ y: 24, height: 780 });
    measurements[1]({ y: 24, height: 780 });
    expect(publishInset.mock.calls).toEqual([[404]]);
  });

  it('키보드 숨김 뒤의 늦은 측정이 여백을 복원하지 않습니다', () => {
    const { measurements, publishInset, session } = makeSession();
    session.observeKeyboard({ screenY: 460, height: 344 });
    session.observeKeyboard(null);
    measurements[0]({ y: 24, height: 780 });
    expect(publishInset.mock.calls).toEqual([[0]]);
  });

  it('모달 닫기·언마운트 뒤에는 어떤 측정이나 이벤트도 반영하지 않습니다', () => {
    const { measurements, publishInset, session } = makeSession();
    session.observeKeyboard({ screenY: 460, height: 344 });
    session.dispose();
    measurements[0]({ y: 24, height: 780 });
    session.observeKeyboard(null);
    session.refresh();
    expect(publishInset).not.toHaveBeenCalled();
    expect(measurements).toHaveLength(1);
  });
});

describe('타이머 Android 뒤로가기', () => {
  const numericKeyboard = {
    android: true,
    busy: false,
    numericEntry: true,
    keyboardVisible: true,
    keyboardObserved: true,
    inputFocused: true,
    dismissRequested: false,
    millisecondsSinceKeyboardHide: null,
  };

  it('첫 뒤로가기는 입력값을 확정하거나 닫지 않고 키보드만 닫습니다', () => {
    expect(resolveQuickTimerModalBackAction(numericKeyboard)).toBe(
      'dismiss-keyboard',
    );
    expect(
      resolveQuickTimerModalBackAction({
        ...numericKeyboard,
        dismissRequested: true,
      }),
    ).toBe('ignore');
  });

  it('IME 숨김과 같은 back의 콜백이 겹쳐도 모달은 남습니다', () => {
    expect(
      resolveQuickTimerModalBackAction({
        ...numericKeyboard,
        keyboardVisible: false,
        millisecondsSinceKeyboardHide: 20,
      }),
    ).toBe('ignore');
    expect(
      resolveQuickTimerModalBackAction({
        ...numericKeyboard,
        keyboardVisible: false,
        millisecondsSinceKeyboardHide: 250,
      }),
    ).toBe('close');
  });

  it('키보드 표시 이벤트보다 back이 먼저 와도 입력 초점을 보호합니다', () => {
    expect(
      resolveQuickTimerModalBackAction({
        ...numericKeyboard,
        keyboardVisible: false,
        keyboardObserved: false,
      }),
    ).toBe('dismiss-keyboard');
  });

  it('이미 숨긴 키보드의 남은 입력 초점은 다음 닫기를 막지 않습니다', () => {
    expect(
      resolveQuickTimerModalBackAction({
        ...numericKeyboard,
        keyboardVisible: false,
        millisecondsSinceKeyboardHide: 500,
      }),
    ).toBe('close');
  });

  it('휠·iOS·웹은 기존 닫기를 유지하고 저장 중에는 닫지 않습니다', () => {
    expect(
      resolveQuickTimerModalBackAction({
        ...numericKeyboard,
        numericEntry: false,
      }),
    ).toBe('close');
    expect(
      resolveQuickTimerModalBackAction({ ...numericKeyboard, android: false }),
    ).toBe('close');
    expect(
      resolveQuickTimerModalBackAction({ ...numericKeyboard, android: false, busy: true }),
    ).toBe('close');
    expect(
      resolveQuickTimerModalBackAction({ ...numericKeyboard, busy: true }),
    ).toBe('ignore');
  });
});
