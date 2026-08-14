import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AnimatedShiftIcon, getShiftIconKind } from '@/components/animated-shift-icon';
import {
  AppText,
  Card,
  ListRow,
  MenuGroup,
} from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import type { ShiftType } from '@/models/app-data';
import type { PayrollCalendarEntry } from '@/services/payroll-schedule';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { DAY_EXCEPTION_TYPES } from '@/utils/day-exception';
import { getDayExceptionAppearance } from '@/utils/day-exception-appearance';
import { formatKoreanDate } from '@/utils/date';
import type {
  KoreanHolidayDataStatus,
  KoreanHolidayInfo,
} from '@/utils/korean-holiday';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  buildCalendarStatusSummary,
  CALENDAR_PAYDAY_OVERLAP_LEGEND_LABEL,
} from './calendar-day-status';
type HolidayNoticeProps = {
  status: KoreanHolidayDataStatus;
  visibleYear: number;
};

export function CalendarHolidayNotice({ status, visibleYear }: HolidayNoticeProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  if (status.source === 'official') return null;

  return (
    <Card style={styles.holidayNotice}>
      <View style={styles.holidayNoticeIcon}>
        <AppIcon
          color={palette.amber}
          name={status.source === 'calculated' ? 'calendar-outline' : 'alert-circle-outline'}
          size={21}
        />
      </View>
      <View style={styles.holidayNoticeCopy}>
        <AppText variant="label">
          {status.source === 'calculated'
            ? '공휴일 자동 반영'
            : '공휴일 자료 확인 필요'}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {status.source === 'calculated'
            ? '반복 법정공휴일과 대체공휴일을 자동 계산해요. 선거일·임시공휴일은 공식 발표 후 반영해요.'
            : `자동 계산은 ${status.supportedStartYear}~${status.supportedEndYear}년을 지원해요. ${visibleYear}년은 공휴일 이름과 공휴일에 따른 급여일 조정을 확정하지 않아요.`}
        </AppText>
      </View>
    </Card>
  );
}

type LargeTextStatusSummaryProps = {
  dateKeys: readonly string[];
  holidays: Readonly<Record<string, KoreanHolidayInfo>>;
  payrollEntries: Readonly<Record<string, PayrollCalendarEntry>>;
};

export function CalendarLargeTextStatusSummary({
  dateKeys,
  holidays,
  payrollEntries,
}: LargeTextStatusSummaryProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const entries = buildCalendarStatusSummary(dateKeys, holidays, payrollEntries);

  if (entries.length === 0) return null;

  return (
    <Card style={styles.largeTextSummary}>
      <View style={styles.largeTextSummaryHeader}>
        <AppIcon accessible={false} color={palette.indigoDark} name="alert-circle-outline" size={22} />
        <View style={styles.largeTextSummaryCopy}>
          <AppText accessibilityRole="header" variant="heading">
            공휴일·급여일 안내
          </AppText>
          <AppText tone="secondary" variant="caption">
            큰 글자에서는 달력 칸의 자세한 표시를 아래에서 확인해요.
          </AppText>
        </View>
      </View>
      <View style={styles.largeTextSummaryList}>
        {entries.map((entry) => (
          <View
            accessible
            accessibilityLabel={`${formatKoreanDate(entry.dateKey)}${entry.holidayLabel ? `, 공휴일 ${entry.holidayLabel}` : ''}${entry.payrollLabel ? `, 급여일 ${entry.payrollLabel}` : ''}`}
            key={entry.dateKey}
            style={styles.largeTextSummaryRow}>
            <AppText style={styles.largeTextSummaryDate} variant="label">
              {formatKoreanDate(entry.dateKey)}
            </AppText>
            <View style={styles.largeTextSummaryLabels}>
              {entry.holidayLabel ? (
                <View style={[styles.largeTextSummaryBadge, styles.largeTextHolidayBadge]}>
                  <View style={styles.largeTextHolidayDot} />
                  <AppText color={palette.coral} variant="caption">
                    공휴일 {entry.holidayLabel}
                  </AppText>
                </View>
              ) : null}
              {entry.payrollLabel ? (
                <View style={[styles.largeTextSummaryBadge, styles.largeTextPaydayBadge]}>
                  <View style={styles.largeTextPaydayDot} />
                  <AppText color={palette.amber} variant="caption">
                    급여일 {entry.payrollLabel}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

type MenuProps = {
  isDark: boolean;
  legendExpanded: boolean;
  onToggleLegend: () => void;
  shiftTypes: readonly ShiftType[];
};

export function CalendarMenuSections({
  isDark,
  legendExpanded,
  onToggleLegend,
  shiftTypes,
}: MenuProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <>
      <MenuGroup title="달력 메뉴">
        <ListRow
          expanded={legendExpanded}
          icon="ellipse-outline"
          onPress={onToggleLegend}
          subtitle="근무와 예외 일정 색상을 확인해요."
          title="표시 안내"
          trailing={
            <AppText variant="label" color={palette.indigoDark}>
              {legendExpanded ? '접기' : '보기'}
            </AppText>
          }
        />
      </MenuGroup>

      {legendExpanded ? (
        <View style={styles.legendSection}>
          <View style={styles.legend}>
            {shiftTypes.map((shift) => {
              const appearance = getShiftAppearance(shift, palette, isDark);
              return (
                <View
                  key={shift.id}
                  style={[styles.legendItem, { backgroundColor: appearance.softColor }]}>
                  <AnimatedShiftIcon
                    animated={false}
                    color={appearance.accentColor}
                    kind={getShiftIconKind(shift.id, shift.isOff)}
                    size={16}
                  />
                  <AppText variant="caption" color={appearance.accentColor}>
                    {shift.name}
                  </AppText>
                </View>
              );
            })}
            <View style={[styles.legendItem, styles.overrideLegendItem]}>
              <View style={styles.overrideLegend} />
              <AppText variant="caption" tone="secondary">
                직접 변경한 날
              </AppText>
            </View>
            <View style={[styles.legendItem, styles.paydayLegendItem]}>
              <View style={styles.paydayLegendMarker}>
                <AppText
                  color={palette.canvas}
                  style={styles.paydayLegendMarkerText}
                  variant="caption">
                  급
                </AppText>
              </View>
              <AppText variant="caption" color={palette.white}>
                회사 기준 급여일 · * 예상일 · {CALENDAR_PAYDAY_OVERLAP_LEGEND_LABEL}
              </AppText>
            </View>
            {DAY_EXCEPTION_TYPES.map((type) => {
              const appearance = getDayExceptionAppearance(type, palette);
              return (
                <View
                  key={type}
                  style={[styles.legendItem, { backgroundColor: appearance.softColor }]}>
                  <AppIcon color={appearance.accentColor} name={appearance.iconName} size={16} />
                  <AppText variant="caption" color={appearance.accentColor}>
                    {appearance.label}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    holidayNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.small,
      borderColor: palette.amber,
      backgroundColor: palette.amberSoft,
    },
    holidayNoticeIcon: {
      width: 36,
      height: 36,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: palette.surface,
    },
    holidayNoticeCopy: { flex: 1, minWidth: 0, gap: 3 },
    largeTextSummary: { gap: spacing.medium },
    largeTextSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.medium,
    },
    largeTextSummaryCopy: { flex: 1, minWidth: 0, gap: 3 },
    largeTextSummaryList: { gap: spacing.small },
    largeTextSummaryRow: {
      gap: spacing.small,
      paddingTop: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    largeTextSummaryDate: { fontVariant: ['tabular-nums'] },
    largeTextSummaryLabels: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    largeTextSummaryBadge: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radii.pill,
    },
    largeTextHolidayBadge: { backgroundColor: palette.coralSoft },
    largeTextPaydayBadge: { backgroundColor: palette.amberSoft },
    largeTextHolidayDot: {
      width: 8,
      height: 8,
      borderRadius: radii.pill,
      backgroundColor: palette.coral,
    },
    largeTextPaydayDot: {
      width: 8,
      height: 8,
      borderRadius: radii.pill,
      backgroundColor: palette.amber,
    },
    legendSection: {
      gap: 6,
      paddingHorizontal: spacing.tiny,
    },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    legendItem: {
      minHeight: 30,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
    },
    overrideLegendItem: { backgroundColor: palette.surfaceSoft },
    overrideLegend: {
      width: 14,
      height: 3,
      borderRadius: 2,
      backgroundColor: palette.mint,
    },
    paydayLegendItem: { backgroundColor: palette.amberSoft },
    paydayLegendMarker: {
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: palette.amber,
      paddingHorizontal: 2,
    },
    paydayLegendMarkerText: {
      fontSize: 10,
      lineHeight: 13,
    },
  });
}
