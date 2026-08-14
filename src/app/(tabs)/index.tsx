import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { TodayGuidanceSection } from '@/features/today/today-guidance-section';
import { TodayHero } from '@/features/today/today-hero';
import { UpcomingWorkSection } from '@/features/today/upcoming-work-section';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useNow } from '@/hooks/use-now';
import { useScreenActive } from '@/hooks/use-screen-active';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  getAlarmPyoAlarmStatus,
  type AlarmPyoAlarmStatus,
} from '@/services/alarmpyo-alarm-service';
import {
  getAlarmPyoSleepReminderStatus,
  isSleepReminderNativeSupported,
  type SleepReminderStatus,
} from '@/services/sleep-reminder-service';
import {
  buildTodayAlarmPlanSummary,
  buildTodayViewModel,
} from '@/services/today-view-model';
import { useAppStoreData, useAppStoreStatus } from '@/store/app-store';
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
  const { alarmAutoCheckState, alarmSyncStatus, saveOutcome } = useAppStoreStatus();
  const [alarmStatus, setAlarmStatus] = useState<AlarmPyoAlarmStatus | null>(null);
  const [alarmStatusError, setAlarmStatusError] = useState(false);
  const [sleepReminderStatus, setSleepReminderStatus] =
    useState<SleepReminderStatus | null>(null);
  const [sleepReminderStatusError, setSleepReminderStatusError] = useState(false);
  const alarmStatusRequestRef = useRef(0);
  const sleepReminderSupported =
    Platform.OS === 'android' && isSleepReminderNativeSupported();
  const alarmPlanSummary = useMemo(
    () =>
      buildTodayAlarmPlanSummary({
        data,
        // 같은 날의 분 갱신으로 366일 계획을 다시 만들지 않도록 자정 기준을 사용해요.
        now: parseDateKey(today),
        resolveShift: getShiftForDate,
      }),
    [data, getShiftForDate, today],
  );

  const refreshAlarmStatus = useCallback(async () => {
    const request = alarmStatusRequestRef.current + 1;
    alarmStatusRequestRef.current = request;
    if (Platform.OS !== 'android') {
      setAlarmStatus(null);
      setAlarmStatusError(false);
      return;
    }

    try {
      const status = await getAlarmPyoAlarmStatus();
      if (request !== alarmStatusRequestRef.current) return;
      setAlarmStatus(status);
      setAlarmStatusError(false);
    } catch {
      if (request !== alarmStatusRequestRef.current) return;
      setAlarmStatus(null);
      setAlarmStatusError(true);
    }
  }, []);

  const refreshSleepReminderStatus = useCallback(async () => {
    if (!data.settings.sleepReminderEnabled || !sleepReminderSupported) {
      setSleepReminderStatus(null);
      setSleepReminderStatusError(false);
      return;
    }
    try {
      setSleepReminderStatus(await getAlarmPyoSleepReminderStatus());
      setSleepReminderStatusError(false);
    } catch {
      setSleepReminderStatus(null);
      setSleepReminderStatusError(true);
    }
  }, [data.settings.sleepReminderEnabled, sleepReminderSupported]);

  useEffect(() => {
    if (!ready || !screenActive) return;
    const timeout = setTimeout(() => {
      void refreshAlarmStatus();
      void refreshSleepReminderStatus();
    }, 0);
    return () => {
      clearTimeout(timeout);
      // 화면을 벗어난 뒤 도착한 응답이 다음 활성 상태를 덮지 않게 해요.
      alarmStatusRequestRef.current += 1;
    };
  }, [
    data.settings.lastNotificationSyncAt,
    ready,
    refreshAlarmStatus,
    refreshSleepReminderStatus,
    screenActive,
  ]);

  if (!ready) {
    return (
      <Screen contentStyle={styles.loading} scroll={false}>
        <ActivityIndicator color={palette.mintDark} size="large" />
        <AppText tone="secondary">근무표를 불러오고 있어요.</AppText>
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
    alarmPlatformSupported: Platform.OS === 'android',
    sleepReminderStatus,
    sleepReminderStatusError,
    sleepReminderSupported,
    sleepReminderSyncFailed:
      saveOutcome?.issueCode === 'sleep-reminder-sync-failed',
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
        statusLabel={viewModel.statusLabel}
      />

      <TodayGuidanceSection
        alarmHasDateOverride={Boolean(
          viewModel.scheduledAlarms[0] &&
            data.alarmOverrides[viewModel.scheduledAlarms[0].dateKey]?.mode ===
              'wake-time',
        )}
        alarmSummaryLabel={viewModel.alarmSummaryLabel}
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
