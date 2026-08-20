import { useMemo, type PropsWithChildren } from 'react';
import {
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { radius, space } from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type SurfaceProps = PropsWithChildren<DesignSystemThemeProps & {
  tone?: 'base' | 'muted' | 'selected';
  density?: 'regular' | 'compact';
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function Surface({
  children,
  tone = 'base',
  density = 'regular',
  elevated = false,
  style,
  testID,
  theme,
}: SurfaceProps) {
  const { colors } = useDesignSystemTheme(theme);
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View
      style={[
        styles.surface,
        tone === 'muted' && styles.muted,
        tone === 'selected' && styles.selected,
        density === 'compact' && styles.compact,
        elevated && styles.elevated,
        style,
      ]}
      testID={testID}>
      {children}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    surface: {
      padding: space.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    compact: {
      paddingVertical: space.sm,
    },
    muted: {
      backgroundColor: colors.surfaceMuted,
    },
    selected: {
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceSelected,
    },
    elevated:
      Platform.OS === 'web'
        ? { boxShadow: '0 10px 28px rgba(0,0,0,0.28)' }
        : {
            elevation: 4,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 20,
          },
  });
}
