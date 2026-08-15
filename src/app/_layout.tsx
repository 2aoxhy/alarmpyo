import { useFonts } from 'expo-font';
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { StatusBar } from 'expo-status-bar';
import { Component, type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppText } from '@/components/ui-kit';
import { AppDialogProvider, useAppDialog } from '@/components/app-dialog';
import {
  LaunchTransitionOverlay,
  resolveFrozenLaunchFontMode,
  resolveLaunchFontMode,
  type FrozenLaunchFontMode,
} from '@/components/launch-transition-overlay';
import { SaveErrorBanner } from '@/components/save-error-banner';
import { SaveToast } from '@/components/save-toast';
import { AlarmPyoWidgetSyncBridge } from '@/components/alarmpyo-widget-sync-bridge';
import type { AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useAppLifecycle } from '@/hooks/use-app-active';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotionStatus } from '@/hooks/use-reduce-motion';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { AppThemeProvider } from '@/providers/app-theme-provider';
import {
  AppStoreProvider,
  useAppStore,
  useAppStoreData,
  useAppStoreStatus,
} from '@/store/app-store';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <RootLayoutContent />
    </RootErrorBoundary>
  );
}

function RootLayoutContent() {
  const reduceMotionStatus = useReduceMotionStatus();
  const [fontsLoaded, fontError] = useFonts({
    WantedSansMedium: require('../../assets/fonts/WantedSans-Medium.ttf'),
    WantedSansBold: require('../../assets/fonts/WantedSans-Bold.ttf'),
    WantedSansExtraBold: require('../../assets/fonts/WantedSans-ExtraBold.ttf'),
  });
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  const launchFontMode = resolveLaunchFontMode(
    fontsLoaded,
    Boolean(fontError) || fontLoadTimedOut,
  );
  const launchReadyFontMode = resolveFrozenLaunchFontMode(null, launchFontMode);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timeout = setTimeout(() => setFontLoadTimedOut(true), 8_000);
    return () => clearTimeout(timeout);
  }, [fontError, fontsLoaded]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppStoreProvider>
        <AppBootstrap
          launchFontMode={launchReadyFontMode}
          reduceMotion={!reduceMotionStatus.known || reduceMotionStatus.enabled}
        />
      </AppStoreProvider>
    </GestureHandlerRootView>
  );
}

class RootErrorBoundary extends Component<
  PropsWithChildren,
  { hasError: boolean; restarting: boolean }
> {
  state = { hasError: false, restarting: false };

  static getDerivedStateFromError() {
    return { hasError: true, restarting: false };
  }

  private restart = () => {
    if (this.state.restarting) return;
    this.setState({ restarting: true });

    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }

    void Updates.reloadAsync().catch(() => {
      this.setState({ hasError: false, restarting: false });
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <SafeAreaView style={bootstrapStyles.errorBoundary}>
        <StatusBar style="light" />
        <Text accessibilityRole="header" style={bootstrapStyles.errorTitle}>
          앱 화면을 불러오지 못했습니다
        </Text>
        <Text style={bootstrapStyles.errorDescription}>
          저장된 근무표는 그대로 유지됩니다. 앱을 다시 시작해야 합니다.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: this.state.restarting }}
          disabled={this.state.restarting}
          onPress={this.restart}
          style={({ pressed }) => [
            bootstrapStyles.errorButton,
            pressed && bootstrapStyles.errorButtonPressed,
          ]}>
          <Text style={bootstrapStyles.errorButtonLabel}>
            {this.state.restarting ? '다시 시작하는 중' : '앱 다시 시작'}
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }
}

function AppBootstrap({
  launchFontMode,
  reduceMotion,
}: {
  launchFontMode: FrozenLaunchFontMode;
  reduceMotion: boolean;
}) {
  const { loadError } = useAppStoreStatus();
  const { ready } = useAppStoreData();
  const bootstrapReady = ready || Boolean(loadError);
  const [visibleLaunchFontMode] = useState(launchFontMode);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [launchSurfaceReady, setLaunchSurfaceReady] = useState(false);
  const [launchVisible, setLaunchVisible] = useState(true);
  const nativeSplashHideRequested = useRef(false);
  const handleLaunchReady = useCallback(() => setLaunchSurfaceReady(true), []);
  const finishLaunch = useCallback(() => setLaunchVisible(false), []);

  useEffect(() => {
    if (
      hasRevealed ||
      nativeSplashHideRequested.current ||
      !bootstrapReady ||
      !launchSurfaceReady
    ) {
      return;
    }
    nativeSplashHideRequested.current = true;
    const hideSplash =
      Platform.OS === 'web' ? Promise.resolve() : SplashScreen.hideAsync();
    void hideSplash
      .catch(() => undefined)
      .finally(() => setHasRevealed(true));
  }, [bootstrapReady, hasRevealed, launchSurfaceReady]);

  return (
    <View style={bootstrapStyles.root}>
      {bootstrapReady ? (
        <AppThemeProvider>
          <AppDialogProvider>
            <AppShell />
          </AppDialogProvider>
        </AppThemeProvider>
      ) : null}
      {launchVisible ? (
        <>
          <StatusBar animated style="light" />
          <LaunchTransitionOverlay
            fontMode={visibleLaunchFontMode}
            onFinished={finishLaunch}
            onReady={handleLaunchReady}
            ready={bootstrapReady && hasRevealed}
            reduceMotion={reduceMotion || Boolean(loadError)}
          />
        </>
      ) : null}
    </View>
  );
}

function AppShell() {
  const { showDialog } = useAppDialog();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const {
    corruptBackupKey,
    data,
    getRecoveryBackupPreview,
    loadError,
    loadFailureReason,
    ready,
    resyncAlarms,
    restoreRecoveryBackup,
    retryLoad,
    startFreshAfterLoadError,
  } = useAppStore();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const appLifecycle = useAppLifecycle();
  const lastAlarmLifecycleTransitionRef = useRef(appLifecycle.transitionId);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [automaticBackupResult, setAutomaticBackupResult] = useState<{
    loadError: string;
    available: boolean;
  } | null>(null);
  const hasAutomaticBackup =
    automaticBackupResult?.loadError === loadError && automaticBackupResult.available;
  const recoveryRequired = loadFailureReason === 'recovery-required';

  useEffect(() => {
    if (!loadError) return;
    let cancelled = false;
    void getRecoveryBackupPreview()
      .then((preview) => {
        if (!cancelled) {
          setAutomaticBackupResult({ loadError, available: preview !== null });
        }
      })
      .catch(() => {
        if (!cancelled) setAutomaticBackupResult({ loadError, available: false });
      });
    return () => {
      cancelled = true;
    };
  }, [getRecoveryBackupPreview, loadError]);

  useEffect(() => {
    if (!ready || loadError || !rootNavigationState?.key) return;
    const onSetupScreen = segments[0] === 'setup';
    if (!data.settings.setupCompleted && !onSetupScreen) router.replace('/setup');
    if (data.settings.setupCompleted && onSetupScreen) router.replace('/');
  }, [data.settings.setupCompleted, loadError, ready, rootNavigationState?.key, segments]);

  useEffect(() => {
    if (!ready) {
      lastAlarmLifecycleTransitionRef.current = appLifecycle.transitionId;
      return;
    }
    if (
      !appLifecycle.active ||
      appLifecycle.transitionId <= lastAlarmLifecycleTransitionRef.current ||
      Platform.OS === 'web'
    ) {
      return;
    }
    lastAlarmLifecycleTransitionRef.current = appLifecycle.transitionId;
    void resyncAlarms();
  }, [appLifecycle.active, appLifecycle.transitionId, ready, resyncAlarms]);

  const restoreFromLoadError = async () => {
    if (recoveryBusy) return;
    setRecoveryBusy(true);
    try {
      const success = await restoreRecoveryBackup();
      if (!success) {
        showDialog(
          '복구하지 못했습니다',
          '안전 백업을 읽을 수 없습니다.',
          undefined,
          { tone: 'danger' },
        );
      }
    } finally {
      setRecoveryBusy(false);
    }
  };

  const retryFromLoadError = async () => {
    if (recoveryBusy) return;
    setRecoveryBusy(true);
    try {
      await retryLoad();
    } finally {
      setRecoveryBusy(false);
    }
  };

  const confirmFreshStart = () => {
    showDialog(
      '새 근무표로 시작하시겠습니까?',
      recoveryRequired
        ? '남아 있는 안전 백업은 자동으로 적용하지 않고 첫 근무일부터 다시 설정합니다.'
        : '불러오지 못한 원본은 복구용으로 따로 보관하고 오늘 근무 위치부터 다시 설정합니다.',
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '새로 시작',
          actionId: 'delete',
          icon: 'trash-outline',
          style: 'destructive',
          onPress: () => {
            setRecoveryBusy(true);
            void startFreshAfterLoadError()
              .then((success) => {
                if (!success) {
                  showDialog(
                    '시작하지 못했습니다',
                    '저장 공간을 확인한 뒤 다시 시도해야 합니다.',
                    undefined,
                    { tone: 'danger' },
                  );
                }
              })
              .finally(() => setRecoveryBusy(false));
          },
        },
      ],
      { tone: 'warning' },
    );
  };

  if (loadError) {
    return (
      <SafeAreaView style={styles.gate}>
        <StatusBar animated style="light" />
        <View style={styles.errorCard}>
          <AppText accessibilityRole="header" variant="title">
            {recoveryRequired ? '안전 백업을 찾았습니다' : '근무표를 불러오지 못했습니다'}
          </AppText>
          <AppText tone="secondary">{loadError}</AppText>
          {corruptBackupKey ? (
            <AppText variant="caption" tone="secondary">
              불러오지 못한 원본은 복구용으로 따로 보관했습니다.
            </AppText>
          ) : null}
          <AppButton
            label="다시 불러오기"
            loading={recoveryBusy}
            onPress={() => void retryFromLoadError()}
          />
          {hasAutomaticBackup ? (
            <AppButton
              disabled={recoveryBusy}
              label="최근 안전 백업 복구"
              onPress={() => void restoreFromLoadError()}
              variant="secondary"
            />
          ) : null}
          {corruptBackupKey || recoveryRequired ? (
            <AppButton
              disabled={recoveryBusy}
              label="새 근무표로 시작"
              onPress={confirmFreshStart}
              variant="danger"
            />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <View
        accessible
        accessibilityLabel="근무표를 불러오는 중"
        accessibilityRole="progressbar"
        style={styles.gate}>
        <StatusBar animated style="light" />
        <ActivityIndicator color={palette.mintDark} size="large" />
      </View>
    );
  }

  return (
    <>
      <AlarmPyoWidgetSyncBridge />
      <StatusBar animated style="light" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.canvas },
          headerTintColor: palette.ink,
          headerTitleAlign: 'center',
          headerTitleStyle: { fontFamily: fontFamily.heading, fontSize: 20 },
          contentStyle: { backgroundColor: palette.canvas },
        }}>
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="day/[date]" options={{ title: '하루 일정', presentation: 'modal' }} />
        <Stack.Screen name="pattern" options={{ title: '근무표' }} />
        <Stack.Screen name="shift-settings" options={{ title: '근무 시간' }} />
      </Stack>
      <SaveErrorBanner />
      <SaveToast />
    </>
  );
}

const bootstrapStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#101214',
  },
  errorBoundary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 28,
    backgroundColor: '#101214',
  },
  errorTitle: {
    color: '#FAFAFB',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
    textAlign: 'center',
  },
  errorDescription: {
    maxWidth: 420,
    color: '#D9DDE3',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  errorButton: {
    minWidth: 180,
    minHeight: 54,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#616A75',
    paddingHorizontal: 22,
  },
  errorButtonPressed: { transform: [{ scale: 0.985 }] },
  errorButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    gate: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: palette.canvas,
    },
    errorCard: {
      width: '100%',
      maxWidth: 520,
      gap: 16,
      padding: 24,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
      backgroundColor: palette.surface,
    },
  });
}
