import type { RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppSheet } from '@/components/app-sheet';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PayrollCalendarEntry } from '@/services/payroll-schedule';
import { formatCompactTime, formatKoreanDate } from '@/utils/date';
import type { KoreanHolidayInfo } from '@/utils/korean-holiday';
import {
  getCalendarDateDirectChangeCopy,
  type CalendarDateDirectChange,
} from './calendar-date-summary-presentation';

export type { CalendarDateDirectChange } from './calendar-date-summary-presentation';

export type CalendarDateScheduleSummary = {
  endsNextDay: boolean;
  endMinutes: number | null;
  label: string;
  startMinutes: number | null;
};

export type CalendarDateSummaryData = {
  actualSchedule: CalendarDateScheduleSummary | null;
  baseSchedule?: CalendarDateScheduleSummary | null;
  dateKey: string;
  directChange?: CalendarDateDirectChange;
  editable?: boolean;
  holiday?: KoreanHolidayInfo | null;
  isToday: boolean;
  note?: string | null;
  payrollEntry?: PayrollCalendarEntry | null;
};

type Props = {
  data: CalendarDateSummaryData | null;
  onClose: () => void;
  onEdit: () => void;
  triggerRef?: RefObject<React.ElementRef<typeof Pressable> | null>;
  visible: boolean;
};

export function formatCalendarDateSchedule(
  schedule: CalendarDateScheduleSummary | null | undefined,
): string {
  if (!schedule) return '일정 없음';
  const time = formatScheduleTime(schedule);
  return time ? `${schedule.label} · ${time}` : schedule.label;
}

export function CalendarDateSummarySheet({
  data,
  onClose,
  onEdit,
  triggerRef,
  visible,
}: Props) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  if (!data) return null;

  const directChange = data.directChange ?? 'none';
  const editable = data.editable ?? true;
  const hasDateInformation = Boolean(data.holiday || data.payrollEntry);
  const hasNote = Boolean(data.note?.trim());
  const fullDate = formatKoreanDate(data.dateKey, true);

  return (
    <AppSheet
      onClose={onClose}
      returnFocusRef={triggerRef}
      title="날짜 요약"
      visible={visible}>
      <View
        accessible
        accessibilityLabel={`${fullDate}${data.isToday ? ', 오늘' : ''}`}
        style={styles.dateHeader}>
        <AppText accessibilityRole="header" style={styles.dateTitle} variant="heading">
          {fullDate}
        </AppText>
        {data.isToday ? (
          <View style={styles.todayBadge}>
            <AppText color={palette.mintDark} variant="caption">
              오늘
            </AppText>
          </View>
        ) : null}
      </View>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <AppIcon
            accessible={false}
            color={palette.indigoDark}
            name="calendar-outline"
            size={20}
          />
          <AppText accessibilityRole="header" variant="label">
            실제 일정
          </AppText>
        </View>
        <ScheduleDisplay schedule={data.actualSchedule} styles={styles} />
        {editable ? (
          <View
            accessible
            accessibilityLabel={getCalendarDateDirectChangeCopy(directChange)}
            style={[
              styles.changeStatus,
              directChange === 'none'
                ? styles.changeStatusBase
                : styles.changeStatusDirect,
            ]}>
            <AppIcon
              accessible={false}
              color={directChange === 'none' ? palette.mintDark : palette.amber}
              name={
                directChange === 'none'
                  ? 'checkmark-circle'
                  : 'options-outline'
              }
              size={18}
            />
            <AppText
              color={directChange === 'none' ? palette.mintDark : palette.amber}
              style={styles.changeStatusCopy}
              variant="caption">
              {getCalendarDateDirectChangeCopy(directChange)}
            </AppText>
          </View>
        ) : null}
        {editable && directChange !== 'none' ? (
          <View style={styles.baseSchedule}>
            <AppText tone="secondary" variant="caption">
              기본 근무표
            </AppText>
            <ScheduleDisplay compact schedule={data.baseSchedule} styles={styles} />
          </View>
        ) : null}
      </Card>

      {hasDateInformation ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <AppIcon
              accessible={false}
              color={palette.indigoDark}
              name="alert-circle-outline"
              size={20}
            />
            <AppText accessibilityRole="header" variant="label">
              날짜 정보
            </AppText>
          </View>
          {data.holiday ? (
            <InformationRow
              accessibilityLabel={`공휴일, ${data.holiday.names.join(', ')}`}
              marker="공"
              markerColor={palette.coral}
              styles={styles}
              title="공휴일"
              value={data.holiday.names.join(' · ')}
            />
          ) : null}
          {data.payrollEntry ? (
            <InformationRow
              accessibilityLabel={data.payrollEntry.accessibilityLabel}
              marker={data.payrollEntry.confirmed ? '급' : '급*'}
              markerColor={palette.amber}
              round
              styles={styles}
              title={data.payrollEntry.confirmed ? '급여일' : '예상 급여일'}
              value={data.payrollEntry.accessibilityLabel}
            />
          ) : null}
        </Card>
      ) : null}

      {hasNote ? (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.noteMarker} />
            <AppText accessibilityRole="header" variant="label">
              메모
            </AppText>
          </View>
          <AppText selectable style={styles.note} variant="body">
            {data.note}
          </AppText>
        </Card>
      ) : null}

      {!editable ? (
        <View accessible accessibilityLabel="일정 적용 시작일 이전 날짜이므로 날짜 정보를 확인할 수 있지만 일정은 수정할 수 없습니다." style={styles.editUnavailable}>
          <AppIcon
            accessible={false}
            color={palette.inkMuted}
            name="alert-circle-outline"
            size={18}
          />
          <AppText style={styles.changeStatusCopy} tone="secondary" variant="caption">
            일정 적용 시작일 이전 날짜입니다. 날짜 정보는 확인할 수 있지만 일정은 수정할 수 없습니다.
          </AppText>
        </View>
      ) : null}

      <AppButton
        accessibilityHint={
          editable
            ? '이 날짜의 근무, 시간, 알람과 메모를 수정합니다.'
            : '일정 적용 시작일 이후 날짜만 수정할 수 있습니다.'
        }
        disabled={!editable}
        icon="options-outline"
        label="일정 수정"
        onPress={onEdit}
      />
    </AppSheet>
  );
}

type SummaryStyles = ReturnType<typeof createStyles>;

function formatScheduleTime(
  schedule: CalendarDateScheduleSummary | null | undefined,
): string | null {
  if (
    !schedule ||
    schedule.startMinutes === null ||
    schedule.endMinutes === null
  ) {
    return null;
  }
  return `${formatCompactTime(schedule.startMinutes)}–${
    schedule.endsNextDay ? '다음 날 ' : ''
  }${formatCompactTime(schedule.endMinutes)}`;
}

function ScheduleDisplay({
  compact = false,
  schedule,
  styles,
}: {
  compact?: boolean;
  schedule: CalendarDateScheduleSummary | null | undefined;
  styles: SummaryStyles;
}) {
  const time = formatScheduleTime(schedule);
  return (
    <View
      accessible
      accessibilityLabel={formatCalendarDateSchedule(schedule)}
      style={[styles.scheduleDisplay, compact && styles.scheduleDisplayCompact]}>
      <AppText variant={compact ? 'label' : 'heading'}>
        {schedule?.label ?? '일정 없음'}
      </AppText>
      {time ? (
        <View style={styles.timeToken}>
          <AppText style={styles.timeText} variant="label">
            {time}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function InformationRow({
  accessibilityLabel,
  marker,
  markerColor,
  round = false,
  styles,
  title,
  value,
}: {
  accessibilityLabel: string;
  marker: string;
  markerColor: string;
  round?: boolean;
  styles: SummaryStyles;
  title: string;
  value: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.informationRow}>
      <View
        accessible={false}
        style={[
          styles.informationMarker,
          round && styles.informationMarkerRound,
          { backgroundColor: markerColor },
        ]}>
        <AppText style={styles.informationMarkerText} variant="caption">
          {marker}
        </AppText>
      </View>
      <View style={styles.informationCopy}>
        <AppText variant="label">{title}</AppText>
        <AppText tone="secondary" variant="caption">
          {value}
        </AppText>
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    dateHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
    },
    dateTitle: { minWidth: 0, textAlign: 'center' },
    todayBadge: {
      minHeight: 30,
      justifyContent: 'center',
      paddingHorizontal: spacing.medium,
      borderRadius: radii.pill,
      backgroundColor: palette.mintSoft,
    },
    sectionCard: { gap: spacing.medium },
    sectionHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
    },
    scheduleDisplay: {
      alignItems: 'flex-start',
      gap: spacing.small,
    },
    scheduleDisplayCompact: { gap: spacing.tiny },
    timeToken: {
      maxWidth: '100%',
      flexShrink: 0,
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderRadius: radii.small,
      backgroundColor: palette.surfaceSoft,
    },
    timeText: { fontVariant: ['tabular-nums'] },
    changeStatus: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.small,
      padding: spacing.medium,
      borderRadius: radii.small,
    },
    changeStatusBase: { backgroundColor: palette.mintSoft },
    changeStatusDirect: { backgroundColor: palette.amberSoft },
    changeStatusCopy: { minWidth: 0, flex: 1 },
    baseSchedule: {
      gap: spacing.small,
      paddingTop: spacing.medium,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    informationRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.medium,
      paddingTop: spacing.medium,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    informationMarker: {
      minWidth: 24,
      height: 24,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderRadius: 6,
    },
    informationMarkerRound: { borderRadius: radii.pill },
    informationMarkerText: {
      color: palette.canvas,
      fontSize: 10,
      lineHeight: 13,
    },
    informationCopy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    noteMarker: {
      width: 8,
      height: 8,
      borderRadius: radii.pill,
      backgroundColor: palette.coral,
    },
    note: { minWidth: 0 },
    editUnavailable: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.small,
      padding: spacing.medium,
      borderRadius: radii.small,
      backgroundColor: palette.surfaceSoft,
    },
  });
}
