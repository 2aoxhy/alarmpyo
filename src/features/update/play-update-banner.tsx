import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  canDismissPlayUpdate,
  getPlayUpdateProgress,
  type PlayUpdateStatus,
} from '@/services/play-app-update-service';

type PlayUpdateBannerProps = {
  busy: boolean;
  onDismiss: () => void;
  onInstall: () => void;
  onStart: () => void;
  status: PlayUpdateStatus;
};

export function PlayUpdateBanner({
  busy,
  onDismiss,
  onInstall,
  onStart,
  status,
}: PlayUpdateBannerProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const progress = getPlayUpdateProgress(status);
  const downloaded =
    status.state === 'downloaded' || status.installStatus === 'downloaded';
  const installing =
    status.state === 'installing' || status.installStatus === 'installing';
  const inProgress =
    status.state === 'in-progress' ||
    status.installStatus === 'downloading' ||
    installing;
  const failed = status.state === 'failed';
  const description = downloaded
    ? '다운로드를 마쳤습니다. 저장된 근무표를 유지한 채 설치합니다.'
    : installing
      ? '다운로드한 업데이트를 설치하고 있습니다.'
      : inProgress
      ? progress === null
        ? 'Google Play에서 업데이트를 다운로드하고 있습니다.'
        : `Google Play에서 업데이트를 다운로드하고 있습니다. ${progress}%`
      : failed
        ? '업데이트를 시작하지 못했습니다. 다시 시도할 수 있습니다.'
        : '새 버전을 Google Play에서 안전하게 설치할 수 있습니다.';

  return (
    <Card density="compact" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <AppIcon
            accessible={false}
            color={palette.indigoDark}
            name="download-outline"
            size={23}
          />
        </View>
        <View style={styles.copy}>
          <AppText accessibilityRole="header" variant="label">
            신규 업데이트가 있습니다.
          </AppText>
          <AppText tone="secondary" variant="caption">
            {description}
          </AppText>
        </View>
        {canDismissPlayUpdate(status) ? (
          <Pressable
            accessibilityHint="이 버전의 업데이트 안내를 다시 표시하지 않습니다."
            accessibilityLabel="업데이트 안내 닫기"
            accessibilityRole="button"
            disabled={busy}
            hitSlop={8}
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.dismiss,
              pressed && !busy && styles.pressed,
            ]}>
            <AppIcon
              accessible={false}
              color={busy ? palette.disabledInk : palette.inkMuted}
              name="close"
              size={19}
            />
          </Pressable>
        ) : null}
      </View>
      {!inProgress ? (
        <AppButton
          icon={downloaded ? 'checkmark' : 'download-outline'}
          label={downloaded ? '업데이트 설치' : failed ? '다시 시도' : '업데이트'}
          loading={busy}
          onPress={downloaded ? onInstall : onStart}
          size="compact"
        />
      ) : null}
    </Card>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: { gap: spacing.medium },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.small },
    icon: {
      width: 42,
      height: 42,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: palette.indigoSoft,
    },
    copy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    dismiss: {
      width: 48,
      height: 48,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -spacing.small,
      marginTop: -spacing.small,
    },
    pressed: { opacity: 0.7 },
  });
}
