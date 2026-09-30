import { useMemo, type PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { shape, space } from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type SurfaceProps = PropsWithChildren<DesignSystemThemeProps & {
  tone?: 'base' | 'muted' | 'selected';
  density?: 'regular' | 'compact';
  /** @deprecated 평면형 공통 표면에는 그림자를 사용하지 않습니다. */
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
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: shape.section,
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
    elevated: {
      borderColor: colors.borderStrong,
    },
  });
}
