import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';

import { Button } from './button';
import { size, space, typeScale } from './tokens';
import { useDesignSystemTheme } from './theme';

export type AsyncStateKind = 'loading' | 'empty' | 'error';

export type AsyncStateProps = {
  kind: AsyncStateKind;
  title: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
};

export function AsyncState({
  kind,
  title,
  message,
  onRetry,
  retryLabel = '다시 시도',
  testID,
}: AsyncStateProps) {
  const { colors } = useDesignSystemTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const role = kind === 'loading' ? 'progressbar' : kind === 'error' ? 'alert' : undefined;

  return (
    <View style={styles.container} testID={testID}>
      <View
        accessible
        accessibilityLabel={message ? `${title}. ${message}` : title}
        accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
        accessibilityRole={role}
        style={styles.status}>
        {kind === 'loading' ? (
          <ActivityIndicator color={colors.info} size="small" />
        ) : (
          <AppIcon
            accessible={false}
            color={kind === 'error' ? colors.danger : colors.textMuted}
            name={kind === 'error' ? 'alert-circle-outline' : 'ellipse-outline'}
            size={size.iconMedium}
          />
        )}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </View>
      {kind === 'error' && onRetry ? (
        <Button
          label={retryLabel}
          onPress={onRetry}
          size="compact"
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    container: {
      width: '100%',
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    status: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
    },
    copy: { minWidth: 0, flex: 1, gap: space.xxs },
    title: { ...typeScale.label, color: colors.text },
    message: { ...typeScale.caption, color: colors.textMuted },
  });
}
