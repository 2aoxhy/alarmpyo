import { router } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Platform,
  Pressable,
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
import { QuickTimerDurationStepper } from '@/features/timer/quick-timer-duration-stepper';
import { QuickTimerPresets } from '@/features/timer/quick-timer-presets';
import {
  createQuickTimerObservationSession,
  type TimerObservationRevision,
} from '@/features/timer/quick-timer-observation';
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
  const [customDurationOpen, setCustomDurationOpen] = useState(false);
  const [customDurationInitialMinutes, setCustomDurationInitialMinutes] =
    useState<QuickTimerDuration>(15);
  const [loadError, setLoadError] = useState(false);
  const directInputButtonRef = useRef<ElementRef<typeof Pressable>>(null);
  const shouldRestoreDirectInputFocusRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const [observationSession] = useState(createQuickTimerObservationSession);
  const readWallClock = useCallback(() => Date.now(), []);
  const restoreDirectInputFocus = useCallback(() => {
    if (Platform.OS === 'web') {
      (
        directInputButtonRef.current as
          | (ElementRef<typeof Pressable> & { focus?: () => void })
          | null
      )?.focus?.();
      return;
    }
    const node = findNodeHandle(directInputButtonRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  const observeStatus = useCallback((
    nextStatus: QuickTimerStatus,
    observationRevision: TimerObservationRevision,
  ) => {
    if (!observationSession.isCurrent(observationRevision)) return null;
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
  }, [observationSession]);

  const claimTimerAction = useCallback((
    action: 'schedule' | 'pause' | 'resume' | 'reset' | 'refresh',
  ) => {
    const revision = observationSession.claimAction();
    if (revision === null) return null;
    setBusyAction(action);
    return revision;
  }, [observationSession]);

  const releaseTimerAction = useCallback((revision: TimerObservationRevision) => {
    if (!observationSession.releaseAction(revision)) return false;
    setBusyAction(null);
    return true;
  }, [observationSession]);

  useEffect(() => {
    if (!screenActive) {
      observationSession.deactivate();
      shouldRestoreDirectInputFocusRef.current = false;
      const hideInput = setTimeout(() => setCustomDurationOpen(false), 0);
      return () => clearTimeout(hideInput);
    }
    observationSession.activate();
    // Commands accepted on an earlier visit still finish in the native queue;
    // the returning screen gets their final state through a fresh observation.
    const resetInactiveAction = setTimeout(() => {
      if (observationSession.hasPendingAction()) return;
      setBusyAction(null);
      setSchedulingDuration(null);
    }, 0);
    return () => {
      clearTimeout(resetInactiveAction);
      observationSession.deactivate();
    };
  }, [observationSession, screenActive]);

  useEffect(() => {
    if (!screenActive || customDurationOpen || !shouldRestoreDirectInputFocusRef.current) {
      return;
    }
    shouldRestoreDirectInputFocusRef.current = false;
    const timeout = setTimeout(
      restoreDirectInputFocus,
      Platform.OS === 'web' ? 0 : 180,
    );
    return () => clearTimeout(timeout);
  }, [customDurationOpen, restoreDirectInputFocus, screenActive]);

  const refreshStatus = useCallback(async (
    showLoading = false,
    announceFailure = false,
    claimedRevision?: TimerObservationRevision,
  ) => {
    const observationRevision = observationSession.beginObservation(claimedRevision);
    if (observationRevision === null) return null;
    if (showLoading) setLoading(true);
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.getStatus();
      if (!observationSession.isCurrent(observationRevision)) {
        return null;
      }
      observeStatus(nextStatus, observationRevision);
      return nextStatus;
    } catch {
      if (observationSession.isCurrent(observationRevision)) {
        setLoadError(true);
        if (announceFailure) {
          void AccessibilityInfo.announceForAccessibility(
            '타이머 상태를 확인하지 못했습니다.',
          );
        }
      }
      return null;
    } finally {
      if (observationSession.isCurrent(observationRevision)) {
        hasLoadedRef.current = true;
        setLoading(false);
        if (claimedRevision !== undefined) {
          releaseTimerAction(claimedRevision);
        } else {
          setBusyAction((current) => (current === 'refresh' ? null : current));
        }
      }
    }
  }, [observationSession, observeStatus, releaseTimerAction]);

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
    const observationRevision = claimTimerAction('schedule');
    if (observationRevision === null) return;
    setSchedulingDuration(durationMinutes);
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.schedule(durationMinutes);
      if (!observationSession.isCurrent(observationRevision)) {
        return;
      }
      const observedClock = observeStatus(nextStatus, observationRevision);
      if (!observedClock) return;
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
      if (observationSession.isCurrent(observationRevision)) {
        setLoadError(true);
        announce('타이머를 준비하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      if (releaseTimerAction(observationRevision)) {
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
      `${durationMinutes}분으로 변경`,
      `현재 타이머 취소 · ${target} 울림`,
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

  const openCustomDuration = () => {
    if (busyAction !== null || observationSession.hasPendingAction()) return;
    setCustomDurationInitialMinutes(status?.durationMinutes ?? 15);
    setCustomDurationOpen(true);
  };

  const closeCustomDuration = (restoreFocus = true) => {
    shouldRestoreDirectInputFocusRef.current = restoreFocus && screenActive;
    setCustomDurationOpen(false);
  };

  const submitCustomDuration = (durationMinutes: QuickTimerDuration) => {
    if (busyAction !== null || observationSession.hasPendingAction()) return;
    closeCustomDuration(false);
    selectDuration(durationMinutes, readWallClock());
  };

  const pause = async () => {
    const observationRevision = claimTimerAction('pause');
    if (observationRevision === null) return;
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.pause();
      if (!observationSession.isCurrent(observationRevision)) {
        return;
      }
      observeStatus(nextStatus, observationRevision);
      if (nextStatus.state !== 'paused') {
        setLoadError(true);
        announce('타이머를 일시정지하지 못했습니다. 다시 확인해야 합니다.');
      } else {
        announce('타이머를 일시정지했습니다.');
      }
    } catch {
      if (observationSession.isCurrent(observationRevision)) {
        setLoadError(true);
        announce('타이머를 일시정지하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      releaseTimerAction(observationRevision);
    }
  };

  const resume = async () => {
    const observationRevision = claimTimerAction('resume');
    if (observationRevision === null) return;
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.resume();
      if (!observationSession.isCurrent(observationRevision)) {
        return;
      }
      observeStatus(nextStatus, observationRevision);
      if (!nextStatus.active || nextStatus.state !== 'scheduled') {
        setLoadError(true);
        announce('타이머를 재개하지 못했습니다. 다시 확인해야 합니다.');
      } else {
        announce('타이머를 재개했습니다.');
      }
    } catch {
      if (observationSession.isCurrent(observationRevision)) {
        setLoadError(true);
        announce('타이머를 재개하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      releaseTimerAction(observationRevision);
    }
  };

  const reset = async () => {
    const observationRevision = claimTimerAction('reset');
    if (observationRevision === null) return;
    setLoadError(false);
    try {
      const nextStatus = await quickTimerController.reset();
      if (!observationSession.isCurrent(observationRevision)) {
        return;
      }
      observeStatus(nextStatus, observationRevision);
      if (nextStatus.state === 'error' || nextStatus.storageHealth === 'corrupt') {
        setLoadError(true);
        announce('타이머를 초기화하지 못했습니다. 다시 확인해야 합니다.');
      } else {
        announce('타이머를 초기화했습니다.');
      }
    } catch {
      if (observationSession.isCurrent(observationRevision)) {
        setLoadError(true);
        announce('타이머를 초기화하지 못했습니다. 다시 확인해야 합니다.');
      }
    } finally {
      releaseTimerAction(observationRevision);
    }
  };

  const retry = () => {
    const observationRevision = claimTimerAction('refresh');
    if (observationRevision === null) return;
    void refreshStatus(false, true, observationRevision);
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
    <>
    <Screen contentStyle={styles.screenContent} removeClippedSubviews={false}>
      <PageHeader
        align="center"
        subtitle="15·30·45분 · 직접 입력"
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
          message="Android 설치본에서만 사용할 수 있습니다."
          tone="neutral"
        />
      ) : null}

      {loadError || status?.state === 'error' || status?.storageHealth === 'corrupt' ? (
        <StatusBanner
          actionLabel="다시 확인"
          icon="alert-circle-outline"
          message="근무 알람은 유지됩니다."
          onAction={retry}
          title="타이머 확인 실패"
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
              <QuickTimerPresets
                columns={presetColumns}
                disabled={busyAction !== null}
                directInputButtonRef={directInputButtonRef}
                onDirectInput={openCustomDuration}
                onSelectDuration={(durationMinutes) => selectDuration(durationMinutes, Date.now())}
                replacingTimer
                schedulingDuration={schedulingDuration}
              />
            </View>
          ) : null}
        </Surface>
      ) : canShowIdleControls ? (
        <Surface style={styles.timerSurface}>
          <View style={styles.idleCopy}>
            <AppText accessibilityRole="header" aria-level={2} style={styles.centerText} variant="heading">
              시간 선택
            </AppText>
            <AppText tone="secondary" style={styles.centerText} variant="body">
              한 번에 1개만 실행
            </AppText>
          </View>
          <QuickTimerPresets
            columns={presetColumns}
            disabled={busyAction !== null || status.state === 'action-required'}
            directInputButtonRef={directInputButtonRef}
            onDirectInput={openCustomDuration}
            onSelectDuration={(durationMinutes) => selectDuration(durationMinutes, Date.now())}
            replacingTimer={false}
            schedulingDuration={schedulingDuration}
          />
        </Surface>
      ) : null}

      {supported ? (
        <View style={styles.infoRow}>
          <AppIcon accessible={false} color={palette.inkMuted} name="alarm-outline" size={18} />
          <AppText tone="secondary" style={styles.infoCopy} variant="caption">
            화면이 꺼져도 알람음·진동 사용
          </AppText>
        </View>
      ) : null}
    </Screen>
    <QuickTimerDurationStepper
      busy={busyAction === 'schedule'}
      initialDurationMinutes={customDurationInitialMinutes}
      onCancel={() => closeCustomDuration()}
      onSubmit={submitCustomDuration}
      replacingTimer={hasTimer}
      visible={customDurationOpen && screenActive}
    />
    </>
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
    infoRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
    },
    infoCopy: { flexShrink: 1 },
  });
}
