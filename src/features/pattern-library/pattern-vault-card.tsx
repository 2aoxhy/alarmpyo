import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { Surface } from '@/design-system';
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
  editLabel = '편집',
  onShare,
}: {
  active: boolean;
  busy?: boolean;
  entry: PatternVaultEntry;
  onApply: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  editLabel?: string;
  onShare?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackActions = width <= 360 || fontScale >= 1.3;

  return (
    <Surface tone={active ? 'selected' : 'base'} style={[styles.card, active && styles.cardActive]}>
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
            label={editLabel}
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
          accessibilityHint="적용 전 달력 비교를 엽니다."
          disabled={busy || active}
          icon="checkmark"
          label={active ? '사용 중' : '적용 비교'}
          onPress={onApply}
          size="compact"
          style={styles.action}
        />
        {onDelete ? (
          <AppButton
            accessibilityHint={
              active
                ? '현재 달력은 유지하고 보관한 패턴과 관련 적용 이력만 삭제합니다.'
                : undefined
            }
            disabled={busy}
            icon="trash-outline"
            label="삭제"
            onPress={onDelete}
            size="compact"
            style={styles.action}
            variant="ghost"
          />
        ) : null}
      </View>
    </Surface>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      gap: spacing.large,
      padding: spacing.large,
    },
    cardActive: {
      borderLeftWidth: 3,
      borderLeftColor: palette.selectionBorder,
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
