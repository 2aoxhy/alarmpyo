export type QuickTimerKeyboardFrame = {
  screenY: number;
  height: number;
};

type QuickTimerViewportFrame = {
  y: number;
  height: number;
};

export function resolveQuickTimerKeyboardInset(
  viewport: QuickTimerViewportFrame,
  keyboard: QuickTimerKeyboardFrame | null,
): number {
  if (
    !keyboard ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0 ||
    !Number.isFinite(keyboard.screenY) ||
    keyboard.screenY < 0 ||
    !Number.isFinite(keyboard.height) ||
    keyboard.height <= 0
  )
    return 0;

  // The caller must supply a display-relative viewport. Our Android Modal is
  // explicitly edge-to-edge, so its Fabric origin matches Keyboard.screenY.
  // Native adjustResize may already have removed some or all of the overlap.
  return Math.ceil(
    Math.min(
      viewport.height,
      Math.max(0, viewport.y + viewport.height - keyboard.screenY),
    ),
  );
}

export function createQuickTimerKeyboardLayoutSession({
  measureViewport,
  publishInset,
}: {
  measureViewport: (callback: (frame: QuickTimerViewportFrame) => void) => void;
  publishInset: (inset: number) => void;
}) {
  let active = true;
  let revision = 0;
  let keyboard: QuickTimerKeyboardFrame | null = null;

  function refresh() {
    if (!active) return;
    const measurementRevision = ++revision;
    if (!keyboard) {
      publishInset(0);
      return;
    }
    const measuredKeyboard = keyboard;
    measureViewport((viewport) => {
      if (!active || measurementRevision !== revision) return;
      publishInset(resolveQuickTimerKeyboardInset(viewport, measuredKeyboard));
    });
  }

  return {
    refresh,
    observeKeyboard(frame: QuickTimerKeyboardFrame | null) {
      if (!active) return;
      keyboard = frame ? { ...frame } : null;
      refresh();
    },
    dispose() {
      active = false;
      revision += 1;
    },
  };
}

export function resolveQuickTimerModalBackAction({
  android,
  busy,
  numericEntry,
  keyboardVisible,
  keyboardObserved,
  inputFocused,
  dismissRequested,
  millisecondsSinceKeyboardHide,
}: {
  android: boolean;
  busy: boolean;
  numericEntry: boolean;
  keyboardVisible: boolean;
  keyboardObserved: boolean;
  inputFocused: boolean;
  dismissRequested: boolean;
  millisecondsSinceKeyboardHide: number | null;
}): 'close' | 'dismiss-keyboard' | 'ignore' {
  if (!android) return 'close';
  if (busy) return 'ignore';
  if (!numericEntry) return 'close';

  // Some Android IMEs deliver hide and Modal's back callback for the same key.
  // Keep that callback from also discarding the numeric input; no timer is needed.
  if (
    millisecondsSinceKeyboardHide !== null &&
    millisecondsSinceKeyboardHide >= 0 &&
    millisecondsSinceKeyboardHide < 250
  )
    return 'ignore';

  if (keyboardVisible) return dismissRequested ? 'ignore' : 'dismiss-keyboard';
  if (!keyboardObserved && inputFocused && !dismissRequested) {
    return 'dismiss-keyboard';
  }
  return 'close';
}
