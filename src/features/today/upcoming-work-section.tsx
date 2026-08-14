import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  AnimatedShiftIcon,
  getShiftIconKind,
} from '@/components/animated-shift-icon';
import { AppText, Card, SectionHeader } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppData, ShiftType } from '@/models/app-data';
import { resolveDayExceptionFromAppData } from '@/services/app-data-service';
import type { ShiftMoment } from '@/services/today-view-model';
import {
  formatCompactTime,
  formatKoreanDate,
  formatMinutes,
  parseDateKey,
} from '@/utils/date';
import { getDayExceptionAppearance } from '@/utils/day-exception-appearance';
import { getDayExceptionLabel } from '@/utils/day-exception';
import { getShiftAppearance } from '@/utils/shift-appearance';

type UpcomingWorkSectionProps = {
  data: AppData;
  largeText: boolean;
  resolveShift: (dateKey: string) => ShiftType | null;
  today: string;
  upcomingWorkDays: ShiftMoment[];
};

function shortWeekday(dateKey: string) {
  return ['일', '월', '화', '수', '목', '금', '토'][
    parseDateKey(dateKey).getDay()
  ];
}

export function UpcomingWorkSection({
  data,
  largeText,
  resolveShift,
  today,
  upcomingWorkDays,
}: UpcomingWorkSectionProps) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.section}>
      <SectionHeader
        action="달력 보기"
        centered
        onAction={() => router.push('/calendar')}
        title="다가오는 근무"
      />

      {upcomingWorkDays.length > 0 ? (
        <Card density="compact" style={styles.upcomingList}>
          {upcomingWorkDays.map((moment, index) => {
            const { dateKey } = moment;
            const shift = resolveShift(dateKey) ?? moment.shift;
            const displayShift = moment.shift;
            const dayException = resolveDayExceptionFromAppData(data, dateKey);
            const exceptionLabel = dayException
              ? getDayExceptionLabel(dayException)
              : null;
            const isToday = dateKey === today;
            const shiftAppearance = getShiftAppearance(shift, palette, isDark);
            const exceptionAppearance = dayException
              ? getDayExceptionAppearance(dayException, palette)
              : null;
            const appearance = exceptionAppearance ?? shiftAppearance;
            const dateNumber = Number(dateKey.slice(-2));

            return (
              <Pressable
                key={dateKey}
                accessibilityHint="선택한 날짜의 근무를 수정해요."
                accessibilityLabel={`${formatKoreanDate(dateKey, true)}, ${exceptionLabel ? `${exceptionLabel}, ` : ''}${shift.name}, ${formatMinutes(displayShift.startMinutes)} 시작`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/day/[date]',
                    params: { date: dateKey },
                  })
                }
                style={({ pressed }) => [
                  styles.upcomingRow,
                  largeText && styles.upcomingRowLargeText,
                  index === upcomingWorkDays.length - 1 && styles.upcomingRowLast,
                  pressed && styles.rowPressed,
                ]}>
                <View style={styles.dateColumn}>
                  <AppText
                    color={isToday ? palette.mintDark : palette.ink}
                    style={styles.dateNumber}
                    variant="label">
                    {isToday ? '오늘' : `${dateNumber}일`}
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    {shortWeekday(dateKey)}요일
                  </AppText>
                </View>

                <View
                  style={[
                    styles.shiftIcon,
                    { backgroundColor: appearance.softColor },
                  ]}>
                  {exceptionAppearance ? (
                    <AppIcon
                      accessible={false}
                      color={exceptionAppearance.accentColor}
                      name={exceptionAppearance.iconName}
                      size={19}
                    />
                  ) : (
                    <AnimatedShiftIcon
                      animated={false}
                      color={shiftAppearance.accentColor}
                      kind={getShiftIconKind(shift.id, shift.isOff)}
                      size={19}
                    />
                  )}
                </View>

                <View style={styles.upcomingMain}>
                  <AppText
                    color={exceptionAppearance?.accentColor ?? palette.ink}
                    numberOfLines={largeText ? undefined : 1}
                    style={styles.shiftName}
                    variant="label">
                    {exceptionLabel ?? shift.name}
                  </AppText>
                  <AppText
                    tone="secondary"
                    numberOfLines={largeText ? undefined : 1}
                    variant="caption">
                    {exceptionLabel
                      ? `${shift.name} · ${formatCompactTime(displayShift.startMinutes)} 시작`
                      : `${formatCompactTime(displayShift.startMinutes)} 시작`}
                  </AppText>
                </View>

                <AppIcon
                  accessible={false}
                  color={palette.inkSoft}
                  name="chevron-forward"
                  size={18}
                />
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <Card style={styles.emptyUpcoming}>
          <View style={styles.emptyUpcomingIcon}>
            <AppIcon
              accessible={false}
              color={palette.inkSoft}
              name="calendar-outline"
              size={22}
            />
          </View>
          <View style={styles.emptyUpcomingCopy}>
            <AppText variant="label">예정된 근무가 없어요.</AppText>
            <AppText tone="secondary" variant="caption">
              앞으로 90일 안에 등록된 근무가 없어요.
            </AppText>
          </View>
        </Card>
      )}
    </View>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    section: {
      gap: spacing.medium,
    },
    upcomingList: {
      overflow: 'hidden',
      borderRadius: 22,
      paddingVertical: 0,
    },
    upcomingRow: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.medium,
    },
    upcomingRowLargeText: {
      alignItems: 'flex-start',
    },
    upcomingRowLast: {
      borderBottomWidth: 0,
    },
    dateColumn: {
      width: 50,
      flexShrink: 0,
      gap: 1,
    },
    dateNumber: {
      fontSize: 16,
      lineHeight: 21,
    },
    shiftIcon: {
      width: 40,
      height: 40,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
    },
    upcomingMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    shiftName: {
      fontSize: 16,
      lineHeight: 21,
    },
    emptyUpcoming: {
      minHeight: 96,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    emptyUpcomingIcon: {
      width: 42,
      height: 42,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: palette.surfaceSoft,
    },
    emptyUpcomingCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.985 }],
    },
  });
