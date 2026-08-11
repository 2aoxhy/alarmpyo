import { useMemo, type PropsWithChildren } from 'react';
import {
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { size, space, type SemanticColors } from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type StickyActionBarProps = PropsWithChildren<
  DesignSystemThemeProps & {
    position?: 'flow' | 'absolute';
    includeSafeArea?: boolean;
    bottomOffset?: number;
    maxContentWidth?: number;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    testID?: string;
  }
>;

export function StickyActionBar({
  children,
  position = 'flow',
  includeSafeArea = true,
  bottomOffset = 0,
  maxContentWidth = size.contentMaxWidth,
  style,
  contentStyle,
  theme,
  testID,
}: StickyActionBarProps) {
  const { colors, isDark } = useDesignSystemTheme(theme);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const bottomPadding = includeSafeArea ? Math.max(insets.bottom, space.md) : space.md;

  return (
    <View
      style={[
        styles.container,
        position === 'absolute' && styles.absolute,
        { bottom: position === 'absolute' ? bottomOffset : undefined, paddingBottom: bottomPadding },
        style,
      ]}
      testID={testID}>
      <View style={[styles.content, { maxWidth: maxContentWidth }, contentStyle]}>{children}</View>
    </View>
  );
}

function createStyles(colors: SemanticColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      width: '100%',
      paddingTop: space.md,
      paddingHorizontal: space.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.24 : 0.08,
      shadowRadius: 14,
      elevation: Platform.OS === 'android' ? 8 : 0,
    },
    absolute: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    content: {
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: space.md,
    },
  });
}
