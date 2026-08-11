import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { ShiftChip } from '@/components/shift-chip';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppData } from '@/models/app-data';
import { formatKoreanDate } from '@/utils/date';

import { buildWorkScheduleOverview } from './shift-settings-model';

export function WorkPatternOverview({
  data,
  onEdit,
  today,
}: {
  data: AppData;
  onEdit: () => void;
  today: string;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.45;
  const overview = useMemo(
    () => buildWorkScheduleOverview(data, today),
    [data, today],
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <AppIcon
            accessible={false}
            color={palette.indigoDark}
            name={overview.kind === 'weekday' ? 'shift-day' : 'repeat'}
            size={24}
          />
        </View>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" variant="heading">
            {overview.patternName}
          </AppText>
          <AppText color={palette.inkMuted} variant="caption">
            {overview.kind === 'weekday'
              ? '월요일부터 금요일까지 주간, 토·일요일은 휴무예요.'
              : '주간 2일, 야간 2일, 휴무 2일 순서로 반복해요.'}
          </AppText>
        </View>
      </View>

      <View style={[styles.details, stacked && styles.detailsStacked]}>
        <OverviewDetail
          label="일정 적용 시작일"
          value={formatKoreanDate(overview.scheduleStartDate, true)}
        />
        {overview.kind === 'rotation' ? (
          <OverviewDetail
            label={`${overview.referenceDate}의 근무`}
            value={overview.referenceShiftLabel}
          />
        ) : (
          <OverviewDetail label="주말" value="토·일요일 고정 휴무" />
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.previewHeading}>
        <AppText variant="label">미리 보기</AppText>
        <AppText color={palette.inkMuted} variant="caption">
          {overview.preview.length}일 일정
        </AppText>
      </View>
      <View style={[styles.previewGrid, stacked && styles.previewGridStacked]}>
        {overview.preview.map((item) => (
          <View
            accessibilityLabel={`${formatKoreanDate(item.dateKey)}. ${item.shift?.name ?? '일정 없음'}`}
            accessible
            key={item.dateKey}
            style={[styles.previewItem, stacked && styles.previewItemStacked]}>
            <AppText color={palette.inkMuted} variant="caption">
              {formatKoreanDate(item.dateKey)}
            </AppText>
            {item.shift ? (
              <ShiftChip compact shift={item.shift} />
            ) : (
              <AppText color={palette.inkSoft} variant="caption">
                일정 없음
              </AppText>
            )}
          </View>
        ))}
      </View>

      <AppButton
        accessibilityHint="근무 방식, 적용 시작일, 순번을 변경해요."
        icon="options-outline"
        label="근무 방식 수정하기"
        onPress={onEdit}
        variant="secondary"
      />
    </Card>
  );
}

function OverviewDetail({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.detailItem}>
      <AppText color={palette.inkMuted} variant="caption">
        {label}
      </AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      gap: spacing.medium,
      padding: spacing.medium,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    headerIcon: {
      width: 48,
      height: 48,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: palette.indigoSoft,
    },
    headerCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    details: {
      flexDirection: 'row',
      gap: spacing.small,
    },
    detailsStacked: {
      flexDirection: 'column',
    },
    detailItem: {
      minWidth: 0,
      flex: 1,
      gap: 3,
      padding: spacing.medium,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: palette.line,
    },
    previewHeading: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    previewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    previewGridStacked: {
      flexDirection: 'column',
      flexWrap: 'nowrap',
    },
    previewItem: {
      minWidth: 144,
      minHeight: 72,
      flexBasis: '31%',
      flexGrow: 1,
      justifyContent: 'space-between',
      gap: spacing.small,
      padding: spacing.small,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    previewItemStacked: {
      width: '100%',
      minHeight: 56,
      flexBasis: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
}
