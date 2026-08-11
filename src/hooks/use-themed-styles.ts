import { useMemo } from 'react';
import type { AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const themedStyleCache = new WeakMap<AppPalette, WeakMap<object, unknown>>();

function getCachedStyles<Styles>(
  palette: AppPalette,
  isDark: boolean,
  factory: (palette: AppPalette, isDark: boolean) => Styles,
): Styles {
  let paletteCache = themedStyleCache.get(palette);
  if (!paletteCache) {
    paletteCache = new WeakMap<object, unknown>();
    themedStyleCache.set(palette, paletteCache);
  }
  const cached = paletteCache.get(factory);
  if (cached !== undefined) return cached as Styles;
  const styles = factory(palette, isDark);
  paletteCache.set(factory, styles);
  return styles;
}

export function useThemedStyles<Styles>(
  factory: (palette: AppPalette, isDark: boolean) => Styles,
): Styles {
  const { isDark, palette } = useAppTheme();
  return useMemo(
    () => getCachedStyles(palette, isDark, factory),
    [factory, isDark, palette],
  );
}
