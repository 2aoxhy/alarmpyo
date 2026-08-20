import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
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
import { PlayUpdateBanner } from '@/features/update/play-update-banner';
import { useAppLifecycle } from '@/hooks/use-app-active';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAlarmRuntimeStatus } from '@/hooks/use-alarm-runtime-status';
import { useNow } from '@/hooks/use-now';
import { useScreenActive } from '@/hooks/use-screen-active';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  isSleepReminderNativeSupported,
} from '@/services/sleep-reminder-service';
import { openGooglePlayListing } from '@/services/app-distribution';
import {
  completeFlexiblePlayUpdate,
  getPlayUpdateStatusForTransition,
  shouldPollPlayUpdate,
  shouldShowPlayUpdate,
  startFlexiblePlayUpdate,
  type PlayUpdateStatus,
} from '@/services/play-app-update-service';
import { getSleepReminderScheduleSignature } from '@/services/sleep-reminder-planner';
import {
  buildTodayAlarmPlanSummary,
  buildTodayViewModel,
} from '@/services/today-view-model';
import {
  useAppStoreActions,
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
  const appLifecycle = useAppLifecycle();
  const now = useNow(screenActive);
  const today = toDateKey(now);
  const { data, ready, getShiftForDate } = useAppStoreData();
  const { dismissPlayUpdate } = useAppStoreActions();
  const [playUpdateStatus, setPlayUpdateStatus] =
    useState<PlayUpdateStatus | null>(null);
  const [playUpdateBusy, setPlayUpdateBusy] = useState(false);
  const {
    alarmAutoCheckState,
    alarmSyncStatus,
    sleepReminderSyncStatus,
    sleepReminderSyncRevision,
  } = useAppStoreStatus();
  const sleepReminderSupported =
    Platform.OS === 'android' && isSleepReminderNativeSupported();
  const runtimeStatus = useAlarmRuntimeStatus({
    enabled: ready && screenActive,
    includeSleepReminder:
      data.settings.sleepReminderEnabled && sleepReminderSupported,
    revisionKey: [
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

  useEffect(() => {
    if (!ready || !screenActive) return;
    let cancelled = false;
    void getPlayUpdateStatusForTransition(appLifecycle.transitionId).then(
      (status) => {
        if (cancelled) return;
        setPlayUpdateStatus(
          shouldShowPlayUpdate(
            status,
            data.settings.dismissedUpdateVersionCode,
          )
            ? status
            : null,
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    appLifecycle.transitionId,
    ready,
    screenActive,
    data.settings.dismissedUpdateVersionCode,
  ]);

  useEffect(() => {
    if (
      !screenActive ||
      playUpdateBusy ||
      !playUpdateStatus ||
      !shouldPollPlayUpdate(playUpdateStatus)
    ) {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void getPlayUpdateStatusForTransition(
        appLifecycle.transitionId,
        true,
      ).then((status) => {
        if (!cancelled) {
          setPlayUpdateStatus(
            shouldShowPlayUpdate(
              status,
              data.settings.dismissedUpdateVersionCode,
            )
              ? status
              : null,
          );
        }
      });
    }, 1_500);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    appLifecycle.transitionId,
    playUpdateBusy,
    playUpdateStatus,
    screenActive,
    data.settings.dismissedUpdateVersionCode,
  ]);

  const startPlayUpdate = async () => {
    if (!playUpdateStatus || playUpdateBusy) return;
    setPlayUpdateBusy(true);
    try {
      if (!playUpdateStatus.flexibleAllowed) {
        await openGooglePlayListing();
        return;
      }
      const status = await startFlexiblePlayUpdate();
      setPlayUpdateStatus(
        shouldShowPlayUpdate(
          status,
          data.settings.dismissedUpdateVersionCode,
        )
          ? status
          : null,
      );
      if (status.state === 'failed') {
        void AccessibilityInfo.announceForAccessibility(
          '업데이트를 시작하지 못했습니다. 다시 시도할 수 있습니다.',
        );
      }
    } catch {
      void AccessibilityInfo.announceForAccessibility(
        'Google Play 업데이트를 열지 못했습니다.',
      );
    } finally {
      setPlayUpdateBusy(false);
    }
  };

  const installPlayUpdate = async () => {
    if (!playUpdateStatus || playUpdateBusy) return;
    setPlayUpdateBusy(true);
    try {
      const status = await completeFlexiblePlayUpdate();
      setPlayUpdateStatus(
        shouldShowPlayUpdate(
          status,
          data.settings.dismissedUpdateVersionCode,
        )
          ? status
          : null,
      );
    } finally {
      setPlayUpdateBusy(false);
    }
  };

  const dismissUpdate = async () => {
    const versionCode = playUpdateStatus?.availableVersionCode ?? 0;
    if (versionCode <= 0 || playUpdateBusy) return;
    setPlayUpdateBusy(true);
    try {
      const saved = await dismissPlayUpdate(versionCode);
      if (saved) setPlayUpdateStatus(null);
    } finally {
      setPlayUpdateBusy(false);
    }
  };

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
    alarmPlatformSupported: Platform.OS === 'android',
    sleepReminderStatus,
    sleepReminderStatusError,
    sleepReminderSupported,
    sleepReminderSyncStatus,
    compactHome,
  });

  return (
    <Screen contentStyle={styles.screen}>
      {playUpdateStatus ? (
        <PlayUpdateBanner
          busy={playUpdateBusy}
          onDismiss={() => void dismissUpdate()}
          onInstall={() => void installPlayUpdate()}
          onStart={() => void startPlayUpdate()}
          status={playUpdateStatus}
        />
      ) : null}
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
