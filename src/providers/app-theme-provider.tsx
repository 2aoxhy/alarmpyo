import {
  createContext,
  type PropsWithChildren,
  useLayoutEffect,
} from 'react';
import { Appearance, Platform, StyleSheet, View } from 'react-native';

import { darkPalette, type AppPalette } from '@/constants/app-theme';
import type { ResolvedThemeMode, ThemeMode } from '@/models/app-data';

export type AppThemeContextValue = {
  mode: ResolvedThemeMode;
  preference: ThemeMode;
  isDark: boolean;
  palette: AppPalette;
};

const DARK_THEME_VALUE: AppThemeContextValue = {
  mode: 'dark',
  preference: 'dark',
  isDark: true,
  palette: darkPalette,
};

export const AppThemeContext = createContext<AppThemeContextValue>(
  DARK_THEME_VALUE,
);

function applyDarkColorScheme() {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = 'dark';
    }
    return;
  }

  if (typeof Appearance.setColorScheme !== 'function') {
    return;
  }

  try {
    Appearance.setColorScheme('dark');
  } catch {
    // 이전 네이티브 실행 환경에서도 앱 내부 다크 팔레트는 계속 적용해요.
  }
}

/** 알람표 1.0.1부터 앱과 네이티브 컨트롤을 다크 테마로 고정해요. */
export function AppThemeProvider({ children }: PropsWithChildren) {
  useLayoutEffect(() => {
    applyDarkColorScheme();
  }, []);

  return (
    <AppThemeContext.Provider value={DARK_THEME_VALUE}>
      <View style={styles.root}>{children}</View>
    </AppThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkPalette.canvas,
  },
});
