import { router, Stack, useFocusEffect } from "expo-router";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  View,
} from "react-native";

import { useAppDialog } from "@/components/app-dialog";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import {
  AnimatedShiftIcon,
  getShiftIconKind,
} from "@/components/animated-shift-icon";
import {
  AppButton,
  AppText,
  Card,
  ListRow,
  MenuDivider,
  MenuGroup,
  Screen,
} from "@/components/ui-kit";
import { radii, spacing, type AppPalette } from "@/constants/app-theme";
import { DisclosureRow, StatusBanner, ToggleRow } from "@/design-system";
import { AlarmPermissionChecklist } from "@/features/alarm/alarm-permission-checklist";
import { AlarmSoundSettings } from "@/features/alarm/alarm-sound-settings";
import { SleepReminderToggle } from "@/features/alarm/sleep-reminder-toggle";
import {
  resolveAlarmScheduleEmptyCopy,
  resolveAlarmStatusBannerTone,
  resolveVisibleAlarmAutoCheckStatus,
} from "@/features/alarm/alarm-settings-view-model";
import { formatWakeTimeSummary } from "@/features/shift-settings/shift-settings-model";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useNow } from "@/hooks/use-now";
import { useScreenActive } from "@/hooks/use-screen-active";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import {
  buildAlarmPyoAlarmPlan,
  resolveAlarmPyoAlarmShift,
} from "@/services/alarm-planner";
import { resolveAlarmHealthState } from "@/services/alarm-access-summary";
import {
  getAlarmPyoAlarmStatus,
  openAlarmPyoAlarmPermissionSettings,
  openAlarmPyoFullScreenPermissionSettings,
  openAlarmPyoBatterySettings,
  openAlarmPyoDoNotDisturbSettings,
  type AlarmPyoAlarmEventType,
  type AlarmPyoAlarmHistoryEvent,
  type AlarmPyoAlarmStatus,
} from "@/services/alarmpyo-alarm-service";
import {
  getAlarmPyoSleepReminderStatus,
  isSleepReminderNativeSupported,
  openAlarmPyoSleepReminderSettings,
  type SleepReminderStatus,
} from "@/services/sleep-reminder-service";
import { useAppStore, useAppStoreData } from "@/store/app-store";
import { formatAlarmCountdown } from "@/utils/date";
import { getDayExceptionAppearance } from "@/utils/day-exception-appearance";
import { usesDayAlarmForException } from "@/utils/day-exception";
import { getShiftAppearance } from "@/utils/shift-appearance";

const ALARM_HISTORY_WARNING_TYPES = new Set<AlarmPyoAlarmEventType>([
  "playback_failed",
  "retry_started",
  "retry_scheduled",
  "retry_exhausted",
]);

const AlarmNowContext = createContext<Date | null>(null);

function AlarmNowProvider({
  active,
  children,
}: PropsWithChildren<{ active: boolean }>) {
  const now = useNow(active);
  return (
    <AlarmNowContext.Provider value={now}>
      {children}
    </AlarmNowContext.Provider>
  );
}

function useAlarmNow(): Date {
  return useContext(AlarmNowContext) ?? new Date();
}

function alarmHistoryIcon(type: AlarmPyoAlarmEventType): AppIconName {
  switch (type) {
    case "playback_confirmed":
    case "dismissed":
      return "checkmark-circle";
    case "snoozed":
    case "auto_repeat_scheduled":
      return "time-outline";
    case "auto_repeat_started":
    case "retry_started":
    case "retry_scheduled":
      return "refresh-outline";
    case "playback_failed":
    case "retry_exhausted":
      return "alert-circle-outline";
  }
}

function alarmHistoryLabel(event: AlarmPyoAlarmHistoryEvent): string {
  switch (event.type) {
    case "playback_confirmed":
      return "알람이 울렸어요";
    case "dismissed":
      return "알람을 껐어요";
    case "snoozed":
      return "5분 뒤 다시 울리도록 했어요";
    case "auto_repeat_scheduled":
      return event.isTest ? "시험 재알람을 예약했어요" : "재알람을 예약했어요";
    case "auto_repeat_started":
      return event.isTest ? "시험 재알람이 울렸어요" : "재알람이 울렸어요";
    case "playback_failed":
      return "알람 소리를 재생하지 못했어요";
    case "retry_started":
      return `${Math.max(1, event.deliveryAttempt)}차 재생을 다시 시도했어요`;
    case "retry_scheduled":
      return "알람 재시도를 예약했어요";
    case "retry_exhausted":
      return "알람 재시도를 마쳤어요";
  }
}

function alarmHistoryDetail(event: AlarmPyoAlarmHistoryEvent): string {
  const shiftName = event.isTest ? "시험 알람" : event.shiftName || "근무 알람";
  if (
    (event.type === "retry_scheduled" ||
      event.type === "auto_repeat_scheduled" ||
      event.type === "snoozed") &&
    event.nextAlarmAt > 0
  ) {
    const nextTime = new Date(event.nextAlarmAt).toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${shiftName} · ${nextTime}에 다시 울려요`;
  }
  switch (event.type) {
    case "playback_confirmed":
      return `${shiftName} · 소리가 정상적으로 시작됐어요`;
    case "dismissed":
      return `${shiftName} · 알람을 직접 껐어요`;
    case "snoozed":
      return `${shiftName} · 5분 뒤 한 번 더 울려요`;
    case "auto_repeat_scheduled":
      return `${shiftName} · 끄지 않으면 5분 뒤 한 번 더 울려요`;
    case "auto_repeat_started":
      return `${shiftName} · 마지막 재알람이 시작됐어요`;
    case "playback_failed":
      return `${shiftName} · 대체 알람음까지 재생하지 못했어요`;
    case "retry_started":
      return `${shiftName} · 알람 재생을 다시 시도했어요`;
    case "retry_scheduled":
      return `${shiftName} · 알람 재시도를 준비했어요`;
    case "retry_exhausted":
      return `${shiftName} · 다시 시도했지만 소리를 재생하지 못했어요`;
  }
}

function formatAlarmHistoryTime(occurredAt: number): string {
  return new Date(occurredAt).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAlarmAutoCheckTime(value: string | null): string | null {
  if (!value) return null;
  const checkedAt = new Date(value);
  if (Number.isNaN(checkedAt.getTime())) return null;
  return checkedAt.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAlarmPlanCoverage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '아직 유효 기간 정보가 없어요.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '유효 기간 정보를 확인하지 못했어요.';
  return `${date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}까지 자동 예약 계획을 보관해요.`;
}

export default function AlarmSettingsScreen() {
  const { showDialog } = useAppDialog();
  const {
    alarmAutoCheckState,
    alarmSyncStatus,
    data,
    disableAlarms,
    enableAlarms,
    getShiftForDate,
    resyncAlarms,
    sendTestAlarm,
    setSleepReminderEnabled,
    sleepReminderSyncStatus,
  } = useAppStore();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const screenActive = useScreenActive();
  const [alarmStatus, setAlarmStatus] = useState<AlarmPyoAlarmStatus | null>(null);
  const [alarmStatusError, setAlarmStatusError] = useState(false);
  const [alarmBusy, setAlarmBusy] = useState(false);
  const [sleepReminderBusy, setSleepReminderBusy] = useState(false);
  const [sleepReminderStatus, setSleepReminderStatus] =
    useState<SleepReminderStatus | null>(null);
  const [sleepReminderStatusError, setSleepReminderStatusError] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const alarmPlatformSupported = Platform.OS === "android";
  const sleepReminderSupported =
    alarmPlatformSupported && isSleepReminderNativeSupported();
  const alarmSyncVersion = data.settings.lastNotificationSyncAt;

  const refreshAlarmState = useCallback(async () => {
    if (!alarmPlatformSupported) {
      setAlarmStatus(null);
      setAlarmStatusError(false);
      return;
    }
    try {
      setAlarmStatus(await getAlarmPyoAlarmStatus());
      setAlarmStatusError(false);
    } catch {
      setAlarmStatus(null);
      setAlarmStatusError(true);
    }
  }, [alarmPlatformSupported]);

  const refreshSleepReminderState = useCallback(async () => {
    if (!sleepReminderSupported) {
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
  }, [sleepReminderSupported]);

  useFocusEffect(
    useCallback(() => {
      void alarmSyncVersion;
      void refreshAlarmState();
      void refreshSleepReminderState();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          void refreshAlarmState();
          void refreshSleepReminderState();
        }
      });
      return () => subscription.remove();
    }, [alarmSyncVersion, refreshAlarmState, refreshSleepReminderState]),
  );

  const plannedAlarms = useMemo(
    () => buildAlarmPyoAlarmPlan(data, getShiftForDate),
    [data, getShiftForDate],
  );
  const totalPlannedAlarmCount = plannedAlarms.length;
  const alarmLeadSummary = useMemo(() => {
    const activeShiftIds = new Set(data.pattern.shiftTypeIds);
    return `${formatWakeTimeSummary(
      data.shiftTypes,
      activeShiftIds.has("night"),
      activeShiftIds.has("evening"),
      activeShiftIds.has("day"),
    )} · 교육·예비군은 주간 설정`;
  }, [data.pattern.shiftTypeIds, data.shiftTypes]);
  const scheduledAlarms = alarmStatus?.scheduledAlarms ?? [];
  const recentAlarmEvents = alarmStatus?.recentEvents ?? [];
  const nearestAlarm = scheduledAlarms[0];
  const scheduledCount =
    alarmStatus?.scheduledCount ?? data.settings.scheduledNotificationCount;
  const visibleAlarmAutoCheckStatus = resolveVisibleAlarmAutoCheckStatus({
    alarmStatus,
    notificationsEnabled: data.settings.notificationsEnabled,
    plannedAlarms,
    status: alarmAutoCheckState.status,
  });
  const accessSummary = resolveAlarmHealthState({
    actualScheduledCount: scheduledCount,
    alarmAutoCheckStatus: visibleAlarmAutoCheckStatus,
    alarmStatus,
    alarmStatusError,
    alarmSyncFailed: alarmSyncStatus === 'error',
    notificationsEnabled: data.settings.notificationsEnabled,
    sleepReminderEnabled: data.settings.sleepReminderEnabled,
    sleepReminderStatus,
    sleepReminderStatusError,
    sleepReminderSupported,
    sleepReminderSyncStatus,
    totalPlannedAlarmCount,
    platformSupported: alarmPlatformSupported,
  });
  const alarmAutoCheckTime =
    alarmAutoCheckState.status === "ready" ||
    alarmAutoCheckState.status === "recovered"
      ? formatAlarmAutoCheckTime(alarmAutoCheckState.checkedAt)
      : null;
  const accessDescription = alarmAutoCheckTime
    ? `${accessSummary.description} ${alarmAutoCheckTime}에 점검했어요.`
    : accessSummary.description;
  const accessIcon: AppIconName =
    accessSummary.tone === "ready"
      ? "checkmark-circle"
      : accessSummary.tone === "warning"
        ? "alert-circle-outline"
        : data.settings.notificationsEnabled
          ? "time-outline"
          : "notifications-off-outline";
  const nextAlarmTitle = nearestAlarm
    ? `${nearestAlarm.shiftName} · ${new Date(nearestAlarm.alarmAt).toLocaleTimeString("ko-KR", {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "예약된 알람";
  const scheduleEmptyCopy = resolveAlarmScheduleEmptyCopy({
    notificationsEnabled: data.settings.notificationsEnabled,
    plannedAlarmCount: totalPlannedAlarmCount,
  });
  const latestAlarmNeedsAttention = Boolean(
    recentAlarmEvents[0] &&
    ALARM_HISTORY_WARNING_TYPES.has(recentAlarmEvents[0].type),
  );

  const openAlarmSettings = useCallback(async () => {
    try {
      await openAlarmPyoAlarmPermissionSettings();
    } catch {
      showDialog(
        "설정을 열지 못했어요",
        "휴대폰 설정에서 알람표의 알람 권한을 확인해 주세요.",
      );
    } finally {
      void refreshAlarmState();
    }
  }, [refreshAlarmState, showDialog]);

  const openDoNotDisturbSettings = useCallback(async () => {
    try {
      const opened = await openAlarmPyoDoNotDisturbSettings();
      if (!opened) throw new Error('unsupported');
    } catch {
      showDialog(
        "방해 금지 설정을 열지 못했어요",
        "휴대폰 설정에서 방해 금지 중 알람 허용 여부를 확인해 주세요.",
      );
    } finally {
      void refreshAlarmState();
    }
  }, [refreshAlarmState, showDialog]);

  const openFullScreenSettings = useCallback(async () => {
    try {
      const opened = await openAlarmPyoFullScreenPermissionSettings();
      if (!opened) throw new Error('unsupported');
    } catch {
      showDialog(
        '설정을 열지 못했어요',
        '휴대폰 설정에서 알람표의 전체 화면 알람 권한을 확인해 주세요.',
      );
    } finally {
      void refreshAlarmState();
    }
  }, [refreshAlarmState, showDialog]);

  const openBatterySettings = useCallback(async () => {
    try {
      const opened = await openAlarmPyoBatterySettings();
      if (!opened) throw new Error("unsupported");
    } catch {
      showDialog(
        "배터리 설정을 열지 못했어요",
        "휴대폰 설정에서 알람표의 배터리 사용을 제한하지 않음으로 설정해 주세요.",
      );
    } finally {
      void refreshAlarmState();
    }
  }, [refreshAlarmState, showDialog]);

  const toggleAlarms = async (enabled: boolean) => {
    if (alarmBusy) return;
    if (enabled && !alarmPlatformSupported) {
      showDialog(
        "안드로이드에서 사용할 수 있어요",
        "근무 알람은 안드로이드 휴대폰에서 사용할 수 있어요.",
      );
      return;
    }
    setAlarmBusy(true);
    try {
      if (!enabled) {
        const disabled = await disableAlarms();
        if (!disabled) {
          showDialog(
            "알람을 끄지 못했어요",
            "예약된 알람을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
        }
      } else {
        // 권한 설정 화면에서 돌아오면 상태 카드가 다음 필요한 조치 하나를 안내해요.
        await enableAlarms();
      }
    } catch {
      showDialog(
        enabled ? "알람을 켜지 못했어요" : "알람을 끄지 못했어요",
        "잠시 후 다시 시도해 주세요.",
      );
    } finally {
      await refreshAlarmState();
      setAlarmBusy(false);
    }
  };

  const runAccessAction = () => {
    if (
      alarmBusy ||
      sleepReminderBusy ||
      accessSummary.action === "none"
    ) return;
    if (accessSummary.action === 'retry-sleep-reminders') {
      void retrySleepReminderStorage();
      return;
    }
    if (accessSummary.action === 'open-sleep-settings') {
      void openSleepReminderSettings();
      return;
    }
    setAlarmBusy(true);

    if (accessSummary.action === "open-settings") {
      void openAlarmSettings().finally(() => setAlarmBusy(false));
      return;
    }
    if (accessSummary.action === 'open-full-screen-settings') {
      void openFullScreenSettings().finally(() => setAlarmBusy(false));
      return;
    }
    if (accessSummary.action === "open-dnd-settings") {
      void openDoNotDisturbSettings().finally(() => setAlarmBusy(false));
      return;
    }
    if (accessSummary.action === "open-battery-settings") {
      void openBatterySettings().finally(() => setAlarmBusy(false));
      return;
    }
    if (accessSummary.action === "resync") {
      void resyncAlarms(true)
        .then((synced) => {
          if (!synced) {
            showDialog(
              "알람을 다시 예약하지 못했어요",
              "알람 권한을 확인한 뒤 다시 시도해 주세요.",
            );
          }
          return refreshAlarmState();
        })
        .finally(() => setAlarmBusy(false));
      return;
    }
    void refreshAlarmState().finally(() => setAlarmBusy(false));
  };

  const testAlarm = async () => {
    if (!alarmPlatformSupported) {
      showDialog(
        "안드로이드에서 시험할 수 있어요",
        "실제 알람 화면과 소리는 안드로이드 휴대폰에서 확인할 수 있어요.",
      );
      return;
    }
    setTestBusy(true);
    try {
      const success = await sendTestAlarm();
      if (success) {
        showDialog(
          "시험 알람을 예약했어요",
          "5초 뒤 전체 화면으로 시험 알람이 울려요.",
        );
      } else {
        showDialog(
          "시험 알람을 예약하지 못했어요",
          "알람 권한을 확인한 뒤 다시 시험해 주세요.",
          [
            { text: "뒤로 가기", style: "cancel" },
            {
              text: "알람 권한 설정하기",
              onPress: () => void openAlarmSettings(),
            },
          ],
        );
      }
    } catch {
      showDialog(
        "시험 알람을 예약하지 못했어요",
        "잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setTestBusy(false);
      void refreshAlarmState();
    }
  };

  const toggleSleepReminder = async (enabled: boolean) => {
    if (sleepReminderBusy) return;
    setSleepReminderBusy(true);
    try {
      const saved = await setSleepReminderEnabled(enabled);
      if (!saved) {
        showDialog(
          "수면 시작 알림을 저장하지 못했어요",
          "저장 공간을 확인한 뒤 다시 시도해 주세요.",
        );
      } else if (alarmPlatformSupported) {
        const status = await getAlarmPyoSleepReminderStatus().catch(() => null);
        if (status !== null) setSleepReminderStatus(status);
        if (status?.storageHealth === "corrupt") {
          showDialog(
            enabled
              ? "수면 알림 계획을 아직 복구하지 못했어요"
              : "설정은 껐지만 확인이 필요해요",
            enabled
              ? "기존 예약은 임의로 지우지 않았어요. 현재 일정에 예정된 수면 알림이 생기면 복구를 다시 시도해 주세요."
              : "수면 시작 알림 설정은 껐지만 이전 예약을 안전하게 확인하거나 지우지 못했어요. 알람 화면에서 복구를 다시 시도해 주세요.",
          );
        } else if (
          enabled &&
          status?.supported &&
          !status.notificationsAllowed
        ) {
          showDialog(
            "수면 시작 알림을 켰어요",
            "일반 알림 권한을 허용하면 권장 취침 시각에 알려요.",
          );
        }
      }
    } catch {
      showDialog(
        "수면 시작 알림을 저장하지 못했어요",
        "잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setSleepReminderBusy(false);
    }
  };

  const retrySleepReminderStorage = async () => {
    if (sleepReminderBusy) return;
    setSleepReminderBusy(true);
    try {
      const saved = await setSleepReminderEnabled(true);
      if (!saved) {
        showDialog(
          "복구 설정을 저장하지 못했어요",
          "저장 공간을 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }

      const status = await getAlarmPyoSleepReminderStatus().catch(() => null);
      if (status !== null) setSleepReminderStatus(status);
      if (!status?.supported) {
        showDialog(
          "복구 상태를 확인하지 못했어요",
          "앱을 다시 연 뒤 알람 화면에서 상태를 확인해 주세요.",
        );
      } else if (status.storageHealth === "corrupt") {
        showDialog(
          "아직 복구하지 못했어요",
          "현재 일정에 예정된 수면 알림이 없어 손상된 계획을 안전하게 바꾸지 않았어요. 다음 근무 일정이 생긴 뒤 다시 시도해 주세요.",
        );
      } else {
        showDialog(
          "수면 알림 계획을 복구했어요",
          "현재 일정과 예약 상태를 다시 확인했어요.",
        );
      }
    } catch {
      showDialog(
        "수면 알림 계획을 복구하지 못했어요",
        "잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setSleepReminderBusy(false);
    }
  };

  const openSleepReminderSettings = async () => {
    if (sleepReminderBusy) return;
    setSleepReminderBusy(true);
    try {
      setSleepReminderStatus(await openAlarmPyoSleepReminderSettings());
    } catch {
      showDialog(
        "수면 알림 설정을 열지 못했어요",
        "휴대폰 설정에서 알람표 알림 권한을 확인해 주세요.",
      );
    } finally {
      setSleepReminderBusy(false);
    }
  };

  return (
    <AlarmNowProvider
      active={screenActive && data.settings.notificationsEnabled}>
      <Stack.Screen options={{ title: "알람" }} />
      <Screen contentStyle={styles.screenContent} safeAreaEdges={['left', 'right']}>
        <Card elevated style={styles.statusCard}>
          <ToggleRow
            disabled={alarmBusy || !alarmPlatformSupported}
            icon="alarm-outline"
            onValueChange={(enabled) => void toggleAlarms(enabled)}
            style={styles.alarmToggle}
            testID="alarm-enabled-toggle"
            title="근무 알람"
            subtitle={
              data.settings.notificationsEnabled
                ? "다음 근무에 맞춰 자동으로 예약해요."
                : "켜면 다음 근무부터 자동으로 예약해요."
            }
            value={data.settings.notificationsEnabled}
          />
          <StatusBanner
            announceChanges
            icon={accessIcon}
            message={accessDescription}
            testID="alarm-access-status"
            title={accessSummary.title}
            tone={resolveAlarmStatusBannerTone(accessSummary.tone)}
          />
          {accessSummary.action !== "none" && accessSummary.actionLabel ? (
            <AppButton
              accessibilityHint="휴대폰의 알람 상태를 준비해요."
              icon={
                accessSummary.action === "resync" ||
                accessSummary.action === "retry" ||
                accessSummary.action === 'retry-sleep-reminders'
                  ? "refresh-outline"
                  : "settings-outline"
              }
              label={accessSummary.actionLabel}
              loading={alarmBusy || sleepReminderBusy}
              onPress={runAccessAction}
              style={styles.fullWidthButton}
              variant="secondary"
            />
          ) : null}
        </Card>

        {data.settings.notificationsEnabled || scheduledCount > 0 ? (
          <MenuGroup title="다음 알람">
            <NextAlarmDisclosureRow
              expanded={scheduleOpen}
              hasDateOverride={Boolean(
                nearestAlarm &&
                  data.alarmOverrides[nearestAlarm.dateKey]?.mode === "wake-time"
              )}
              nearestAlarm={nearestAlarm}
              onPress={() => setScheduleOpen((open) => !open)}
              scheduledCount={scheduledCount}
              title={nextAlarmTitle}
            />
            {scheduleOpen ? (
              <View style={styles.disclosureBody}>
                {scheduledAlarms.length > 0 ? (
                  scheduledAlarms.map((alarm, index) => (
                    <View key={alarm.id} style={[index > 0 && styles.rowDivider]}>
                      <AlarmRow alarm={alarm} />
                    </View>
                  ))
                ) : (
                  <AppText
                    tone="secondary"
                    style={styles.disclosureEmptyCopy}
                    variant="caption">
                    {scheduleEmptyCopy}
                  </AppText>
                )}
              </View>
            ) : null}
          </MenuGroup>
        ) : null}

        <MenuGroup title="알림 설정">
          <ListRow
            icon="alarm-outline"
            onPress={() => router.push("/shift-settings?focus=wake")}
            subtitle={alarmLeadSummary}
            title="기상 시간"
            allowSubtitleWrapping
          />
          {sleepReminderSupported ? <MenuDivider /> : null}
          {sleepReminderSupported ? (
            <SleepReminderToggle
              disabled={sleepReminderBusy}
              onValueChange={(enabled) => void toggleSleepReminder(enabled)}
              value={data.settings.sleepReminderEnabled}
            />
          ) : null}
        </MenuGroup>

        <View style={styles.detailsSection}>
          <DisclosureRow
            expanded={managementOpen}
            icon={
              latestAlarmNeedsAttention
                ? "alert-circle-outline"
                : "options-outline"
            }
            onPress={() => setManagementOpen((open) => !open)}
            style={styles.detailsDisclosure}
            subtitle={
              alarmPlatformSupported && recentAlarmEvents.length > 0
                ? `알람음·진동 · 시험 · 권한 · 기록 ${recentAlarmEvents.length}개`
                : "알람음·진동 · 시험 · 권한"
            }
            testID="alarm-management-disclosure"
            title="알람 관리"
          />
          {managementOpen ? (
            <View style={styles.managementBody}>
              {alarmPlatformSupported && data.settings.notificationsEnabled ? (
                <StatusBanner
                  icon="alert-circle-outline"
                  message="휴대폰 설정에서 알람표를 강제 종료하면 앱을 다시 열 때까지 예약 복구와 알람 전달을 보장할 수 없어요."
                  title="강제 종료 상태에서는 알람을 보장할 수 없어요"
                  tone="warning"
                />
              ) : null}
              <AlarmSoundSettings />

              <Card style={styles.testCard}>
                <View style={styles.testHeader}>
                  <View style={styles.testIcon}>
                    <AppIcon
                      accessible={false}
                      color={palette.indigoDark}
                      name="notifications-outline"
                      size={22}
                    />
                  </View>
                  <View style={styles.flexCopy}>
                    <AppText variant="heading">알람 작동 확인</AppText>
                    <AppText tone="secondary" variant="caption">
                      {accessSummary.canTest
                        ? "5초 뒤 전체 화면과 소리를 확인해요."
                        : "위 안내에 따라 알람 권한을 먼저 준비해 주세요."}
                    </AppText>
                  </View>
                </View>
                <AppButton
                  disabled={!accessSummary.canTest || alarmBusy}
                  icon="alarm-outline"
                  label="시험 알람 울리기"
                  loading={testBusy}
                  onPress={() => void testAlarm()}
                  style={styles.fullWidthButton}
                  variant="secondary"
                />
              </Card>

              {alarmPlatformSupported ? (
                <Card density="compact" style={styles.detailsCard}>
                  <View style={styles.detailBlock}>
                    <AppText variant="label">권한 상태</AppText>
                    <AlarmPermissionChecklist status={alarmStatus} />
                  </View>
                  <MenuDivider inset={false} />
                  <View style={styles.detailBlock}>
                    <AppText variant="label">알람 계획 유효 기간</AppText>
                    <AppText tone="secondary" variant="caption">
                      {formatAlarmPlanCoverage(alarmStatus?.plannedThroughAt ?? 0)}
                    </AppText>
                  </View>
                  <MenuDivider inset={false} />
                  <View style={styles.detailBlock}>
                    <AppText variant="label">최근 알람 기록</AppText>
                    {recentAlarmEvents.length > 0 ? (
                      recentAlarmEvents.map((event, index) => (
                        <AlarmHistoryRow
                          event={event}
                          key={event.id}
                          separated={index > 0}
                        />
                      ))
                    ) : (
                      <AppText
                        tone="secondary"
                        style={styles.detailEmptyCopy}
                        variant="caption"
                      >
                        아직 저장된 알람 기록이 없어요.
                      </AppText>
                    )}
                  </View>
                </Card>
              ) : null}
            </View>
          ) : null}
        </View>
      </Screen>
    </AlarmNowProvider>
  );
}

function NextAlarmDisclosureRow({
  expanded,
  hasDateOverride,
  nearestAlarm,
  onPress,
  scheduledCount,
  title,
}: {
  expanded: boolean;
  hasDateOverride: boolean;
  nearestAlarm: AlarmPyoAlarmStatus["scheduledAlarms"][number] | undefined;
  onPress: () => void;
  scheduledCount: number;
  title: string;
}) {
  const now = useAlarmNow();
  const subtitle = nearestAlarm
    ? `${nearestAlarm.shiftName} · ${new Date(nearestAlarm.alarmAt).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })} · ${formatAlarmCountdown(nearestAlarm.alarmAt, now)}${
        hasDateOverride ? " · 이날만 설정" : ""
      }`
    : scheduledCount > 0
      ? `${scheduledCount}개가 예약되어 있어요.`
      : "예약된 알람이 없어요.";

  return (
    <ListRow
      allowSubtitleWrapping
      expanded={expanded}
      icon="calendar-outline"
      onPress={onPress}
      subtitle={subtitle}
      title={title}
      trailing={<DisclosureIcon open={expanded} />}
    />
  );
}

function AlarmRow({
  alarm,
}: {
  alarm: AlarmPyoAlarmStatus["scheduledAlarms"][number];
}) {
  const now = useAlarmNow();
  const { data } = useAppStoreData();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const alarmShift = resolveAlarmPyoAlarmShift(data.shiftTypes, alarm);
  const hasDateOverride =
    data.alarmOverrides[alarm.dateKey]?.mode === "wake-time";
  const substituteAlarm = alarm.shiftTypeId === "substitute";
  const storedException = data.dayExceptions[alarm.dateKey];
  const dayAlarmException =
    storedException && usesDayAlarmForException(storedException)
      ? storedException
      : alarm.shiftName === "교육"
        ? "training"
        : alarm.shiftName === "예비군"
          ? "reserve"
          : null;
  const exceptionAppearance = dayAlarmException
    ? getDayExceptionAppearance(dayAlarmException, palette)
    : null;
  const appearance = exceptionAppearance ??
    (alarmShift
      ? getShiftAppearance(alarmShift, palette, isDark)
      : substituteAlarm
        ? { accentColor: palette.amber, softColor: palette.amberSoft }
        : { accentColor: palette.indigoDark, softColor: palette.indigoSoft });

  return (
    <View
      accessible
      accessibilityLabel={`${alarm.shiftName}, ${new Date(alarm.alarmAt).toLocaleString("ko-KR")}, ${formatAlarmCountdown(alarm.alarmAt, now)}${
        hasDateOverride ? ", 이날만 설정" : ""
      }`}
      style={styles.alarmRow}
    >
      <View
        style={[
          styles.alarmShiftIcon,
          { backgroundColor: appearance.softColor },
        ]}
      >
        {exceptionAppearance ? (
          <AppIcon
            accessible={false}
            color={exceptionAppearance.accentColor}
            name={exceptionAppearance.iconName}
            size={19}
          />
        ) : alarmShift || substituteAlarm ? (
          <AnimatedShiftIcon
            animated={false}
            color={appearance.accentColor}
            kind={
              alarmShift
                ? getShiftIconKind(alarmShift.id, alarmShift.isOff)
                : "substitute"
            }
            size={19}
          />
        ) : (
          <AppIcon
            accessible={false}
            color={appearance.accentColor}
            name="alarm-outline"
            size={19}
          />
        )}
      </View>
      <View style={styles.flexCopy}>
        <AppText variant="label">
          {alarm.shiftName}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {new Date(alarm.alarmAt).toLocaleString("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </AppText>
        <AppText color={appearance.accentColor} variant="caption">
          {formatAlarmCountdown(alarm.alarmAt, now)}
          {hasDateOverride ? " · 이날만 설정" : ""}
        </AppText>
      </View>
    </View>
  );
}

function AlarmHistoryRow({
  event,
  separated,
}: {
  event: AlarmPyoAlarmHistoryEvent;
  separated: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const warning = ALARM_HISTORY_WARNING_TYPES.has(event.type);
  const color = warning ? palette.danger : palette.mintDark;
  return (
    <View style={[styles.historyRow, separated && styles.rowDivider]}>
      <View
        style={[
          styles.historyIcon,
          { backgroundColor: warning ? palette.dangerSoft : palette.mintSoft },
        ]}
      >
        <AppIcon
          accessible={false}
          color={color}
          name={alarmHistoryIcon(event.type)}
          size={18}
        />
      </View>
      <View style={styles.flexCopy}>
        <View style={styles.historyTitleRow}>
          <AppText color={color} variant="label">
            {alarmHistoryLabel(event)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {formatAlarmHistoryTime(event.occurredAt)}
          </AppText>
        </View>
        <AppText tone="secondary" variant="caption">
          {alarmHistoryDetail(event)}
        </AppText>
      </View>
    </View>
  );
}

function DisclosureIcon({ open }: { open: boolean }) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={open ? styles.disclosureIconOpen : undefined}>
      <AppIcon
        accessible={false}
        color={palette.inkSoft}
        name="chevron-forward"
        size={18}
      />
    </View>
  );
}

function createStyles(palette: AppPalette, _isDark: boolean) {
  return StyleSheet.create({
    screenContent: {
      gap: spacing.large,
      paddingTop: spacing.small,
      paddingBottom: spacing.xxlarge,
    },
    statusCard: { gap: spacing.medium },
    alarmToggle: {
      minHeight: 60,
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: palette.transparent,
    },
    fullWidthButton: { width: "100%" },
    testCard: { gap: spacing.medium },
    testHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.medium,
    },
    testIcon: {
      width: 44,
      height: 44,
      flexShrink: 0,
      borderRadius: radii.medium,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.indigoSoft,
    },
    detailsSection: { gap: spacing.small },
    detailsDisclosure: {
      borderWidth: 1,
      borderColor: palette.line,
    },
    managementBody: { gap: spacing.medium },
    detailsCard: { gap: spacing.large },
    detailBlock: { gap: spacing.medium },
    detailEmptyCopy: { paddingVertical: spacing.medium },
    flexCopy: { minWidth: 0, flex: 1, gap: 3 },
    alarmRow: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.medium,
      paddingVertical: spacing.medium,
    },
    alarmShiftIcon: {
      width: 44,
      height: 44,
      borderRadius: radii.medium,
      alignItems: "center",
      justifyContent: "center",
    },
    disclosureBody: {
      gap: 0,
      paddingBottom: spacing.small,
    },
    disclosureEmptyCopy: {
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.medium,
    },
    disclosureIconOpen: { transform: [{ rotate: "90deg" }] },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    historyRow: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.medium,
      paddingVertical: spacing.medium,
    },
    historyIcon: {
      width: 38,
      height: 38,
      borderRadius: radii.small,
      alignItems: "center",
      justifyContent: "center",
    },
    historyTitleRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.small,
    },
  });
}
