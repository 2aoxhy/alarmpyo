import type { Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

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
            ? '반복 법정공휴일과 대체공휴일을 자동 계산합니다. 선거일·임시공휴일은 공식 발표 후 반영합니다.'
            : `자동 계산은 ${status.supportedStartYear}~${status.supportedEndYear}년을 지원합니다. ${visibleYear}년은 공휴일 이름과 공휴일에 따른 급여일 조정을 확정하지 않습니다.`}
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
            큰 글자에서는 달력 칸의 자세한 표시를 아래에서 확인합니다.
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
  onOpenLegend: () => void;
  showCompactKey?: boolean;
  triggerRef?: Ref<React.ElementRef<typeof Pressable>>;
};

export function CalendarMenuSections({
  onOpenLegend,
  showCompactKey = true,
  triggerRef,
}: MenuProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  if (!showCompactKey) {
    return (
      <MenuGroup title="달력 안내">
        <ListRow
          elementRef={triggerRef}
          icon="ellipse-outline"
          onPress={onOpenLegend}
          subtitle="근무·날짜 정보·특별 일정 표시를 확인합니다."
          title="표시 안내"
          trailing={
            <AppText variant="label" color={palette.indigoDark}>
              보기
            </AppText>
          }
        />
      </MenuGroup>
    );
  }

  return (
    <Pressable
      ref={triggerRef}
      accessibilityHint="전체 표시 안내를 엽니다."
      accessibilityLabel="달력 표시 안내. 공은 공휴일, 급은 급여일, 점은 메모, 굵은 선은 직접 변경한 날을 표시합니다."
      accessibilityRole="button"
      onPress={onOpenLegend}
      style={({ pressed }) => [
        styles.compactKeyCard,
        pressed && styles.compactKeyPressed,
      ]}>
      <View style={styles.compactKeyHeader}>
        <View style={styles.compactKeyTitle}>
          <AppIcon
            accessible={false}
            color={palette.indigoDark}
            name="ellipse-outline"
            size={20}
          />
          <AppText variant="label">표시 안내</AppText>
        </View>
        <View style={styles.compactKeyAction}>
          <AppText color={palette.indigoDark} variant="label">
            전체 보기
          </AppText>
          <AppIcon
            accessible={false}
            color={palette.indigoDark}
            name="chevron-forward"
            size={17}
          />
        </View>
      </View>
      <View accessible={false} style={styles.compactKeyItems}>
        <CompactKeyItem kind="holiday" label="공휴일" palette={palette} styles={styles} />
        <CompactKeyItem kind="payday" label="급여일" palette={palette} styles={styles} />
        <CompactKeyItem kind="note" label="메모" palette={palette} styles={styles} />
        <CompactKeyItem kind="override" label="직접 변경" palette={palette} styles={styles} />
      </View>
    </Pressable>
  );
}

type CompactKeyKind =
  | 'holiday'
  | 'note'
  | 'override'
  | 'payday'
  | 'selected'
  | 'today';

function CompactKeyItem({
  kind,
  label,
  palette,
  styles,
}: {
  kind: CompactKeyKind;
  label: string;
  palette: AppPalette;
  styles: CalendarSupportStyles;
}) {
  return (
    <View accessible={false} style={styles.compactKeyItem}>
      <CalendarLegendMarker kind={kind} palette={palette} styles={styles} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

type LegendProps = {
  isDark: boolean;
  shiftTypes: readonly ShiftType[];
};

export function CalendarLegend({ isDark, shiftTypes }: LegendProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const singleColumn = width < 360 || fontScale >= 1.3;

  return (
    <View style={styles.legendSections}>
      <LegendSection title="근무" styles={styles}>
        <View style={styles.legendRows}>
          {shiftTypes.map((shift) => {
            const appearance = getShiftAppearance(shift, palette, isDark);
            return (
              <View
                accessible
                accessibilityLabel={`${shift.name} 근무 표시입니다.`}
                key={shift.id}
                style={[
                  styles.legendRow,
                  !singleColumn && styles.legendRowGrid,
                  { backgroundColor: appearance.softColor },
                ]}>
                <AnimatedShiftIcon
                  animated={false}
                  color={appearance.accentColor}
                  kind={getShiftIconKind(shift.id, shift.isOff)}
                  size={17}
                />
                <AppText
                  color={appearance.accentColor}
                  style={styles.legendCopy}
                  variant="caption">
                  {shift.name}
                </AppText>
              </View>
            );
          })}
        </View>
      </LegendSection>

      <LegendSection title="날짜 정보" styles={styles}>
        <View style={styles.legendRows}>
          <View
            accessible
            accessibilityLabel="공. 공휴일을 표시합니다."
            style={[styles.legendRow, styles.holidayLegendItem]}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.holidayLegendMarker}>
              <AppText
                color={palette.canvas}
                style={styles.legendMarkerText}
                variant="caption">
                공
              </AppText>
            </View>
            <AppText
              color={palette.coral}
              style={styles.legendCopy}
              variant="caption">
              공휴일
            </AppText>
          </View>
          <View
            accessible
            accessibilityLabel={`급은 급여일, 급 별표는 예상 급여일을 표시합니다. ${CALENDAR_PAYDAY_OVERLAP_LEGEND_LABEL}에도 표시합니다.`}
            style={[styles.legendRow, styles.paydayLegendItem]}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.paydayLegendMarkers}>
              <View style={styles.paydayLegendMarker}>
                <AppText
                  color={palette.canvas}
                  style={styles.legendMarkerText}
                  variant="caption">
                  급
                </AppText>
              </View>
              <View style={styles.paydayLegendMarker}>
                <AppText
                  color={palette.canvas}
                  style={styles.legendMarkerText}
                  variant="caption">
                  급*
                </AppText>
              </View>
            </View>
            <AppText
              color={palette.amber}
              style={styles.legendCopy}
              variant="caption">
              급여일 · 급* 예상 급여일 · {CALENDAR_PAYDAY_OVERLAP_LEGEND_LABEL}
            </AppText>
          </View>
        </View>
      </LegendSection>

      <LegendSection title="특별 일정" styles={styles}>
        <View style={styles.legendRows}>
          {DAY_EXCEPTION_TYPES.map((type) => {
            const appearance = getDayExceptionAppearance(type, palette);
            return (
              <View
                accessible
                accessibilityLabel={`${appearance.label} 특별 일정 표시입니다.`}
                key={type}
                style={[
                  styles.legendRow,
                  !singleColumn && styles.legendRowGrid,
                  { backgroundColor: appearance.softColor },
                ]}>
                <AppIcon
                  accessible={false}
                  color={appearance.accentColor}
                  name={appearance.iconName}
                  size={17}
                />
                <AppText
                  color={appearance.accentColor}
                  style={styles.legendCopy}
                  variant="caption">
                  {appearance.label}
                </AppText>
              </View>
            );
          })}
        </View>
      </LegendSection>

      <LegendSection title="화면 상태" styles={styles}>
        <View style={styles.legendRows}>
          {([
            ['today', '오늘 날짜'],
            ['selected', '선택한 날'],
            ['override', '직접 변경한 날'],
            ['note', '메모가 있는 날'],
          ] as const).map(([kind, label]) => (
            <View
              accessible
              accessibilityLabel={`${label} 표시입니다.`}
              key={kind}
              style={[
                styles.legendRow,
                !singleColumn && styles.legendRowGrid,
                styles.screenStateLegendItem,
              ]}>
              <CalendarLegendMarker kind={kind} palette={palette} styles={styles} />
              <AppText style={styles.legendCopy} variant="caption">
                {label}
              </AppText>
            </View>
          ))}
        </View>
      </LegendSection>
    </View>
  );
}

type CalendarSupportStyles = ReturnType<typeof createStyles>;

function LegendSection({
  children,
  styles,
  title,
}: {
  children: React.ReactNode;
  styles: CalendarSupportStyles;
  title: string;
}) {
  return (
    <View style={styles.legendSection}>
      <AppText accessibilityRole="header" variant="label">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function CalendarLegendMarker({
  kind,
  palette,
  styles,
}: {
  kind: CompactKeyKind;
  palette: AppPalette;
  styles: CalendarSupportStyles;
}) {
  if (kind === 'today') {
    return (
      <View accessible={false} style={styles.todayLegendMarker}>
        <AppText color={palette.canvas} style={styles.legendMarkerText} variant="caption">
          20
        </AppText>
      </View>
    );
  }
  if (kind === 'selected') {
    return (
      <View accessible={false} style={styles.selectedLegendMarker}>
        <AppIcon
          accessible={false}
          color={palette.canvas}
          name="checkmark"
          size={11}
          strokeWidth={2.4}
        />
      </View>
    );
  }
  if (kind === 'holiday' || kind === 'payday') {
    return (
      <View
        accessible={false}
        style={
          kind === 'holiday'
            ? styles.holidayLegendMarker
            : styles.paydayLegendMarker
        }>
        <AppText color={palette.canvas} style={styles.legendMarkerText} variant="caption">
          {kind === 'holiday' ? '공' : '급'}
        </AppText>
      </View>
    );
  }
  if (kind === 'note') {
    return <View accessible={false} style={styles.noteLegendMarker} />;
  }
  return <View accessible={false} style={styles.overrideLegend} />;
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
    compactKeyCard: {
      gap: spacing.medium,
      padding: spacing.large,
      borderWidth: 1,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surface,
    },
    compactKeyPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
    compactKeyHeader: {
      minHeight: 28,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    compactKeyTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
    },
    compactKeyAction: {
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.tiny,
    },
    compactKeyItems: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    compactKeyItem: {
      maxWidth: '100%',
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: palette.surfaceSoft,
    },
    legendSections: { gap: spacing.xlarge },
    legendSection: { gap: spacing.small },
    legendRows: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    legendRow: {
      width: '100%',
      maxWidth: '100%',
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radii.small,
      backgroundColor: palette.surfaceSoft,
    },
    legendRowGrid: {
      width: undefined,
      flexBasis: '46%',
      flexGrow: 1,
    },
    screenStateLegendItem: { backgroundColor: palette.surfaceSoft },
    overrideLegend: {
      width: 14,
      height: 3,
      flexShrink: 0,
      borderRadius: 2,
      backgroundColor: palette.mint,
    },
    todayLegendMarker: {
      minWidth: 24,
      height: 24,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: palette.mint,
    },
    selectedLegendMarker: {
      width: 18,
      height: 18,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.selectionBorder,
      borderRadius: radii.pill,
      backgroundColor: palette.white,
    },
    noteLegendMarker: {
      width: 8,
      height: 8,
      flexShrink: 0,
      borderRadius: radii.pill,
      backgroundColor: palette.coral,
    },
    holidayLegendItem: { backgroundColor: palette.coralSoft },
    holidayLegendMarker: {
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 5,
      backgroundColor: palette.coral,
    },
    paydayLegendItem: { backgroundColor: palette.amberSoft },
    paydayLegendMarkers: {
      flexShrink: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    paydayLegendMarker: {
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: palette.amber,
      paddingHorizontal: 2,
    },
    legendMarkerText: {
      fontSize: 10,
      lineHeight: 13,
    },
    legendCopy: { minWidth: 0, flex: 1, flexShrink: 1 },
  });
}
