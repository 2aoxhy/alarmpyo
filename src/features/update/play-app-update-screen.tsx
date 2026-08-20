import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { getCurrentAppUpdateLabel } from '@/constants/app-release';
import { updateCopy } from '@/content/update-copy';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppLifecycle } from '@/hooks/use-app-active';
import { useScreenActive } from '@/hooks/use-screen-active';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { openGooglePlayListing } from '@/services/app-distribution';
import {
  completeFlexiblePlayUpdate,
  getPlayUpdateStatusForTransition,
  startFlexiblePlayUpdate,
  type PlayUpdateStatus,
} from '@/services/play-app-update-service';
import { StatusBanner } from '@/design-system';

export const PLAY_UPDATE_BUNDLE_SENTINEL = 'ALARMPYO_PLAY_STORE_UPDATE_V1';

export default function PlayAppUpdateScreen() {
  const { showDialog } = useAppDialog();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<PlayUpdateStatus | null>(null);
  const screenActive = useScreenActive();
  const appLifecycle = useAppLifecycle();

  useEffect(() => {
    if (!screenActive) return;
    let cancelled = false;
    void getPlayUpdateStatusForTransition(appLifecycle.transitionId).then(
      (nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [appLifecycle.transitionId, screenActive]);

  const openPlayUpdate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (
        status?.state === 'downloaded' ||
        status?.installStatus === 'downloaded'
      ) {
        setStatus(await completeFlexiblePlayUpdate());
      } else if (
        status?.supported &&
        status.updateAvailable &&
        status.flexibleAllowed
      ) {
        setStatus(await startFlexiblePlayUpdate());
      } else {
        await openGooglePlayListing();
      }
    } catch {
      showDialog(
        'Google Play를 열지 못했습니다',
        '인터넷 연결과 Google Play 사용 가능 여부를 확인한 뒤 다시 시도해야 합니다.',
      );
    } finally {
      setBusy(false);
    }
  };
  const downloaded =
    status?.state === 'downloaded' || status?.installStatus === 'downloaded';
  const inProgress =
    status?.state === 'in-progress' || status?.state === 'installing';
  const actionLabel = downloaded
    ? '업데이트 설치'
    : status?.updateAvailable && status.flexibleAllowed
      ? status.state === 'failed'
        ? '다시 시도'
        : '업데이트'
      : updateCopy.updateInPlay.text;

  return (
    <>
      <Stack.Screen options={{ title: '앱 업데이트' }} />
      <Screen
        key={PLAY_UPDATE_BUNDLE_SENTINEL}
        contentStyle={styles.screen}
        safeAreaEdges={['left', 'right']}>
        <Card density="compact" style={styles.updateCard}>
          <View style={styles.summary}>
            <View
              style={[
                styles.iconTile,
                { backgroundColor: palette.indigoSoft },
              ]}>
              <AppIcon
                accessible={false}
                color={isDark ? palette.indigoDark : palette.indigo}
                name="download-outline"
                size={25}
              />
            </View>
            <View style={styles.copy}>
              <AppText accessibilityRole="header" variant="heading">
                {updateCopy.playTitle.text}
              </AppText>
              <AppText tone="secondary" variant="caption">
                {updateCopy.playManaged.text}
              </AppText>
            </View>
          </View>
          <AppButton
            disabled={inProgress}
            icon={downloaded ? 'checkmark' : 'download-outline'}
            label={inProgress ? '업데이트 진행 중' : actionLabel}
            loading={busy}
            onPress={() => void openPlayUpdate()}
            size="compact"
          />
        </Card>

        {status?.state === 'in-progress' ? (
          <StatusBanner
            message="Google Play에서 새 버전을 다운로드하고 있습니다."
            title="업데이트 진행 중"
            tone="info"
          />
        ) : status?.state === 'failed' ? (
          <StatusBanner
            message="인터넷 연결과 Google Play 상태를 확인한 뒤 다시 시도해야 합니다."
            title="업데이트를 시작하지 못했습니다"
            tone="danger"
          />
        ) : status?.supported && !status.updateAvailable ? (
          <StatusBanner
            message={updateCopy.upToDate.text}
            title="업데이트 확인 완료"
            tone="success"
          />
        ) : null}

        <AppText tone="tertiary" style={styles.centerText} variant="caption">
          알람표 · {getCurrentAppUpdateLabel()}
        </AppText>
      </Screen>
    </>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    screen: { gap: spacing.large, paddingTop: spacing.small },
    updateCard: { gap: spacing.medium },
    summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
    iconTile: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 17,
    },
    copy: { flex: 1, minWidth: 0, gap: spacing.tiny },
    centerText: { textAlign: 'center' },
  });
