import { useCallback, useState } from 'react';
import { Platform, type PressableProps } from 'react-native';

type FocusHandler = NonNullable<PressableProps['onFocus']>;
type FocusVisibleTarget = {
  matches?: (selector: string) => boolean;
};

export function targetMatchesFocusVisible(target: unknown): boolean {
  const matches = (target as FocusVisibleTarget | null)?.matches;
  if (typeof matches !== 'function') return true;

  try {
    return matches.call(target, ':focus-visible');
  } catch {
    return true;
  }
}

export function useWebFocusVisible() {
  const [focusVisible, setFocusVisible] = useState(false);

  const onFocus = useCallback<FocusHandler>((event) => {
    if (Platform.OS !== 'web') return;
    setFocusVisible(targetMatchesFocusVisible(event.currentTarget));
  }, []);

  const onBlur = useCallback<FocusHandler>(() => {
    if (Platform.OS !== 'web') return;
    setFocusVisible(false);
  }, []);

  return { focusVisible, onBlur, onFocus };
}
