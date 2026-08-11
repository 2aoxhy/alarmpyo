import { useMemo } from 'react';

import type { AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';

import {
  createSemanticColors,
  isDarkPalette,
  type SemanticColors,
} from './tokens';

export type DesignSystemThemeOverride = {
  palette?: AppPalette;
  colors?: Partial<SemanticColors>;
  isDark?: boolean;
};

export type DesignSystemThemeProps = {
  theme?: DesignSystemThemeOverride;
};

/**
 * 앱 테마를 기본값으로 사용하고, 독립적인 미리 보기나 위젯에서는 테마를 직접 주입할 수 있어요.
 */
export function useDesignSystemTheme(
  override?: DesignSystemThemeOverride,
) {
  const appTheme = useAppTheme();
  const palette = override?.palette ?? appTheme.palette;
  const isDark =
    override?.isDark ??
    (override?.palette ? isDarkPalette(override.palette) : appTheme.isDark);
  const colorOverrides = override?.colors;
  const colors = useMemo(
    () => ({
      ...createSemanticColors(palette, isDark),
      ...colorOverrides,
    }),
    [colorOverrides, isDark, palette],
  );

  return { colors, isDark, palette };
}
