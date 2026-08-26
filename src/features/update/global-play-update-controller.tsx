import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSegments } from 'expo-router';
import {
  AccessibilityInfo,
  ActivityIndicator,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { useAppDialog } from '@/components/app-dialog';
import {
  GlobalBottomOverlayLayoutContext,
  resolveGlobalBottomOverlayBottom,
} from '@/components/global-bottom-overlay-layout';
import { AppButton, AppText } from '@/components/ui-kit';
import { type AppPalette } from '@/constants/app-theme';
import { ModalSurface } from '@/design-system';
import { radius, size, space } from '@/design-system/tokens';
import { useAppLifecycle } from '@/hooks/use-app-active';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';
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
  resolveFloatingTabBarGeometry,
  resolveFloatingTabBarLayout,
} from '@/utils/floating-tab-bar';

import {
  getPlayUpdateModalPresentation,
  getPlayUpdateStatusBadge,
  getPlayUpdateStatusBarPresentation,
  getPlayUpdateTransitionAnnouncement,
  mergePlayUpdateStatus,
  resolvePlayUpdateNoticeKind,
  shouldPresentPlayUpdateModal,
  shouldPresentPlayUpdateStatusBar,
  type PlayUpdateNoticeKind,
  type PlayUpdateStatusBadge,
} from './play-update-notice-policy';
import {
  createPlayUpdatePromptSnooze,
  readPlayUpdatePromptSnooze,
  writePlayUpdatePromptSnooze,
  type PlayUpdatePromptSnooze,
} from './play-update-snooze-repository';
import { createPlayUpdateActionGate } from './play-update-action-gate';

const PLAY_UPDATE_POLL_INTERVAL_MS = 1_500;
const PLAY_UPDATE_PRIORITY_MODAL_OWNER = 'play-update';

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
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { fontScale } = useWindowDimensions();
  const { setPriorityModalVisible } = useAppDialog();
  const runtime = useAppRuntimeController();
  const [status, setStatus] = useState<PlayUpdateStatus | null>(null);
  const [snooze, setSnooze] = useState<PlayUpdatePromptSnooze | null>(null);
  const [snoozeLoaded, setSnoozeLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failedRetryAction, setFailedRetryAction] = useState<
    'start' | 'install'
  >('start');
  const [now, setNow] = useState(Date.now);
  const [statusBarHeight, setStatusBarHeight] = useState(0);
  const [bottomControlInset, setBottomControlInset] = useState(0);
  const bottomControlInsetsRef = useRef(new Map<string, number>());
  const previousNoticeKindRef = useRef<PlayUpdateNoticeKind | null>(null);
  const actionGateRef = useRef(createPlayUpdateActionGate());

  const registerBottomControlInset = useCallback(
    (owner: string, inset: number) => {
      const safeInset = Number.isFinite(inset) ? Math.max(inset, 0) : 0;
      if (safeInset > 0) {
        bottomControlInsetsRef.current.set(owner, safeInset);
      } else {
        bottomControlInsetsRef.current.delete(owner);
      }
      const nextInset = Math.max(
        0,
        ...bottomControlInsetsRef.current.values(),
      );
      setBottomControlInset((current) =>
        current === nextInset ? current : nextInset,
      );
    },
    [],
  );

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
    // 저장소 쓰기가 실패해도 현재 세션의 처리 상태는 유지하고 Play 흐름을
    // 계속 엽니다. 같은 세션에서 모달이 다시 뜨는 것보다 업데이트 동작을
    // 막지 않는 편이 안전하며, 다음 앱 실행에서는 다시 안내할 수 있습니다.
    await writePlayUpdatePromptSnooze(
      nextSnooze,
      runtime.dataRepository,
    ).catch(() => undefined);
  }, [runtime.dataRepository, status?.availableVersionCode]);

  const performPrimaryAction = useCallback(async () => {
    if (!enabled) return;
    const actionGate = actionGateRef.current;
    const revision = actionGate.claim();
    if (revision === null) return;
    setBusy(true);
    const kind = resolvePlayUpdateNoticeKind(status);
    const action =
      kind === 'downloaded' ||
      (kind === 'failed' && failedRetryAction === 'install')
        ? 'install'
        : 'start';
    try {
      // Play 화면을 열기 전에 처리 상태를 기록해야 복귀 직후 같은 버전의
      // 중앙 알림이 다시 나타나지 않아요.
      if (kind === 'available') {
        await snoozeFor24Hours();
        if (!actionGate.isCurrent(revision)) return;
      }
      let nextStatus: PlayUpdateStatus | null = null;
      if (action === 'install') {
        nextStatus = await completeFlexiblePlayUpdate();
      } else if (status?.flexibleAllowed) {
        nextStatus = await startFlexiblePlayUpdate();
      } else {
        await openGooglePlayListing();
      }
      if (!actionGate.isCurrent(revision)) return;
      if (nextStatus) {
        setStatus((current) => mergePlayUpdateStatus(current, nextStatus));
        if (resolvePlayUpdateNoticeKind(nextStatus) === 'failed') {
          setFailedRetryAction(action);
        }
      }
      setNow(Date.now());
    } catch {
      if (!actionGate.isCurrent(revision)) return;
      setFailedRetryAction(action);
      setStatus((current) =>
        current
          ? { ...current, installStatus: 'failed', state: 'failed' }
          : current,
      );
    } finally {
      if (actionGate.release(revision)) setBusy(false);
    }
  }, [enabled, failedRetryAction, snoozeFor24Hours, status]);

  const kind = resolvePlayUpdateNoticeKind(status);
  const badge = getPlayUpdateStatusBadge(status);
  const statusBarVisible =
    enabled && shouldPresentPlayUpdateStatusBar(status, snooze, now);

  useEffect(() => {
    const previousKind = previousNoticeKindRef.current;
    previousNoticeKindRef.current = kind;
    if (
      kind === null ||
      kind === 'available' ||
      (kind !== 'installed' && !statusBarVisible)
    ) {
      return;
    }
    const announcement = getPlayUpdateTransitionAnnouncement(previousKind, kind);
    if (announcement) {
      void AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [kind, statusBarVisible]);

  const modalVisible =
    enabled &&
    snoozeLoaded &&
    shouldPresentPlayUpdateModal(status, snooze, now);
  const defaultBottomControlInset =
    segments[0] === '(tabs)'
      ? resolveFloatingTabBarLayout(
          fontScale,
          insets.bottom,
          Platform.OS === 'web',
        ).contentOffset
      : Math.max(insets.bottom, space.md);
  const statusBarBottom = resolveGlobalBottomOverlayBottom(
    defaultBottomControlInset,
    bottomControlInset,
    space.sm,
  );
  const globalBottomOverlayInset =
    statusBarVisible && statusBarHeight > 0
      ? statusBarBottom + statusBarHeight
      : 0;

  useLayoutEffect(() => {
    setPriorityModalVisible(PLAY_UPDATE_PRIORITY_MODAL_OWNER, modalVisible);
    return () => {
      setPriorityModalVisible(PLAY_UPDATE_PRIORITY_MODAL_OWNER, false);
    };
  }, [modalVisible, setPriorityModalVisible]);
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
  const bottomOverlayLayout = useMemo(
    () => ({
      contentInset: globalBottomOverlayInset,
      registerBottomControlInset,
    }),
    [globalBottomOverlayInset, registerBottomControlInset],
  );

  return (
    <GlobalPlayUpdateContext.Provider value={value}>
      <GlobalBottomOverlayLayoutContext.Provider value={bottomOverlayLayout}>
        {children}
        <PlayUpdateStatusBar
          bottom={statusBarBottom}
          busy={busy}
          kind={kind}
          onHeightChange={setStatusBarHeight}
          onPrimaryAction={() => void performPrimaryAction()}
          status={status}
          visible={statusBarVisible}
        />
        <PlayUpdateModal
          busy={busy}
          kind={kind}
          onPrimaryAction={() => void performPrimaryAction()}
          onSnooze={() => void snoozeFor24Hours()}
          status={status}
          visible={modalVisible}
        />
      </GlobalBottomOverlayLayoutContext.Provider>
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
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const presentation = getPlayUpdateModalPresentation(
    kind,
    status?.availableVersionCode ?? 0,
  );

  return (
    <ModalSurface
      alert={kind === 'failed'}
      cancelable={presentation.snoozable && !busy}
      onClose={onSnooze}
      title={presentation.title}
      visible={visible}>
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
      <AppText style={styles.modalMessage} tone="secondary">
        {presentation.message}
      </AppText>
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
    </ModalSurface>
  );
}

function PlayUpdateStatusBar({
  bottom,
  busy,
  kind,
  onHeightChange,
  onPrimaryAction,
  status,
  visible,
}: {
  bottom: number;
  busy: boolean;
  kind: PlayUpdateNoticeKind | null;
  onHeightChange: (height: number) => void;
  onPrimaryAction: () => void;
  status: PlayUpdateStatus | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const progress = status ? getPlayUpdateProgress(status) : null;
  const presentation = getPlayUpdateStatusBarPresentation(kind, progress);
  const stackContent = fontScale >= 1.4 || windowWidth < 360;
  const geometry = resolveFloatingTabBarGeometry(
    windowWidth,
    insets.left,
    insets.right,
    space.lg,
  );
  const actionFocus = useWebFocusVisible();
  if (!visible || !presentation) return null;

  const toneColor =
    presentation.tone === 'success'
      ? palette.mint
      : presentation.tone === 'warning'
        ? palette.amber
        : presentation.tone === 'danger'
          ? palette.danger
          : palette.blue;
  const toneSurface =
    presentation.tone === 'success'
      ? palette.mintSoft
      : presentation.tone === 'warning'
        ? palette.amberSoft
        : presentation.tone === 'danger'
          ? palette.dangerSoft
          : palette.blueSoft;

  return (
    <View
      pointerEvents={presentation.actionLabel ? 'box-none' : 'none'}
      style={[
        styles.updateStatusPositioner,
        {
          bottom,
          left: geometry.inset,
          width: geometry.width,
        },
      ]}>
      <View
        accessible={presentation.actionLabel === null}
        accessibilityLabel={
          presentation.actionLabel === null
            ? `${presentation.title}. ${presentation.message}`
            : undefined
        }
        accessibilityLiveRegion="none"
        accessibilityRole={kind === 'downloading' ? 'progressbar' : undefined}
        accessibilityValue={
          kind === 'downloading' && progress !== null
            ? { min: 0, max: 100, now: progress }
            : undefined
        }
        onLayout={(event: LayoutChangeEvent) =>
          onHeightChange(event.nativeEvent.layout.height)
        }
        style={[
          styles.updateStatusBar,
          stackContent && styles.updateStatusBarStacked,
          { backgroundColor: toneSurface, borderColor: toneColor },
        ]}>
        <View
          style={[
            styles.updateStatusMain,
            stackContent && styles.updateStatusMainStacked,
          ]}>
          <View style={styles.updateStatusIcon}>
            {kind === 'downloading' || kind === 'installing' || busy ? (
              <ActivityIndicator color={toneColor} size="small" />
            ) : (
              <AppIcon
                accessible={false}
                color={toneColor}
                name={
                  kind === 'downloaded'
                    ? 'checkmark-circle'
                    : 'alert-circle-outline'
                }
                size={size.iconMedium}
              />
            )}
          </View>
          <View style={styles.updateStatusCopy}>
            <AppText variant="label">{presentation.title}</AppText>
            <AppText tone="secondary" variant="caption">
              {presentation.message}
            </AppText>
          </View>
        </View>
        {presentation.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onBlur={actionFocus.onBlur}
            onFocus={actionFocus.onFocus}
            onPress={onPrimaryAction}
            style={({ pressed }) => [
              styles.updateStatusAction,
              stackContent && styles.updateStatusActionStacked,
              { borderColor: toneColor },
              pressed && styles.updateStatusActionPressed,
              actionFocus.focusVisible && [
                styles.updateStatusActionFocus,
                { outlineColor: palette.focus },
              ],
            ]}>
            <AppText color={toneColor} variant="label">
              {presentation.actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    modalIcon: {
      width: size.largeControl,
      height: size.largeControl,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.lg,
      backgroundColor: palette.blueSoft,
    },
    modalMessage: { textAlign: 'center' },
    modalActions: { gap: space.sm },
    modalAction: { width: '100%' },
    updateStatusPositioner: {
      position: 'absolute',
      zIndex: 1_200,
      elevation: 24,
      alignItems: 'center',
    },
    updateStatusBar: {
      width: '100%',
      maxWidth: 480,
      minHeight: size.minimumTouchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingLeft: space.md,
      paddingRight: space.sm,
      paddingVertical: space.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      shadowColor: palette.shadowColor,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.24,
      shadowRadius: 14,
      elevation: 12,
    },
    updateStatusBarStacked: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    updateStatusMain: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    updateStatusMainStacked: { width: '100%', flex: 0 },
    updateStatusIcon: {
      width: size.iconMedium,
      height: size.iconMedium,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    updateStatusCopy: { minWidth: 0, flex: 1, gap: space.xxs },
    updateStatusAction: {
      minWidth: size.minimumTouchTarget,
      minHeight: size.minimumTouchTarget,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
      borderWidth: 1,
      borderRadius: radius.sm,
    },
    updateStatusActionStacked: { width: '100%' },
    updateStatusActionPressed: { opacity: 0.76 },
    updateStatusActionFocus:
      Platform.OS === 'web'
        ? {
            outlineOffset: 2,
            outlineStyle: 'solid',
            outlineWidth: 2,
          }
        : {},
  });
}
