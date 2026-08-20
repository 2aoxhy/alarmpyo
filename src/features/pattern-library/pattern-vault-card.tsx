import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppButton, AppText, Card } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PatternVaultEntry } from '@/models/app-data';

import { formatPatternSequence, formatPatternSource } from './pattern-library-model';

export function PatternVaultCard({
  active,
  busy = false,
  entry,
  onApply,
  onDelete,
  onEdit,
  onShare,
}: {
  active: boolean;
  busy?: boolean;
  entry: PatternVaultEntry;
  onApply: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onShare?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackActions = width <= 360 || fontScale >= 1.3;

  return (
    <Card style={[styles.card, active && styles.cardActive]}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <View style={styles.eyebrow}>
            <AppText tone="secondary" variant="caption">
              {formatPatternSource(entry.source)}
            </AppText>
            {active ? (
              <View style={styles.activeBadge}>
                <AppText variant="caption">사용 중</AppText>
              </View>
            ) : null}
          </View>
          <AppText accessibilityRole="header" variant="heading">
            {entry.name}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {entry.shiftCodes.length}일 주기 · {formatPatternSequence(entry.shiftCodes)}
          </AppText>
          {entry.author ? (
            <AppText tone="tertiary" variant="caption">
              작성자 {entry.author}
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={[styles.actions, stackActions && styles.actionsStacked]}>
        {onEdit ? (
          <AppButton
            disabled={busy}
            icon="options-outline"
            label="편집"
            onPress={onEdit}
            size="compact"
            style={styles.action}
            variant="secondary"
          />
        ) : null}
        {onShare ? (
          <AppButton
            disabled={busy}
            icon="share-outline"
            label="보내기"
            onPress={onShare}
            size="compact"
            style={styles.action}
            variant="secondary"
          />
        ) : null}
        <AppButton
          accessibilityHint="향후 42일 변경 내용을 먼저 확인합니다."
          disabled={busy || active}
          icon="checkmark"
          label={active ? '사용 중' : '적용 비교'}
          onPress={onApply}
          size="compact"
          style={styles.action}
        />
        {onDelete ? (
          <AppButton
            disabled={busy || active}
            icon="trash-outline"
            label="삭제"
            onPress={onDelete}
            size="compact"
            style={styles.action}
            variant="ghost"
          />
        ) : null}
      </View>
    </Card>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      gap: spacing.large,
      padding: spacing.large,
    },
    cardActive: {
      borderWidth: 2,
      borderColor: palette.selectionBorder,
      backgroundColor: palette.selectionSurface,
    },
    heading: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.medium,
    },
    headingCopy: {
      minWidth: 0,
      flex: 1,
      gap: spacing.tiny,
    },
    eyebrow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.small,
    },
    activeBadge: {
      minHeight: 26,
      justifyContent: 'center',
      paddingHorizontal: spacing.small,
      borderWidth: 1,
      borderColor: palette.selectionBorder,
      borderRadius: 999,
      backgroundColor: palette.surfaceSoft,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    actionsStacked: {
      flexDirection: 'column',
      flexWrap: 'nowrap',
    },
    action: {
      minWidth: 100,
      flexGrow: 1,
    },
  });
}
