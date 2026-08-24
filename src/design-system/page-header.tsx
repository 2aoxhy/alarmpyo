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

export function shouldStackPageHeaderAction(
  width: number,
  fontScale: number,
  hasTrailingAction: boolean,
) {
  return hasTrailingAction && (width < 360 || fontScale >= 1.3);
}

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
  const stacked = shouldStackPageHeaderAction(width, fontScale, trailing != null);
  return (
    <View style={[styles.header, stacked && styles.headerStacked]}>
      <View style={styles.titleRow}>
        <View style={[styles.side, styles.leadingSide, stacked && styles.sideStacked]}>
          {leading}
        </View>
        <View
          style={[
            styles.copy,
            align === 'center' && styles.copyCentered,
            stacked && styles.copyStacked,
          ]}>
          <Heading align={align === 'center' ? 'center' : 'left'} level={2} style={styles.title}>
            {title}
          </Heading>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.side, styles.trailingSide, stacked && styles.sideStacked]}>
          {stacked ? null : trailing}
        </View>
      </View>
      {stacked ? <View style={styles.actionRow}>{trailing}</View> : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    header: {
      width: '100%',
      minHeight: 52,
    },
    headerStacked: {
      gap: space.xs,
    },
    titleRow: {
      width: '100%',
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
    },
    side: {
      minWidth: 48,
      minHeight: 48,
      flex: 1,
      justifyContent: 'center',
    },
    leadingSide: { alignItems: 'flex-start' },
    trailingSide: { alignItems: 'flex-end' },
    sideStacked: {
      width: 48,
      flexBasis: 48,
      flexGrow: 0,
      flexShrink: 0,
    },
    copy: {
      minWidth: 0,
      flexShrink: 1,
      gap: space.xxs,
    },
    copyStacked: {
      flexBasis: 0,
      flexGrow: 1,
    },
    copyCentered: {
      alignItems: 'center',
    },
    actionRow: {
      width: '100%',
      minHeight: 48,
      alignItems: 'flex-end',
      justifyContent: 'center',
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
