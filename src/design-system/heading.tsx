import { useMemo, type PropsWithChildren } from 'react';
import {
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { typeScale } from './tokens';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type HeadingProps = PropsWithChildren<DesignSystemThemeProps & {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}>;

export function Heading({
  children,
  level,
  align = 'left',
  style,
  numberOfLines,
  theme,
}: HeadingProps) {
  const { colors } = useDesignSystemTheme(theme);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const levelStyle = level === 1
    ? styles.level1
    : level === 2
      ? styles.level2
      : level === 3
        ? styles.level3
        : styles.level4;
  return (
    <Text
      aria-level={level}
      accessibilityRole="header"
      numberOfLines={numberOfLines}
      style={[levelStyle, { textAlign: align }, style]}>
      {children}
    </Text>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    level1: {
      ...typeScale.display,
      color: colors.text,
      includeFontPadding: false,
    },
    level2: {
      ...typeScale.title,
      color: colors.text,
      includeFontPadding: false,
    },
    level3: {
      ...typeScale.heading,
      color: colors.text,
      includeFontPadding: false,
    },
    level4: {
      ...typeScale.label,
      color: colors.text,
      includeFontPadding: false,
    },
  });
}
