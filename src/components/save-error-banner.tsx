import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import {
  getAlarmSyncErrorPresentation,
  getSaveErrorPresentation,
  shouldExpandSaveErrorBanner,
} from '@/components/save-feedback';
import { AppButton, AppText } from '@/components/ui-kit';
import {
  colorWithAlpha,
  radii,
  shadow,
  spacing,
  type AppPalette,
} from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  useAppStoreActions,
  useAppStoreStatus,
} from '@/store/app-store';

export function SaveErrorBanner() {
  const { resyncAlarms, retrySave } = useAppStoreActions();
  const {
    alarmSyncError,
    alarmSyncStatus,
    saveError,
    saveStatus,
  } = useAppStoreStatus();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const saveFailed = saveStatus === 'error';
  const alarmFailed = !saveFailed && alarmSyncStatus === 'error';
  const hasError = saveFailed || alarmFailed;
  const activeMessage = saveFailed ? saveError : alarmSyncError;
  const activeSource = alarmFailed ? 'alarm' : 'save';
  const [retrying, setRetrying] = useState(false);
  const [displayError, setDisplayError] = useState(hasError);
  const [displayMessage, setDisplayMessage] = useState(activeMessage);
  const [displaySource, setDisplaySource] = useState<'save' | 'alarm'>(activeSource);
  const [expanded, setExpanded] = useState(() =>
    shouldExpandSaveErrorBanner(width, fontScale),
  );
  const displayErrorRef = useRef(hasError);
  const [progress] = useState(() => new Animated.Value(hasError ? 1 : 0));
  const reduceMotion = useReduceMotion();
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      progress.stopAnimation();

      if (hasError) {
        displayErrorRef.current = true;
        setDisplayError(true);
        setDisplayMessage(activeMessage);
        setDisplaySource(activeSource);
        setExpanded(shouldExpandSaveErrorBanner(width, fontScale));
        if (reduceMotion) {
          progress.setValue(1);
          return;
        }
        animation = Animated.timing(progress, {
          duration: 220,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          toValue: 1,
          useNativeDriver,
        });
        animation.start();
        return;
      }

      if (!displayErrorRef.current) {
        progress.setValue(0);
        return;
      }

      if (reduceMotion) {
        displayErrorRef.current = false;
        progress.setValue(0);
        setDisplayError(false);
        return;
      }
      animation = Animated.timing(progress, {
        duration: 160,
        easing: Easing.bezier(0.4, 0, 1, 1),
        toValue: 0,
        useNativeDriver,
      });
      animation.start(({ finished }) => {
        if (finished) {
          displayErrorRef.current = false;
          setDisplayError(false);
        }
      });
    }, 0);

    return () => {
      clearTimeout(timer);
      animation?.stop();
    };
  }, [
    activeMessage,
    activeSource,
    fontScale,
    hasError,
    progress,
    reduceMotion,
    useNativeDriver,
    width,
  ]);

  if (!displayError) return null;
  const presentation =
    displaySource === 'alarm'
      ? getAlarmSyncErrorPresentation(displayMessage)
      : getSaveErrorPresentation(displayMessage);
  const toneColor = presentation.kind === 'partial' ? palette.amber : palette.danger;
  const toneSoft = presentation.kind === 'partial' ? palette.amberSoft : palette.dangerSoft;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      if (displaySource === 'alarm') {
        await resyncAlarms(true);
      } else {
        await retrySave();
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Animated.View
      accessibilityElementsHidden={!hasError}
      accessibilityLiveRegion={hasError ? 'assertive' : 'none'}
      accessibilityRole={hasError ? 'alert' : undefined}
      importantForAccessibility={
        hasError ? 'auto' : 'no-hide-descendants'
      }
      pointerEvents={hasError ? 'box-none' : 'none'}
      style={[
        styles.positioner,
        {
          opacity: progress,
          top: Math.max(insets.top, spacing.small) + spacing.small,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.985, 1],
              }),
            },
          ],
        },
      ]}>
      <View
        style={[
          styles.banner,
          !expanded && styles.bannerCollapsed,
          { borderColor: colorWithAlpha(toneColor, isDark ? 0.52 : 0.3) },
        ]}>
        {expanded ? (
          <>
            <View style={styles.header}>
              <View style={styles.titleGroup}>
                <View style={[styles.icon, { backgroundColor: toneSoft }]}>
                  <AppIcon color={toneColor} name="alert-circle-outline" size={23} />
                </View>
                <AppText variant="label" color={palette.ink} style={styles.title}>
                  {presentation.title}
                </AppText>
              </View>
              <Pressable
                accessibilityLabel="오류 알림 축소하기"
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => setExpanded(false)}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.iconButtonPressed,
                ]}>
                <AppIcon accessible={false} color={palette.inkMuted} name="close" size={19} />
              </Pressable>
            </View>
            <AppText variant="caption" color={toneColor} style={styles.message}>
              {presentation.message}
            </AppText>
            <AppButton
              accessibilityLabel={
                displaySource === 'alarm'
                  ? '알람 다시 예약하기'
                  : '저장 다시 시도하기'
              }
              disabled={retrying}
              icon="refresh-outline"
              label={
                retrying
                  ? '시도 중'
                  : displaySource === 'alarm'
                    ? '다시 예약하기'
                    : '다시 시도하기'
              }
              loading={retrying}
              onPress={() => void retry()}
              style={styles.action}
              variant={presentation.kind === 'partial' ? 'secondary' : 'danger'}
            />
          </>
        ) : (
          <View style={styles.collapsedRow}>
            <Pressable
              accessibilityHint="오류 내용과 해결 버튼을 펼쳐요."
              accessibilityLabel={`${presentation.title}. 자세히 보기`}
              accessibilityRole="button"
              onPress={() => setExpanded(true)}
              style={({ pressed }) => [
                styles.collapsedSummary,
                pressed && styles.iconButtonPressed,
              ]}>
              <View style={[styles.icon, styles.iconCollapsed, { backgroundColor: toneSoft }]}>
                <AppIcon color={toneColor} name="alert-circle-outline" size={21} />
              </View>
              <AppText
                color={palette.ink}
                maxFontSizeMultiplier={1.4}
                numberOfLines={1}
                style={styles.collapsedTitle}
                variant="label">
                {presentation.title}
              </AppText>
              <AppIcon accessible={false} color={palette.inkMuted} name="chevron-down" size={17} />
            </Pressable>
            <Pressable
              accessibilityLabel={
                displaySource === 'alarm'
                  ? '알람 다시 예약하기'
                  : '저장 다시 시도하기'
              }
              accessibilityRole="button"
              accessibilityState={{ busy: retrying, disabled: retrying }}
              disabled={retrying}
              onPress={() => void retry()}
              style={({ pressed }) => [
                styles.retryIconButton,
                { backgroundColor: toneSoft },
                pressed && !retrying && styles.iconButtonPressed,
              ]}>
              {retrying ? (
                <ActivityIndicator color={toneColor} size="small" />
              ) : (
                <AppIcon accessible={false} color={toneColor} name="refresh-outline" size={20} />
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const createStyles = (palette: AppPalette, isDark: boolean) => ({
  positioner: {
    pointerEvents: 'box-none',
    position: 'absolute',
    left: spacing.medium,
    right: spacing.medium,
    zIndex: 1100,
    elevation: 22,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    maxWidth: 560,
    padding: spacing.medium,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colorWithAlpha(palette.danger, isDark ? 0.48 : 0.24),
    backgroundColor: palette.surface,
    gap: spacing.small,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: `0 10px 28px ${colorWithAlpha(
            palette.shadowColor,
            isDark ? 0.34 : 0.12,
          )}`,
        }
      : isDark
        ? { ...shadow, shadowColor: palette.shadowColor, shadowOpacity: 0.24 }
        : shadow),
  },
  bannerCollapsed: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.tiny,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  titleGroup: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flexShrink: 1 },
  message: { paddingHorizontal: spacing.tiny },
  action: { width: '100%' },
  iconButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.medium,
  },
  iconButtonPressed: { opacity: 0.65 },
  collapsedRow: {
    minHeight: 48,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tiny,
  },
  collapsedSummary: {
    minWidth: 0,
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    borderRadius: radii.medium,
  },
  iconCollapsed: { width: 34, height: 34, borderRadius: 11 },
  collapsedTitle: { minWidth: 0, flex: 1 },
  retryIconButton: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.medium,
  },
} satisfies Record<string, ViewStyle | TextStyle>);
