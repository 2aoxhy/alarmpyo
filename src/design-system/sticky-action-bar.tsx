import { useMemo, type PropsWithChildren } from 'react';
import {
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
  const { colors } = useDesignSystemTheme(theme);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    container: {
      width: '100%',
      paddingTop: space.md,
      paddingHorizontal: space.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
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
