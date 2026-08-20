import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { space, typeScale } from './tokens';
import { Heading } from './heading';
import {
  type DesignSystemThemeProps,
  useDesignSystemTheme,
} from './theme';

export type PageHeaderProps = DesignSystemThemeProps & {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  align?: 'start' | 'center';
};

export function PageHeader({
  title,
  subtitle,
  leading,
  trailing,
  align = 'center',
  theme,
}: PageHeaderProps) {
  const { colors } = useDesignSystemTheme(theme);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale >= 1.4 || width < 320;
  return (
    <View style={[styles.header, stacked && styles.stacked]}>
      {leading ? <View style={styles.side}>{leading}</View> : null}
      <View style={[styles.copy, align === 'center' && styles.copyCentered]}>
        <Heading align={align === 'center' ? 'center' : 'left'} level={2} style={styles.title}>
          {title}
        </Heading>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ? <View style={styles.side}>{trailing}</View> : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    header: {
      width: '100%',
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
    },
    stacked: {
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    },
    side: {
      minWidth: 48,
      minHeight: 48,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      minWidth: 0,
      flex: 1,
      gap: space.xxs,
    },
    copyCentered: {
      alignItems: 'center',
    },
    title: { color: colors.text },
    subtitle: {
      ...typeScale.caption,
      color: colors.textMuted,
      includeFontPadding: false,
      textAlign: 'center',
    },
  });
}
