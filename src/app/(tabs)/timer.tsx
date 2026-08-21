import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { AppText, Screen } from '@/components/ui-kit';
import type { AppPalette } from '@/constants/app-theme';
import { alarmCopy } from '@/content/alarm-copy';
import {
  Button,
  PageHeader,
  StatusBanner,
  Surface,
  radius,
  space,
} from '@/design-system';
import {
  quickTimerController,
  type QuickTimerDuration,
  type QuickTimerStatus,
} from '@/features/timer/quick-timer-controller';
import {
  createQuickTimerCountdownAnchor,
  formatQuickTimerTarget,
  getQuickTimerActionPresentation,
  getQuickTimerDisplayLabel,
  getQuickTimerTargetAt,
  isQuickTimerScheduleConfirmed,
  resolveQuickTimerCountdownSize,
  resolveQuickTimerPresetColumns,
  shouldStackQuickTimerActions,
  type QuickTimerCountdownAnchor,
} from '@/features/timer/quick-timer-model';
import { QuickTimerCountdown } from '@/features/timer/quick-timer-countdown';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useScreenActive } from '@/hooks/use-screen-active';
import { useThemedStyles } from '@/hooks/use-themed-styles';

const FIRE_SETTLE_POLL_INTERVAL_MS = 750;
const FIRE_SETTLE_MAX_ATTEMPTS = 8;

function getQuickTimerObservationKey(status: QuickTimerStatus): string {
  return [status.startedAt, status.fireAt, status.isRepeat, status.state].join(':');
}

export default function TimerScreen() {
  const { showDialog } = useAppDialog();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const screenActive = useScreenActive();
  const stackActions = shouldStackQuickTimerActions(width, fontScale);
  const presetColumns = resolveQuickTimerPresetColumns(width, fontScale);
  const presetButtonStyle =
    presetColumns === 1
      ? styles.presetButtonFull
      : presetColumns === 2
        ? styles.presetButtonHalf
        : styles.presetButtonQuarter;
  const countdownFontSize = resolveQuickTimerCountdownSize(width, fontScale);
  const [status, setStatus] = useState<QuickTimerStatus | null>(null);
  const [countdownAnchor, setCountdownAnchor] =
    useState<QuickTimerCountdownAnchor | null>(null);
  const [expiredObservationKey, setExpiredObservationKey] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<
    'schedule' | 'pause' | 'resume' | 'reset' | 'refresh' | null
  >(null);
  const [schedulingDuration, setSchedulingDuration] =
    useState<QuickTimerDuration | null>(null);
  const [loadError, setLoadError] = useState(false);
  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);

  const observeStatus = useCallback((nextStatus: QuickTimerStatus) => {
    const nextClock = {
      monotonic: performance.now(),
      wall: Date.now(),
    };
    setCountdownAnchor(
      createQuickTimerCountdownAnchor(nextStatus, nextClock.monotonic),
    );
    setStatus(nextStatus);
    const nextObservationKey = getQuickTimerObservationKey(nextStatus);
    setExpiredObservationKey((current) =>
      current === null || current === nextObservationKey ? current : null,
    );
    return nextClock;
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const refreshStatus = useCallback(async (
    showLoading = false,
    announceFailure = false,
  ) => {
    if (showLoading) setLoading(true);
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.getStatus();
      if (!mountedRef.current) return;
      observeStatus(nextStatus);
      return nextStatus;
    } catch {
      if (mountedRef.current) {
        setLoadError(true);
        if (announceFailure) {
          void AccessibilityInfo.announceForAccessibility(
            '타이머 상태를 확인하지 못했습니다.',
          );
        }
      }
      return null;
    } finally {
      if (mountedRef.current) {
        hasLoadedRef.current = true;
        setLoading(false);
        setBusyAction((current) => (current === 'refresh' ? null : current));
      }
    }
  }, [observeStatus]);

  useEffect(() => {
    if (!screenActive) return;
    void refreshStatus(!hasLoadedRef.current);
  }, [refreshStatus, screenActive]);

  const statusObservationKey = status
    ? getQuickTimerObservationKey(status)
    : null;
  const statusActive = status?.active === true;
  const statusFireAt = status?.fireAt ?? 0;

  useEffect(() => {
    if (
      !screenActive ||
      !statusActive ||
      statusFireAt <= 0 ||
      expiredObservationKey === null ||
      statusObservationKey !== expiredObservationKey
    ) {
      return;
    }
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const pollSettledStatus = async () => {
      if (cancelled) return;
      attempts += 1;
      const nextStatus = await refreshStatus();
      const stillWaiting =
        nextStatus?.active === true &&
        getQuickTimerObservationKey(nextStatus) === expiredObservationKey;
      if (!cancelled && stillWaiting && attempts < FIRE_SETTLE_MAX_ATTEMPTS) {
        timeout = setTimeout(
          () => void pollSettledStatus(),
          FIRE_SETTLE_POLL_INTERVAL_MS,
        );
      }
    };
    void pollSettledStatus();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [
    expiredObservationKey,
    refreshStatus,
    screenActive,
    statusActive,
    statusFireAt,
    statusObservationKey,
  ]);

  const handleCountdownExpired = useCallback((observationKey: string) => {
    setExpiredObservationKey(observationKey);
  }, []);

  const actionPresentation = useMemo(
    () => getQuickTimerActionPresentation(status?.requiredAction ?? 'none'),
    [status?.requiredAction],
  );

  const announce = (message: string) => {
    void AccessibilityInfo.announceForAccessibility(message);
  };

  const startTimer = async (durationMinutes: QuickTimerDuration) => {
    if (busyAction !== null) return;
    setBusyAction('schedule');
    setSchedulingDuration(durationMinutes);
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.schedule(durationMinutes);
      if (!mountedRef.current) return;
      const observedClock = observeStatus(nextStatus);
      if (nextStatus.state === 'action-required') {
        announce('타이머를 시작하려면 알람 설정을 확인해야 합니다.');
      } else if (nextStatus.state === 'error') {
        setLoadError(true);
        announce('타이머를 준비하지 못했습니다. 다시 확인해야 합니다.');
      } else if (isQuickTimerScheduleConfirmed(nextStatus, durationMinutes)) {
        const target = formatQuickTimerTarget(
          getQuickTimerTargetAt(nextStatus.remainingMillis, observedClock.wall),
          observedClock.wall,
        );
        announce(`${durationMinutes}분 타이머를 시작했습니다. ${target}에 울립니다.`);
      } else {
        setLoadError(true);
        announce('타이머 설정 결과를 확인하지 못했습니다. 다시 시도해야 합니다.');
      }
    } catch {
      if (mountedRef.current) {
        setLoadError(true);
        announce('타이머를 준비하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      if (mountedRef.current) {
        setBusyAction(null);
        setSchedulingDuration(null);
      }
    }
  };

  const selectDuration = (
    durationMinutes: QuickTimerDuration,
    currentWallClock: number,
  ) => {
    if (!status?.active && status?.state !== 'paused') {
      void startTimer(durationMinutes);
      return;
    }
    const target = formatQuickTimerTarget(
      currentWallClock + durationMinutes * 60_000,
      currentWallClock,
    );
    showDialog(
      '실행 중인 타이머를 변경하시겠습니까?',
      `현재 타이머를 취소하고 ${durationMinutes}분 타이머를 시작합니다. ${target}에 울릴 예정입니다.`,
      [
        { text: '유지', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: `${durationMinutes}분으로 변경`,
          actionId: 'confirm',
          icon: 'checkmark',
          onPress: () => void startTimer(durationMinutes),
        },
      ],
      { tone: 'warning' },
    );
  };

  const pause = async () => {
    if (busyAction !== null) return;
    setBusyAction('pause');
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.pause();
      if (!mountedRef.current) return;
      observeStatus(nextStatus);
      if (nextStatus.state !== 'paused') {
        setLoadError(true);
        announce('타이머를 일시정지하지 못했습니다. 다시 확인해야 합니다.');
      } else {
        announce('타이머를 일시정지했습니다.');
      }
    } catch {
      if (mountedRef.current) {
        setLoadError(true);
        announce('타이머를 일시정지하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  };

  const resume = async () => {
    if (busyAction !== null) return;
    setBusyAction('resume');
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.resume();
      if (!mountedRef.current) return;
      observeStatus(nextStatus);
      if (!nextStatus.active || nextStatus.state !== 'scheduled') {
        setLoadError(true);
        announce('타이머를 재개하지 못했습니다. 다시 확인해야 합니다.');
      } else {
        announce('타이머를 재개했습니다.');
      }
    } catch {
      if (mountedRef.current) {
        setLoadError(true);
        announce('타이머를 재개하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  };

  const reset = async () => {
    if (busyAction !== null) return;
    setBusyAction('reset');
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.reset();
      if (!mountedRef.current) return;
      observeStatus(nextStatus);
      if (nextStatus.state === 'error' || nextStatus.storageHealth === 'corrupt') {
        setLoadError(true);
        announce('타이머를 초기화하지 못했습니다. 다시 확인해야 합니다.');
      } else {
        announce('타이머를 초기화했습니다.');
      }
    } catch {
      if (mountedRef.current) {
        setLoadError(true);
        announce('타이머를 초기화하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  };

  const retry = () => {
    if (busyAction !== null) return;
    setBusyAction('refresh');
    void refreshStatus(false, true);
  };

  const supported = status?.supported === true;
  const active = supported && status.active;
  const paused = supported && status.state === 'paused';
  const hasTimer = active || paused;
  const ringing = active && status.state === 'ringing';
  const activeTimerLabel = hasTimer ? getQuickTimerDisplayLabel(status) : '';
  const canShowIdleControls =
    supported &&
    !hasTimer &&
    status.state !== 'error' &&
    status.storageHealth !== 'corrupt';

  return (
    <Screen contentStyle={styles.screenContent}>
      <PageHeader
        align="center"
        subtitle="15분·30분·45분·60분 뒤 알람음과 진동으로 알립니다."
        title="타이머"
      />

      {loading && status === null ? (
        <Surface style={styles.loadingSurface}>
          <ActivityIndicator color={palette.indigoDark} size="small" />
          <AppText tone="secondary">타이머 상태를 확인하고 있습니다.</AppText>
        </Surface>
      ) : null}

      {!loading && status && !status.supported ? (
        <StatusBanner
          announceChanges={false}
          icon="alert-circle-outline"
          message="타이머 알람은 지원되는 Android 설치본에서 사용할 수 있습니다."
          title="이 기기에서는 타이머를 사용할 수 없습니다"
          tone="neutral"
        />
      ) : null}

      {loadError || status?.state === 'error' || status?.storageHealth === 'corrupt' ? (
        <StatusBanner
          actionLabel="다시 확인"
          icon="alert-circle-outline"
          message="타이머 상태를 확인하지 못했습니다. 기존 근무 알람은 그대로 유지됩니다."
          onAction={retry}
          title="타이머를 준비하지 못했습니다"
          tone="danger"
        />
      ) : null}

      {supported && status.state === 'action-required' && actionPresentation ? (
        <StatusBanner
          actionLabel={alarmCopy.openSettings.text}
          icon="alert-circle-outline"
          message={actionPresentation.message}
          onAction={() => router.push('/alarm-settings')}
          title={actionPresentation.title}
          tone="warning"
        />
      ) : null}

      {hasTimer ? (
        <Surface tone="selected" style={styles.timerSurface}>
          <View style={styles.timerStatusRow}>
            <View style={[styles.statusDot, paused && styles.statusDotPaused]} />
            <AppText color={paused ? palette.amber : palette.mint} variant="label">
              {paused ? '일시정지' : ringing ? '울림 중' : '실행 중'}
            </AppText>
          </View>
          {countdownAnchor ? (
            <QuickTimerCountdown
              active={active}
              anchor={countdownAnchor}
              countdownFontSize={countdownFontSize}
              key={statusObservationKey ?? undefined}
              label={activeTimerLabel}
              observationKey={statusObservationKey ?? ''}
              onExpired={handleCountdownExpired}
              paused={paused}
              screenActive={screenActive}
            />
          ) : null}
          <View style={[styles.timerActions, stackActions && styles.timerActionsStacked]}>
            {!ringing ? (
              <Button
                accessibilityHint={
                  paused
                    ? '저장된 남은 시간부터 타이머를 다시 시작합니다.'
                    : '남은 시간을 저장하고 알람 예약을 잠시 멈춥니다.'
                }
                disabled={busyAction !== null}
                icon={paused ? 'play' : 'pause'}
                label={paused ? '타이머 재개' : '일시정지'}
                loading={busyAction === (paused ? 'resume' : 'pause')}
                onPress={() => void (paused ? resume() : pause())}
                style={stackActions ? styles.timerActionStacked : styles.timerAction}
              />
            ) : null}
            <Button
              accessibilityHint="남은 시간을 지우고 예약된 타이머 알람을 종료합니다."
              disabled={busyAction !== null}
              icon="refresh-outline"
              label={ringing ? '타이머 종료' : '초기화'}
              loading={busyAction === 'reset'}
              onPress={() => void reset()}
              style={stackActions ? styles.timerActionStacked : styles.timerAction}
              variant="secondary"
            />
          </View>
          {!ringing && status.state !== 'action-required' ? (
            <View style={styles.changeSection}>
              <AppText tone="secondary" variant="label">
                다른 시간으로 변경
              </AppText>
              <View style={styles.presetButtons}>
                {quickTimerController.durations.map((durationMinutes) => (
                  <Button
                    accessibilityHint={`현재 타이머를 취소하고 지금부터 ${durationMinutes}분 뒤 울리도록 변경합니다.`}
                    accessibilityLabel={`${durationMinutes}분 타이머로 변경`}
                    disabled={busyAction !== null}
                    icon="timer-outline"
                    key={durationMinutes}
                    label={`${durationMinutes}분`}
                    loading={schedulingDuration === durationMinutes}
                    onPress={() => selectDuration(durationMinutes, Date.now())}
                    style={[styles.presetButton, presetButtonStyle]}
                    variant="ghost"
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Surface>
      ) : canShowIdleControls ? (
        <Surface style={styles.timerSurface}>
          <View style={styles.idleCopy}>
            <View style={styles.idleIcon}>
              <AppIcon accessible={false} color={palette.indigoDark} name="timer" size={28} />
            </View>
            <AppText accessibilityRole="header" style={styles.centerText} variant="heading">
              시간을 선택하십시오
            </AppText>
            <AppText tone="secondary" style={styles.centerText} variant="body">
              한 번에 하나의 타이머만 실행할 수 있습니다.
            </AppText>
          </View>
          <View style={styles.presetButtons}>
            {quickTimerController.durations.map((durationMinutes) => (
              <Button
                accessibilityHint={`지금부터 ${durationMinutes}분 뒤 알람음과 진동이 울립니다.`}
                accessibilityLabel={`${durationMinutes}분 타이머 시작`}
                disabled={busyAction !== null || status.state === 'action-required'}
                icon="timer-outline"
                key={durationMinutes}
                label={`${durationMinutes}분`}
                loading={schedulingDuration === durationMinutes}
                onPress={() => selectDuration(durationMinutes, Date.now())}
                style={[styles.presetButton, presetButtonStyle]}
              />
            ))}
          </View>
        </Surface>
      ) : null}

      {supported ? (
        <Surface density="compact" tone="muted" style={styles.infoSurface}>
          <AppIcon accessible={false} color={palette.inkMuted} name="alarm-outline" size={22} />
          <View style={styles.infoCopy}>
            <AppText variant="label">알람음·진동</AppText>
            <AppText tone="secondary" variant="caption">
              화면이 꺼져 있어도 울리며, 휴대폰의 알람음과 진동을 사용합니다.
            </AppText>
          </View>
        </Surface>
      ) : null}
    </Screen>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screenContent: { gap: space.lg, paddingTop: space.sm },
    centerText: { textAlign: 'center' },
    loadingSurface: {
      minHeight: 120,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.md,
    },
    timerSurface: {
      minHeight: 286,
      justifyContent: 'center',
      gap: space.xl,
      paddingVertical: space.xl,
    },
    timerStatusRow: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
      backgroundColor: palette.mint,
    },
    statusDotPaused: { backgroundColor: palette.amber },
    timerActions: { flexDirection: 'row', gap: space.sm },
    timerActionsStacked: { flexDirection: 'column' },
    timerAction: { flex: 1 },
    timerActionStacked: { width: '100%' },
    changeSection: {
      gap: space.sm,
      paddingTop: space.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    idleCopy: { alignItems: 'center', gap: space.sm },
    idleIcon: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.lg,
      backgroundColor: palette.indigoSoft,
    },
    presetButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    presetButton: { minHeight: 64 },
    presetButtonFull: { width: '100%' },
    presetButtonHalf: { flexBasis: '48%', flexGrow: 1 },
    presetButtonQuarter: { minWidth: 0, flexBasis: 0, flexGrow: 1 },
    infoSurface: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      borderWidth: 0,
    },
    infoCopy: { minWidth: 0, flex: 1, gap: space.xs },
  });
}
