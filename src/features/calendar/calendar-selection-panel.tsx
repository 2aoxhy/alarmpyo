import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';

type Props = {
  bulkSaving: boolean;
  compact: boolean;
  onCancel: () => void;
  onChange: () => void;
  onShare: () => void;
  selectedCount: number;
  stackActions: boolean;
};

export function CalendarSelectionPanel({
  bulkSaving,
  compact,
  onCancel,
  onChange,
  onShare,
  selectedCount,
  stackActions,
}: Props) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={[
        styles.panel,
        compact && styles.panelCompact,
      ]}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <AppIcon color={palette.indigoDark} name="checkmark-circle" size={23} />
        </View>
        <View style={styles.copy}>
          <AppText variant="heading">{selectedCount}일 선택</AppText>
          <AppText color={palette.inkMuted} variant="caption">
            {compact
              ? '날짜를 눌러 선택하거나 해제해요.'
              : '다른 날짜를 누르거나 손가락을 끌어 추가하고, 다시 눌러 해제해요.'}
          </AppText>
        </View>
        <Pressable
          accessibilityLabel="일정 선택 취소하기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.close,
            pressed && styles.pressed,
          ]}>
          <AppIcon
            accessible={false}
            color={palette.inkMuted}
            name="close"
            size={20}
          />
        </Pressable>
      </View>
      <View
        style={[
          styles.actions,
          stackActions && styles.actionsStacked,
        ]}>
        <AppButton
          disabled={bulkSaving || selectedCount === 0}
          icon="options-outline"
          label="일괄 변경하기"
          loading={bulkSaving}
          onPress={onChange}
          style={[
            styles.action,
            stackActions && styles.actionStacked,
          ]}
        />
        <AppButton
          disabled={selectedCount === 0}
          icon="share-outline"
          label="일정 공유하기"
          onPress={onShare}
          style={[
            styles.action,
            stackActions && styles.actionStacked,
          ]}
          variant="secondary"
        />
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    panel: {
      gap: spacing.medium,
      padding: spacing.large,
      borderWidth: 1,
      borderRadius: 20,
      borderColor: palette.indigo,
      backgroundColor: palette.indigoSoft,
    },
    panelCompact: {
      gap: spacing.small,
      padding: spacing.medium,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    icon: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: palette.surface,
    },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    close: {
      width: 42,
      height: 42,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: palette.surface,
    },
    actions: { flexDirection: 'row', gap: spacing.small },
    actionsStacked: { flexDirection: 'column' },
    action: { flex: 1 },
    actionStacked: { width: '100%', flex: 0 },
    pressed: { opacity: 0.66, transform: [{ scale: 0.97 }] },
  });
}
