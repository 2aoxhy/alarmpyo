import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { TodayGuidanceSection } from '@/features/today/today-guidance-section';
import { TodayHero } from '@/features/today/today-hero';
import { UpcomingWorkSection } from '@/features/today/upcoming-work-section';
import { useTodayRuntimeController } from '@/features/today/use-today-runtime-controller';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useNow } from '@/hooks/use-now';
import { useScreenActive } from '@/hooks/use-screen-active';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { getSleepReminderScheduleSignature } from '@/services/sleep-reminder-planner';
import {
  buildTodayAlarmPlanSummary,
  buildTodayViewModel,
} from '@/services/today-view-model';
import {
  useAppStoreData,
  useAppStoreStatus,
} from '@/store/app-store';
import { formatKoreanDate, parseDateKey, toDateKey } from '@/utils/date';

export default function TodayScreen() {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const largeText = fontScale >= 1.25;
  const compactHome = windowWidth < 420 || largeText;
  const screenActive = useScreenActive();
  const now = useNow(screenActive);
  const today = toDateKey(now);
  const { data, ready, getShiftForDate } = useAppStoreData();
  const {
    alarmAutoCheckState,
    alarmSyncStatus,
    sleepReminderSyncStatus,
    sleepReminderSyncRevision,
  } = useAppStoreStatus();
  const {
    alarmPlatformSupported,
    runtimeStatus,
    sleepReminderSupported,
  } = useTodayRuntimeController({
    enabled: ready && screenActive,
    sleepReminderEnabled: data.settings.sleepReminderEnabled,
    runtimeRevisionKey: [
      data.settings.lastNotificationSyncAt ?? '',
      data.settings.sleepReminderEnabled
        ? `${getSleepReminderScheduleSignature(data)}:${sleepReminderSyncRevision}`
        : 'sleep-disabled',
    ].join(':'),
  });
  const alarmStatus = runtimeStatus.alarmStatus;
  const alarmStatusError = runtimeStatus.alarmStatusError;
  const sleepReminderStatus = data.settings.sleepReminderEnabled
    ? runtimeStatus.sleepReminderStatus
    : null;
  const sleepReminderStatusError = data.settings.sleepReminderEnabled
    ? runtimeStatus.sleepReminderStatusError
    : false;
  const alarmPlanSummary = useMemo(
    () =>
      buildTodayAlarmPlanSummary({
        data,
        // 같은 날의 분 갱신으로 366일 계획을 다시 만들지 않도록 자정 기준을 사용합니다.
        now: parseDateKey(today),
        resolveShift: getShiftForDate,
      }),
    [data, getShiftForDate, today],
  );

  if (!ready) {
    return (
      <Screen contentStyle={styles.loading} scroll={false}>
        <ActivityIndicator color={palette.mintDark} size="large" />
        <AppText tone="secondary">근무표를 불러오고 있습니다.</AppText>
      </Screen>
    );
  }

  const viewModel = buildTodayViewModel({
    data,
    now,
    resolveShift: getShiftForDate,
    alarmPlanSummary,
    alarmStatus,
    alarmStatusError,
    alarmAutoCheckStatus: alarmAutoCheckState.status,
    alarmSyncFailed: alarmSyncStatus === 'error',
    alarmPlatformSupported,
    sleepReminderStatus,
    sleepReminderStatusError,
    sleepReminderSupported,
    sleepReminderSyncStatus,
    compactHome,
  });
  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <AppText
          accessibilityLabel={`오늘, ${formatKoreanDate(today, true)}`}
          accessibilityRole="header"
          style={styles.headerDate}
          variant="label">
          {formatKoreanDate(today, true)}
        </AppText>
      </View>

      <TodayHero
        activeException={viewModel.activeException}
        compact={compactHome}
        editorDateKey={viewModel.editorDateKey}
        footerLabel={viewModel.footerLabel}
        footerValue={viewModel.footerValue}
        heroDetail={viewModel.heroDetail}
        heroTitle={viewModel.heroTitle}
        largeText={largeText}
        now={now}
        screenActive={screenActive}
        shift={viewModel.current?.shift ?? viewModel.todayShift}
        statusLabel={viewModel.statusLabel}
      />

      <TodayGuidanceSection
        alarmHasDateOverride={Boolean(
          viewModel.scheduledAlarms[0] &&
            data.alarmOverrides[viewModel.scheduledAlarms[0].dateKey]?.mode ===
              'wake-time',
        )}
        alarmSummary={viewModel.alarmSummary}
        alarmHealthState={viewModel.alarmHealthState}
        compact={compactHome}
        largeText={largeText}
        now={now}
        routinePlan={viewModel.workRoutinePlan}
        scheduledAlarmCount={viewModel.scheduledAlarmCount}
        sleepTimingGuidance={viewModel.sleepTimingGuidance}
      />

      <UpcomingWorkSection
        data={data}
        largeText={largeText}
        resolveShift={getShiftForDate}
        today={today}
        upcomingWorkDays={viewModel.upcomingWorkDays}
      />
    </Screen>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    screen: {
      gap: spacing.xlarge,
      paddingTop: spacing.medium,
    },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.large,
    },
    header: {
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerDate: {
      fontSize: 17,
      lineHeight: 23,
      textAlign: 'center',
    },
  });
