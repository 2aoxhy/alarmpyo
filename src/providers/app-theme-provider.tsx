import {
  createContext,
  type PropsWithChildren,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Appearance,
  Easing,
  Platform,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

import { darkPalette, lightPalette, type AppPalette } from '@/constants/app-theme';
import { useReduceMotionStatus } from '@/hooks/use-reduce-motion';
import type { ResolvedThemeMode, ThemeMode } from '@/models/app-data';
import { useAppStoreData } from '@/store/app-store';
import {
  THEME_BLEND_DURATION_MS,
  resolveNativeColorScheme,
  resolveThemeMode,
  resolveThemeTransitionPlan,
} from '@/utils/theme-transition';

export type AppThemeContextValue = {
  mode: ResolvedThemeMode;
  preference: ThemeMode;
  isDark: boolean;
  palette: AppPalette;
};

export const AppThemeContext = createContext<AppThemeContextValue>({
  mode: 'light',
  preference: 'system',
  isDark: false,
  palette: lightPalette,
});

function applyNativeColorScheme(
  preference: ThemeMode,
  resolvedMode: ResolvedThemeMode,
) {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') {
    return;
  }

  try {
    Appearance.setColorScheme(resolveNativeColorScheme(preference, resolvedMode));
  } catch {
    // 이전 네이티브 실행 환경에서도 앱 내부 팔레트는 계속 적용해요.
  }
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const { data } = useAppStoreData();
  const requestedMode = data.settings.themeMode;
  const systemColorScheme = useColorScheme();
  const requestedResolvedMode = resolveThemeMode(requestedMode, systemColorScheme);
  const reduceMotionStatus = useReduceMotionStatus();
  const reduceMotion = !reduceMotionStatus.known || reduceMotionStatus.enabled;
  const [mode, setMode] = useState<ResolvedThemeMode>(requestedResolvedMode);
  const [blendColor, setBlendColor] = useState(
    requestedResolvedMode === 'dark' ? darkPalette.canvas : lightPalette.canvas,
  );
  const [blendOpacity] = useState(() => new Animated.Value(0));
  const modeRef = useRef(mode);
  const initialized = useRef(false);
  const transitionRevision = useRef(0);
  const activeAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const pendingTransition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useNativeDriver = Platform.OS !== 'web';
  const isDark = mode === 'dark';

  useLayoutEffect(() => {
    const revision = transitionRevision.current + 1;
    transitionRevision.current = revision;
    if (pendingTransition.current !== null) {
      clearTimeout(pendingTransition.current);
      pendingTransition.current = null;
    }
    activeAnimation.current?.stop();
    activeAnimation.current = null;
    blendOpacity.stopAnimation();

    const commitTheme = () => {
      if (transitionRevision.current !== revision) return false;
      modeRef.current = requestedResolvedMode;
      setMode(requestedResolvedMode);
      applyNativeColorScheme(requestedMode, requestedResolvedMode);
      return true;
    };

    const cleanup = () => {
      if (transitionRevision.current !== revision) return;
      if (pendingTransition.current !== null) {
        clearTimeout(pendingTransition.current);
        pendingTransition.current = null;
      }
      activeAnimation.current?.stop();
      activeAnimation.current = null;
    };

    if (!initialized.current) {
      initialized.current = true;
      blendOpacity.setValue(0);
      applyNativeColorScheme(requestedMode, requestedResolvedMode);
      return cleanup;
    }

    const previousMode = modeRef.current;
    if (requestedResolvedMode === previousMode) {
      blendOpacity.setValue(0);
      applyNativeColorScheme(requestedMode, requestedResolvedMode);
      return cleanup;
    }

    const transitionPlan = resolveThemeTransitionPlan(
      previousMode,
      requestedResolvedMode,
      reduceMotion,
    );

    if (!transitionPlan.shouldAnimate) {
      blendOpacity.setValue(0);
      commitTheme();
      return cleanup;
    }

    const previousPalette = previousMode === 'dark' ? darkPalette : lightPalette;
    setBlendColor(previousPalette.canvas);
    blendOpacity.setValue(transitionPlan.coverOpacity);
    if (!commitTheme()) return cleanup;

    pendingTransition.current = setTimeout(() => {
      pendingTransition.current = null;
      if (transitionRevision.current !== revision) return;

      const reveal = Animated.timing(blendOpacity, {
        duration: THEME_BLEND_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver,
      });
      activeAnimation.current = reveal;
      reveal.start(({ finished }) => {
        if (finished && transitionRevision.current === revision) {
          activeAnimation.current = null;
        }
      });
    }, transitionPlan.coalesceDurationMs);

    return cleanup;
  }, [
    blendOpacity,
    reduceMotion,
    requestedMode,
    requestedResolvedMode,
    useNativeDriver,
  ]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      mode,
      preference: requestedMode,
      isDark,
      palette: isDark ? darkPalette : lightPalette,
    }),
    [isDark, mode, requestedMode],
  );

  return (
    <AppThemeContext.Provider value={value}>
      <View style={[styles.root, { backgroundColor: value.palette.canvas }]}>
        {children}
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            styles.blend,
            {
              backgroundColor: blendColor,
              opacity: blendOpacity,
            },
          ]}
          testID="theme-transition-blend"
        />
      </View>
    </AppThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  blend: {
    zIndex: 10_000,
    elevation: 10_000,
    pointerEvents: 'none',
  },
});
