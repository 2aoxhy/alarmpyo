import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText } from '@/components/ui-kit';
import { type AppPalette } from '@/constants/app-theme';
import { radius, size, space } from '@/design-system/tokens';
import { useAppLifecycle } from '@/hooks/use-app-active';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { openGooglePlayListing } from '@/services/app-distribution';
import {
  completeFlexiblePlayUpdate,
  getPlayUpdateProgress,
  getPlayUpdateStatusForTransition,
  shouldPollPlayUpdate,
  startFlexiblePlayUpdate,
  type PlayUpdateStatus,
} from '@/services/play-app-update-service';
import { useAppRuntimeController } from '@/store/app-store';

import {
  getPlayUpdateStatusBadge,
  getPlayUpdateModalPresentation,
  getPlayUpdateTransitionAnnouncement,
  mergePlayUpdateStatus,
  resolvePlayUpdateNoticeKind,
  shouldPresentPlayUpdateModal,
  type PlayUpdateNoticeKind,
  type PlayUpdateStatusBadge,
} from './play-update-notice-policy';
import {
  createPlayUpdatePromptSnooze,
  readPlayUpdatePromptSnooze,
  writePlayUpdatePromptSnooze,
  type PlayUpdatePromptSnooze,
} from './play-update-snooze-repository';

const PLAY_UPDATE_POLL_INTERVAL_MS = 1_500;

export type GlobalPlayUpdateContextValue = {
  badge: PlayUpdateStatusBadge | null;
  busy: boolean;
  kind: PlayUpdateNoticeKind | null;
  performPrimaryAction: () => Promise<void>;
  refresh: () => Promise<void>;
  snoozeFor24Hours: () => Promise<void>;
  status: PlayUpdateStatus | null;
};

const GlobalPlayUpdateContext =
  createContext<GlobalPlayUpdateContextValue | null>(null);

export function GlobalPlayUpdateProvider({
  children,
  enabled,
}: PropsWithChildren<{ enabled: boolean }>) {
  const appLifecycle = useAppLifecycle();
  const runtime = useAppRuntimeController();
  const [status, setStatus] = useState<PlayUpdateStatus | null>(null);
  const [snooze, setSnooze] = useState<PlayUpdatePromptSnooze | null>(null);
  const [snoozeLoaded, setSnoozeLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failedRetryAction, setFailedRetryAction] = useState<
    'start' | 'install'
  >('start');
  const [now, setNow] = useState(Date.now);
  const previousNoticeKindRef = useRef<PlayUpdateNoticeKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readPlayUpdatePromptSnooze(runtime.dataRepository).then((saved) => {
      if (cancelled) return;
      setSnooze(saved);
      setSnoozeLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [runtime.dataRepository]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const nextStatus = await getPlayUpdateStatusForTransition(
      appLifecycle.transitionId,
      true,
    );
    setStatus((current) => mergePlayUpdateStatus(current, nextStatus));
    setNow(Date.now());
  }, [appLifecycle.transitionId, enabled]);

  useEffect(() => {
    if (!enabled || !snoozeLoaded || !appLifecycle.active) return;
    let cancelled = false;
    void getPlayUpdateStatusForTransition(appLifecycle.transitionId).then(
      (nextStatus) => {
        if (cancelled) return;
        setStatus((current) => mergePlayUpdateStatus(current, nextStatus));
        setNow(Date.now());
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    appLifecycle.active,
    appLifecycle.transitionId,
    enabled,
    snoozeLoaded,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      !appLifecycle.active ||
      busy ||
      !status ||
      !shouldPollPlayUpdate(status)
    ) {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void getPlayUpdateStatusForTransition(
        appLifecycle.transitionId,
        true,
      ).then((nextStatus) => {
        if (!cancelled) {
          setStatus((current) => mergePlayUpdateStatus(current, nextStatus));
          setNow(Date.now());
        }
      });
    }, PLAY_UPDATE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    appLifecycle.active,
    appLifecycle.transitionId,
    busy,
    enabled,
    status,
  ]);

  useEffect(() => {
    if (!snooze) return;
    const remaining = snooze.snoozedUntil - Date.now();
    if (remaining <= 0) return;
    const timeout = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timeout);
  }, [snooze]);

  const snoozeFor24Hours = useCallback(async () => {
    const versionCode = status?.availableVersionCode ?? 0;
    const nextSnooze = createPlayUpdatePromptSnooze(versionCode);
    if (!nextSnooze) return;
    // 저장 공간 오류가 있더라도 현재 세션에서는 사용자의 닫기 동작을 존중해요.
    setSnooze(nextSnooze);
    setNow(Date.now());
    await writePlayUpdatePromptSnooze(nextSnooze, runtime.dataRepository);
  }, [runtime.dataRepository, status?.availableVersionCode]);

  const performPrimaryAction = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const kind = resolvePlayUpdateNoticeKind(status);
    const action =
      kind === 'downloaded' ||
      (kind === 'failed' && failedRetryAction === 'install')
        ? 'install'
        : 'start';
    try {
      let nextStatus: PlayUpdateStatus | null = null;
      if (action === 'install') {
        nextStatus = await completeFlexiblePlayUpdate();
      } else if (status?.flexibleAllowed) {
        nextStatus = await startFlexiblePlayUpdate();
      } else {
        await openGooglePlayListing();
      }
      if (nextStatus) {
        const mergedStatus = mergePlayUpdateStatus(status, nextStatus);
        setStatus(mergedStatus);
        if (resolvePlayUpdateNoticeKind(mergedStatus) === 'failed') {
          setFailedRetryAction(action);
        }
      }
      setNow(Date.now());
    } catch {
      setFailedRetryAction(action);
      setStatus((current) =>
        current
          ? { ...current, installStatus: 'failed', state: 'failed' }
          : current,
      );
    } finally {
      setBusy(false);
    }
  }, [busy, failedRetryAction, status]);

  const kind = resolvePlayUpdateNoticeKind(status);
  const badge = getPlayUpdateStatusBadge(status);

  useEffect(() => {
    const previousKind = previousNoticeKindRef.current;
    previousNoticeKindRef.current = kind;
    if (kind !== 'downloading' && kind !== 'installed') return;
    const announcement = getPlayUpdateTransitionAnnouncement(previousKind, kind);
    if (announcement) {
      void AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [kind]);

  const modalVisible =
    enabled &&
    snoozeLoaded &&
    shouldPresentPlayUpdateModal(status, snooze, now);
  const value = useMemo<GlobalPlayUpdateContextValue>(
    () => ({
      badge,
      busy,
      kind,
      performPrimaryAction,
      refresh,
      snoozeFor24Hours,
      status,
    }),
    [
      badge,
      busy,
      kind,
      performPrimaryAction,
      refresh,
      snoozeFor24Hours,
      status,
    ],
  );

  return (
    <GlobalPlayUpdateContext.Provider value={value}>
      {children}
      <PlayUpdateDownloadProgress kind={kind} status={status} />
      <PlayUpdateModal
        busy={busy}
        kind={kind}
        onPrimaryAction={() => void performPrimaryAction()}
        onSnooze={() => void snoozeFor24Hours()}
        status={status}
        visible={modalVisible}
      />
    </GlobalPlayUpdateContext.Provider>
  );
}

export function useGlobalPlayUpdate(): GlobalPlayUpdateContextValue {
  const value = useContext(GlobalPlayUpdateContext);
  if (!value) {
    throw new Error('전역 앱 업데이트 상태가 준비되지 않았습니다.');
  }
  return value;
}

function PlayUpdateModal({
  busy,
  kind,
  onPrimaryAction,
  onSnooze,
  status,
  visible,
}: {
  busy: boolean;
  kind: PlayUpdateNoticeKind | null;
  onPrimaryAction: () => void;
  onSnooze: () => void;
  status: PlayUpdateStatus | null;
  visible: boolean;
}) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const titleRef = useRef<React.ElementRef<typeof AppText>>(null);
  const horizontalGuard = Math.max(insets.left, insets.right, space.lg);
  const verticalGuard = Math.max(insets.top, insets.bottom, space.lg);
  const presentation = getPlayUpdateModalPresentation(
    kind,
    status?.availableVersionCode ?? 0,
  );

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    const timeout = setTimeout(() => {
      const node = findNodeHandle(titleRef.current);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    }, 120);
    return () => clearTimeout(timeout);
  }, [visible, presentation.title]);

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={() => {
        if (presentation.snoozable && !busy) onSnooze();
      }}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}>
      <View
        accessibilityViewIsModal
        importantForAccessibility="yes"
        style={[
          styles.modalOverlay,
          {
            paddingBottom: verticalGuard,
            paddingHorizontal: horizontalGuard,
            paddingTop: verticalGuard,
          },
        ]}>
        <View
          style={[
            styles.modalCard,
            {
              maxHeight: Math.max(160, height - verticalGuard * 2),
              width: Math.min(480, Math.max(0, width - horizontalGuard * 2)),
            },
          ]}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={height < 520}>
            <View style={styles.modalIcon}>
              {kind === 'installing' || busy ? (
                <ActivityIndicator color={palette.blue} size="small" />
              ) : (
                <AppIcon
                  accessible={false}
                  color={kind === 'failed' ? palette.danger : palette.blue}
                  name={
                    kind === 'downloaded'
                      ? 'checkmark-circle'
                      : kind === 'failed'
                        ? 'alert-circle-outline'
                        : 'download-outline'
                  }
                  size={28}
                />
              )}
            </View>
            <View style={styles.modalCopy}>
              <AppText
                ref={titleRef}
                accessibilityRole="header"
                style={styles.modalTitle}
                variant="title">
                {presentation.title}
              </AppText>
              <AppText style={styles.modalMessage} tone="secondary">
                {presentation.message}
              </AppText>
            </View>
            {presentation.primaryLabel ? (
              <View style={styles.modalActions}>
                <AppButton
                  accessibilityHint={presentation.primaryHint}
                  icon={
                    kind === 'downloaded'
                      ? 'checkmark'
                      : kind === 'failed'
                        ? 'refresh-outline'
                        : 'download-outline'
                  }
                  label={presentation.primaryLabel}
                  loading={busy}
                  onPress={onPrimaryAction}
                  style={styles.modalAction}
                />
                {presentation.snoozable ? (
                  <AppButton
                    disabled={busy}
                    label="24시간 후 다시 알림"
                    onPress={onSnooze}
                    style={styles.modalAction}
                    variant="secondary"
                  />
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlayUpdateDownloadProgress({
  kind,
  status,
}: {
  kind: PlayUpdateNoticeKind | null;
  status: PlayUpdateStatus | null;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const progress = status ? getPlayUpdateProgress(status) : null;
  const sideGuard = Math.max(insets.left, insets.right, space.lg);
  if (kind !== 'downloading') return null;

  return (
    <View
      accessibilityLabel="업데이트 다운로드 중"
      accessibilityLiveRegion="none"
      accessibilityRole="progressbar"
      accessibilityValue={progress === null ? undefined : { min: 0, max: 100, now: progress }}
      pointerEvents="none"
      style={[
        styles.progressPositioner,
        {
          left: sideGuard,
          right: sideGuard,
          top: Math.max(insets.top, space.sm) + space.sm,
        },
      ]}>
      <View style={styles.progressBanner}>
        <ActivityIndicator color={palette.blue} size="small" />
        <View style={styles.progressCopy}>
          <AppText variant="label">업데이트 다운로드 중</AppText>
          <AppText tone="secondary" variant="caption">
            {progress === null ? 'Google Play에서 준비하고 있습니다.' : `${progress}% 완료`}
          </AppText>
          {progress === null ? null : (
            <View accessibilityElementsHidden style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.74)',
    },
    modalCard: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.controlLine,
      borderRadius: radius.xl,
      backgroundColor: palette.surface,
      shadowColor: palette.shadowColor,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.42,
      shadowRadius: 34,
      elevation: 28,
    },
    modalContent: {
      alignItems: 'stretch',
      gap: space.lg,
      padding: space.xl,
    },
    modalIcon: {
      width: size.largeControl,
      height: size.largeControl,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.lg,
      backgroundColor: palette.blueSoft,
    },
    modalCopy: { gap: space.sm },
    modalTitle: { textAlign: 'center' },
    modalMessage: { textAlign: 'center' },
    modalActions: { gap: space.sm },
    modalAction: { width: '100%' },
    progressPositioner: {
      position: 'absolute',
      zIndex: 1_200,
      elevation: 24,
      alignItems: 'center',
    },
    progressBanner: {
      width: '100%',
      maxWidth: 480,
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderWidth: 1,
      borderColor: palette.blue,
      borderRadius: radius.lg,
      backgroundColor: palette.surface,
      shadowColor: palette.shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 16,
    },
    progressCopy: { minWidth: 0, flex: 1, gap: space.xs },
    progressTrack: {
      height: 4,
      overflow: 'hidden',
      borderRadius: radius.full,
      backgroundColor: palette.surfaceSoft,
    },
    progressFill: {
      height: '100%',
      borderRadius: radius.full,
      backgroundColor: palette.blue,
    },
  });
}
