import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ButtonProps } from '@/design-system';

import { QuickTimerPresets } from './quick-timer-presets';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useMemo: <T,>(factory: () => T) => factory(),
}));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('@/design-system', () => ({
  Button: 'Button',
  space: { sm: 8 },
}));

function buttonProps(node: ReactNode): ButtonProps[] {
  if (Array.isArray(node)) return node.flatMap(buttonProps);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (String(node.type) === 'Button') return [node.props as ButtonProps];
  return buttonProps(node.props.children);
}

describe('타이머 프리셋 요소 트리', () => {
  it.each([1, 2, 4] as const)('%i열에서 대기·실행·입력·저장 중에도 네 버튼을 모두 유지합니다', (columns) => {
    for (const replacingTimer of [false, true]) {
      for (const schedulingDuration of [null, 15, 23, 60]) {
        const buttons = buttonProps(QuickTimerPresets({
          columns,
          disabled: schedulingDuration !== null,
          directInputButtonRef: { current: null },
          onDirectInput: vi.fn(),
          onSelectDuration: vi.fn(),
          replacingTimer,
          schedulingDuration,
        }));
        expect(buttons.map((button) => button.label)).toEqual(['15분', '30분', '45분', '직접 입력']);
        expect(buttons.every((button) => button.disabled === (schedulingDuration !== null))).toBe(true);
        expect(buttons.filter((button) => button.loading)).toHaveLength(schedulingDuration === null ? 0 : 1);
        expect(buttons[3].loading).toBe(schedulingDuration === 23 || schedulingDuration === 60);
        expect(buttons.every((button) => button.variant === (replacingTimer ? 'secondary' : 'primary'))).toBe(true);
      }
    }
  });

  it('실행·일시정지의 시간 변경 버튼은 네 개 모두 배경과 테두리가 있는 secondary로 표시합니다', () => {
    for (const schedulingDuration of [null, 1, 15, 30, 45, 60]) {
      const buttons = buttonProps(QuickTimerPresets({
        columns: 2,
        disabled: schedulingDuration !== null,
        directInputButtonRef: { current: null },
        onDirectInput: vi.fn(),
        onSelectDuration: vi.fn(),
        replacingTimer: true,
        schedulingDuration,
      }));

      expect(buttons.map((button) => button.testID)).toEqual([
        'quick-timer-preset-15',
        'quick-timer-preset-30',
        'quick-timer-preset-45',
        'quick-timer-preset-custom',
      ]);
      expect(buttons.map((button) => button.variant)).toEqual([
        'secondary', 'secondary', 'secondary', 'secondary',
      ]);
    }
  });

  it('선택 시간과 직접 입력 동작·초점 반환 ref를 그대로 전달합니다', () => {
    const onSelectDuration = vi.fn();
    const onDirectInput = vi.fn();
    const directInputButtonRef = { current: null };
    const buttons = buttonProps(QuickTimerPresets({
      columns: 2,
      disabled: false,
      directInputButtonRef,
      onDirectInput,
      onSelectDuration,
      replacingTimer: true,
      schedulingDuration: null,
    }));
    buttons.forEach((button) => button.onPress());
    expect(onSelectDuration.mock.calls).toEqual([[15], [30], [45]]);
    expect(onDirectInput).toHaveBeenCalledOnce();
    expect(buttons[3].elementRef).toBe(directInputButtonRef);
    expect(buttons[0].accessibilityLabel).toBe('15분 타이머로 변경');
    expect(buttons[3].accessibilityLabel).toBe('타이머 시간 직접 입력');
  });
});
