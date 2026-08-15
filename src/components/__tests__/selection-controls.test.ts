// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest 실행 환경에서는 Node 내장 모듈을 제공합니다.
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  SELECTION_CONTROL_CONTRACT,
  resolveSelectionAccessibilityState,
} from '../selection-controls';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: () => null,
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: () => null,
}));
vi.mock('@/components/app-icon', () => ({ AppIcon: () => null }));
vi.mock('@/components/ui-kit', () => ({ AppText: () => null }));
vi.mock('@/constants/app-theme', () => ({
  radii: { medium: 18, pill: 999 },
  spacing: { small: 8, medium: 12, large: 16, xlarge: 24 },
}));
vi.mock('@/hooks/use-app-theme', () => ({ useAppTheme: vi.fn() }));
vi.mock('@/hooks/use-themed-styles', () => ({ useThemedStyles: vi.fn() }));
vi.mock('@/hooks/use-web-focus-visible', () => ({ useWebFocusVisible: vi.fn() }));

const source = readFileSync(
  resolve(process.cwd(), 'src/components/selection-controls.tsx'),
  'utf8',
);

describe('V10 선택 컨트롤 계약', () => {
  it('선택 역할에 맞는 접근성 상태만 한 번 제공합니다', () => {
    expect(resolveSelectionAccessibilityState(true, false, 'radio')).toEqual({
      checked: true,
      disabled: false,
    });
    expect(resolveSelectionAccessibilityState(false, true, 'checkbox')).toEqual({
      checked: false,
      disabled: true,
    });
    expect(resolveSelectionAccessibilityState(true, false, 'button')).toEqual({
      disabled: false,
      selected: true,
    });
    expect(source).toContain("aria-checked={");
    expect(source).toContain("aria-selected={accessibilityRole === 'button'");
  });

  it('2px 경계와 48dp 터치 영역을 공통으로 유지합니다', () => {
    expect(SELECTION_CONTROL_CONTRACT).toEqual({
      borderWidth: 2,
      focusOffset: 2,
      focusWidth: 2,
      minimumTouchTarget: 48,
    });
    expect(source).toContain('borderColor: palette.selectionBorder');
    expect(source).toContain('outlineColor: palette.focus');
  });

  it('선택은 체크와 경계를 함께 사용하고 비활성 전체 투명도를 사용하지 않습니다', () => {
    expect(source).toContain('name="checkmark"');
    expect(source).toContain('backgroundColor: palette.white');
    expect(source).not.toContain('opacity:');
  });
});
