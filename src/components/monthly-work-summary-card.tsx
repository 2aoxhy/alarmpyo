import { StyleSheet, Switch, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { MonthlyWorkSummary } from '@/services/monthly-work-summary';
import { formatDuration } from '@/utils/date';
import { getDayExceptionAppearance } from '@/utils/day-exception-appearance';

function formatMonthDay(dateKey: string): string {
  return `${Number(dateKey.slice(5, 7))}월 ${Number(dateKey.slice(8, 10))}일`;
}

export function MonthlyWorkSummaryCard({
  summary,
  exportingCalendar = false,
  includeNotes = false,
  onExportCalendar,
  onIncludeNotesChange,
}: {
  summary: MonthlyWorkSummary;
  exportingCalendar?: boolean;
  includeNotes?: boolean;
  onExportCalendar: () => void;
  onIncludeNotesChange?: (include: boolean) => void;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const metrics = [
    { label: '주간', value: `${summary.dayShiftCount}회`, color: palette.mintDark },
    { label: '야간', value: `${summary.nightShiftCount}회`, color: palette.violet },
    { label: '휴무', value: `${summary.offdayCount}일`, color: palette.inkMuted },
  ];
  const exceptions = Object.entries(summary.exceptionCounts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      appearance: getDayExceptionAppearance(
        type as keyof typeof summary.exceptionCounts,
        palette,
      ),
      count,
      type,
    }));

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <AppIcon color={palette.violet} name="time-outline" size={20} />
        </View>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" variant="label">
            근무 기간 요약
          </AppText>
          <AppText variant="caption" color={palette.inkMuted}>
            {formatMonthDay(summary.periodStartDateKey)}~
            {formatMonthDay(summary.periodEndDateKey)} 기록을 계산했어요.
          </AppText>
        </View>
      </View>

      <View style={styles.total}>
        <AppText variant="caption" color={palette.inkMuted}>근무 시간 합계</AppText>
        <AppText variant="title" color={palette.indigoDark} style={styles.totalValue}>
          {formatDuration(summary.totalMinutes)}
        </AppText>
        <AppText variant="caption" color={palette.inkMuted}>
          {summary.workdayCount}일 근무
          {summary.substituteCount > 0 ? ` · 대체근무 ${summary.substituteCount}회` : ''}
        </AppText>
      </View>

      <View style={styles.metrics}>
        {metrics.map((metric) => (
          <View key={metric.label} style={styles.metric}>
            <AppText variant="caption" color={palette.inkMuted}>{metric.label}</AppText>
            <AppText variant="label" color={metric.color}>{metric.value}</AppText>
          </View>
        ))}
      </View>

      {exceptions.length > 0 ? (
        <View style={styles.exceptions}>
          {exceptions.map(({ appearance, count, type }) => (
            <View
              key={type}
              style={[styles.exceptionChip, { backgroundColor: appearance.softColor }]}>
              <AppIcon color={appearance.accentColor} name={appearance.iconName} size={16} />
              <AppText variant="caption" color={appearance.accentColor}>
                {appearance.label} {count}일
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.exportSection}>
        <View style={styles.exportHeader}>
          <View style={styles.exportHeaderCopy}>
            <AppText variant="label">표시 월 내보내기</AppText>
            <AppText variant="caption" color={palette.inkMuted}>
              표시한 달의 근무 일정을 달력 파일로 만들어요.
            </AppText>
          </View>
          <AppIcon color={palette.mintDark} name="download-outline" size={22} />
        </View>
        <View
          style={[
            styles.noteOption,
            includeNotes && { borderColor: palette.amber, backgroundColor: palette.amberSoft },
          ]}>
          <View style={styles.noteOptionCopy}>
            <AppText variant="label">개인 메모 포함</AppText>
            <AppText variant="caption" color={palette.inkMuted}>
              {includeNotes
                ? '일정이 있는 날의 개인 메모를 달력 파일에 포함해요.'
                : '달력 파일에서 개인 메모를 제외해요.'}
            </AppText>
          </View>
          <Switch
            accessibilityHint="켜면 일정이 있는 날의 개인 메모를 달력 파일에 포함해요."
            accessibilityLabel="달력 파일에 개인 메모 포함"
            accessibilityState={{
              checked: includeNotes,
              disabled: exportingCalendar,
            }}
            disabled={exportingCalendar}
            onValueChange={onIncludeNotesChange}
            thumbColor={includeNotes && isDark ? palette.canvas : palette.white}
            trackColor={{
              false: palette.inkSoft,
              true: palette.mint,
            }}
            value={includeNotes}
          />
        </View>
        <AppButton
          icon="share-outline"
          label="달력 파일 공유·저장"
          loading={exportingCalendar}
          onPress={onExportCalendar}
          style={styles.exportButton}
          variant="secondary"
        />
        <AppText variant="caption" color={palette.inkMuted} style={styles.caption}>
          공유·저장 화면에서 앱이나 위치를 선택한 경우에만 파일이 전달돼요.
        </AppText>
      </View>
    </Card>
  );
}

const createStyles = (palette: AppPalette) => StyleSheet.create({
  card: { gap: spacing.medium, borderRadius: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.violetSoft,
  },
  headerCopy: { flex: 1, gap: 2 },
  total: {
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.medium,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.large,
  },
  totalValue: { textAlign: 'center' },
  metrics: { flexDirection: 'row', gap: spacing.small },
  metric: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  exportButton: { width: '100%' },
  exportSection: {
    gap: spacing.medium,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceSoft,
    padding: spacing.medium,
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
  },
  exportHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  noteOption: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  noteOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
  exceptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.small,
  },
  exceptionChip: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.medium,
  },
  caption: { textAlign: 'center' },
});
