import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { shape } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export function SetupApplyingOverlay({ visible }: { visible: boolean }) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReduceMotion();

  if (!visible) return null;

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={() => undefined}
      statusBarTranslucent
      transparent
      visible>
      <View
        accessibilityLabel="설정 저장 중"
        accessibilityRole="progressbar"
        accessibilityViewIsModal
        style={styles.applyOverlay}>
        <View style={styles.applyCard}>
          <ActivityIndicator color={palette.focus} size="large" />
          <AppText accessibilityRole="header" variant="heading">
            설정 저장 중
          </AppText>
          <AppText style={styles.centerText} tone="secondary" variant="caption">
            근무표 저장 · 알람 예약
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
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
      borderRadius: shape.overlay,
      backgroundColor: palette.surface,
      padding: spacing.xlarge,
    },
    centerText: { textAlign: 'center' },
  });
}
