import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppActive } from '@/hooks/use-app-active';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export function SetupBlurredHomeBackdrop() {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.homePreview}>
        <View style={styles.previewDate} />
        <View style={styles.previewHero}>
          <View style={styles.previewStatus} />
          <View style={styles.previewHeroTitle} />
          <View style={styles.previewHeroDetail} />
          <View style={styles.previewHeroFooter} />
        </View>
        <View style={styles.previewSectionTitle} />
        <View style={styles.previewGuideCard}>
          <View style={styles.previewGuideIcon} />
          <View style={styles.previewGuideCopy}>
            <View style={styles.previewGuideTitle} />
            <View style={styles.previewGuideLine} />
          </View>
        </View>
        <View style={styles.previewGuideCard}>
          <View style={styles.previewGuideIcon} />
          <View style={styles.previewGuideCopy}>
            <View style={styles.previewGuideTitle} />
            <View style={styles.previewGuideLineShort} />
          </View>
        </View>
        <View style={styles.previewTabBar} />
      </View>
      <View style={styles.homePreviewScrim} />
    </View>
  );
}

export function SetupApplyingOverlay({ visible }: { visible: boolean }) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReduceMotion();
  const appActive = useAppActive();
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    rotation.stopAnimation();
    rotation.setValue(0);
    if (!visible || reduceMotion || !appActive) return;

    const animation = Animated.loop(
      Animated.timing(rotation, {
        duration: 1_100,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      rotation.stopAnimation();
    };
  }, [appActive, reduceMotion, rotation, visible]);

  if (!visible) return null;

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={() => undefined}
      statusBarTranslucent
      transparent
      visible>
      <View
        accessibilityLabel="설정 적용 중"
        accessibilityRole="progressbar"
        accessibilityViewIsModal
        style={styles.applyOverlay}>
        <View style={styles.applyCard}>
          <Animated.View
            style={
              reduceMotion || !appActive
                ? undefined
                : {
                    transform: [
                      {
                        rotate: rotation.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '360deg'],
                        }),
                      },
                    ],
                  }
            }>
            <AppIcon
              accessible={false}
              color={palette.indigoDark}
              name="settings-outline"
              size={42}
            />
          </Animated.View>
          <AppText accessibilityRole="header" variant="heading">
            설정 적용 중
          </AppText>
          <AppText style={styles.centerText} tone="secondary" variant="caption">
            근무표를 안전하게 저장하고 알람을 준비합니다.
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    homePreview: {
      flex: 1,
      gap: spacing.large,
      paddingHorizontal: spacing.large,
      paddingTop: 54,
      opacity: 0.58,
      filter: [{ blur: 12 }, { saturate: 0.35 }],
      transform: [{ scale: 1.06 }],
    },
    previewDate: {
      width: 184,
      height: 22,
      alignSelf: 'center',
      borderRadius: 11,
      backgroundColor: palette.inkMuted,
    },
    previewHero: {
      minHeight: 224,
      gap: spacing.medium,
      borderRadius: 26,
      backgroundColor: palette.surfaceSoft,
      padding: spacing.large,
    },
    previewStatus: {
      width: 116,
      height: 28,
      borderRadius: 14,
      backgroundColor: palette.controlLine,
    },
    previewHeroTitle: {
      width: '72%',
      height: 42,
      borderRadius: 12,
      backgroundColor: palette.ink,
    },
    previewHeroDetail: {
      width: '58%',
      height: 20,
      borderRadius: 10,
      backgroundColor: palette.inkMuted,
    },
    previewHeroFooter: {
      height: 66,
      marginTop: 'auto',
      borderRadius: 18,
      backgroundColor: palette.surface,
    },
    previewSectionTitle: {
      width: 132,
      height: 26,
      alignSelf: 'center',
      borderRadius: 13,
      backgroundColor: palette.ink,
    },
    previewGuideCard: {
      minHeight: 90,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      borderRadius: 22,
      backgroundColor: palette.surface,
      padding: spacing.medium,
    },
    previewGuideIcon: {
      width: 44,
      height: 44,
      borderRadius: 15,
      backgroundColor: palette.surfaceSoft,
    },
    previewGuideCopy: { flex: 1, gap: spacing.small },
    previewGuideTitle: {
      width: '58%',
      height: 18,
      borderRadius: 9,
      backgroundColor: palette.ink,
    },
    previewGuideLine: {
      width: '92%',
      height: 14,
      borderRadius: 7,
      backgroundColor: palette.inkMuted,
    },
    previewGuideLineShort: {
      width: '70%',
      height: 14,
      borderRadius: 7,
      backgroundColor: palette.inkMuted,
    },
    previewTabBar: {
      position: 'absolute',
      right: spacing.medium,
      bottom: 20,
      left: spacing.medium,
      height: 82,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 28,
      backgroundColor: palette.surface,
    },
    homePreviewScrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: palette.canvas,
      opacity: 0.8,
    },
    applyOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(16, 18, 20, 0.92)',
      padding: spacing.xlarge,
    },
    applyCard: {
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      gap: spacing.medium,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 24,
      backgroundColor: palette.surface,
      padding: spacing.xlarge,
    },
    centerText: { textAlign: 'center' },
  });
}
