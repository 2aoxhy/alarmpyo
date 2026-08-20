import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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

/**
 * 첫 설정 뒤에 실제 화면을 흉내 내지 않고 브랜드의 빛만 남깁니다.
 * 장식은 접근성 트리에서 제외하고 설정 내용의 대비를 방해하지 않습니다.
 */
export function SetupBrandHaloBackdrop() {
  const styles = useThemedStyles(createStyles);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#123D36', '#152433', '#101214']}
        end={{ x: 0.78, y: 1 }}
        start={{ x: 0.2, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.brandHaloMint} />
      <View style={styles.brandHaloBlue} />
      <View style={styles.brandHaloScrim} />
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
    brandHaloMint: {
      position: 'absolute',
      top: -132,
      left: -116,
      width: 330,
      height: 330,
      borderRadius: 165,
      backgroundColor: '#58D9BC',
      opacity: 0.08,
    },
    brandHaloBlue: {
      position: 'absolute',
      top: 112,
      right: -156,
      width: 360,
      height: 360,
      borderRadius: 180,
      backgroundColor: '#89CEFF',
      opacity: 0.055,
    },
    brandHaloScrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: palette.canvas,
      opacity: 0.78,
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
