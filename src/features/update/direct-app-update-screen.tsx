import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { updateCopy } from '@/content/update-copy';
import { useDirectAppUpdateController } from '@/features/update/direct-app-update-controller';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useAppStoreStatus } from '@/store/app-store';

export const DIRECT_APK_UPDATE_BUNDLE_SENTINEL = 'ALARMPYO_DIRECT_APK_UPDATE_V1';

export default function AppUpdateScreen() {
  const { showDialog } = useAppDialog();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { saveStatus } = useAppStoreStatus();
  const {
    actionDisabled,
    apkProgress,
    apkSizeLabel,
    apkUpdate,
    appUpdateLabel,
    busy,
    checkForAppUpdate,
    downloadedApkUri,
    downloadProgress,
    openPlayUpdate,
    playDistribution,
    status,
    supported,
  } = useDirectAppUpdateController({
    saveInProgress: saveStatus === 'saving',
    showDialog,
  });
  const title = !supported
    ? '안드로이드 앱에서 확인할 수 있습니다'
    : status === 'apk-available'
      ? `새 버전 ${apkUpdate?.release?.versionName ?? ''}`.trim()
      : status === 'apk-permission'
        ? '앱 설치 권한이 필요합니다'
        : status === 'apk-installing'
          ? '앱 설치 화면을 열었습니다'
          : status === 'ready'
            ? '업데이트 적용 준비를 마쳤습니다'
            : status === 'checking'
              ? '업데이트를 확인하고 있습니다'
              : status === 'downloading' || status === 'apk-downloading'
                ? '업데이트를 다운로드하고 있습니다'
                : status === 'error'
                  ? '업데이트를 다시 확인해야 합니다'
                  : status === 'check-warning'
                    ? '설치 파일 서버를 확인하지 못했습니다'
                  : status === 'current'
                      ? '최신 상태입니다'
                    : '앱 업데이트 확인';
  const subtitle = !supported
    ? '설치된 안드로이드 앱에서 업데이트를 확인해야 합니다.'
    : status === 'apk-available' && apkUpdate?.release
      ? `${apkSizeLabel ?? ''} · 파일을 검증한 뒤 안드로이드 설치 화면을 엽니다.${apkUpdate.manifestFromCache ? ' 저장된 배포 정보로 확인했습니다.' : ''}`
      : status === 'apk-permission'
        ? '이 출처의 앱 설치를 허용한 뒤 설치 화면을 다시 엽니다.'
        : status === 'apk-installing'
          ? '안드로이드 설치 화면에서 설치를 승인해야 합니다.'
          : status === 'ready'
            ? '다시 시작하면 새 업데이트를 바로 적용합니다.'
            : status === 'apk-downloading'
              ? `업데이트 파일 ${Math.round(apkProgress * 100)}% · 중단해도 이어받을 수 있습니다.`
              : status === 'downloading'
                ? `업데이트 다운로드 ${Math.round((downloadProgress ?? 0) * 100)}%`
                : status === 'error'
                  ? '인터넷 연결을 확인한 뒤 다시 시도해야 합니다.'
                  : status === 'check-warning'
                    ? '현재 앱은 계속 사용할 수 있습니다. 인터넷 연결 후 다시 확인해야 합니다.'
                    : '근무표 데이터는 그대로 유지하고 필요한 파일만 받습니다.';
  const buttonLabel = status === 'ready'
    ? '업데이트 적용 후 다시 시작하기'
    : status === 'apk-available'
      ? downloadedApkUri
        ? '설치 화면 열기'
        : '다운로드하고 설치하기'
      : status === 'apk-permission' || status === 'apk-installing'
        ? '설치 화면 다시 열기'
        : status === 'checking'
          ? '업데이트 확인 중'
          : status === 'downloading' || status === 'apk-downloading'
            ? '업데이트 다운로드 중'
            : '업데이트 확인하기';
  const statusIcon = status === 'current'
    ? 'checkmark-circle'
    : status === 'error' || status === 'check-warning'
      ? 'alert-circle-outline'
      : status === 'idle' || status === 'checking'
        ? 'sync'
        : 'download-outline';
  const statusColor = status === 'error'
    ? palette.danger
    : status === 'check-warning'
      ? palette.amber
    : status === 'current'
      ? palette.mintDark
      : isDark
        ? palette.indigoDark
        : palette.indigo;
  const progressPercent =
    downloadProgress === null ? null : Math.round(downloadProgress * 100);

  if (playDistribution) {
    return (
      <>
        <Stack.Screen options={{ title: '앱 업데이트' }} />
        <Screen
          key={DIRECT_APK_UPDATE_BUNDLE_SENTINEL}
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
              icon="download-outline"
              label={updateCopy.updateInPlay.text}
              loading={busy}
              onPress={() => void openPlayUpdate()}
              size="compact"
            />
          </Card>

          <AppText tone="tertiary" style={styles.centerText} variant="caption">
            알람표 · {appUpdateLabel}
          </AppText>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '앱 업데이트' }} />
      <Screen
        key={DIRECT_APK_UPDATE_BUNDLE_SENTINEL}
        contentStyle={styles.screen}
        safeAreaEdges={['left', 'right']}>
        <Card density="compact" style={styles.updateCard}>
          <View
            accessibilityLabel={`${title}. ${subtitle}`}
            accessibilityLiveRegion="polite"
            accessibilityRole={progressPercent === null ? undefined : 'progressbar'}
            accessibilityValue={
              progressPercent === null
                ? undefined
                : { min: 0, max: 100, now: progressPercent }
            }
            accessible
            style={styles.summary}>
            <View
              style={[
                styles.iconTile,
                {
                  backgroundColor:
                    status === 'error'
                      ? palette.dangerSoft
                      : status === 'check-warning'
                        ? palette.amberSoft
                      : status === 'current'
                        ? palette.mintSoft
                        : palette.indigoSoft,
                },
              ]}>
              <AppIcon accessible={false} color={statusColor} name={statusIcon} size={25} />
            </View>
            <View style={styles.copy}>
              <AppText variant="heading">{title}</AppText>
              <AppText tone="secondary" variant="caption">
                {subtitle}
              </AppText>
            </View>
          </View>
          <AppButton
            disabled={actionDisabled}
            icon={status === 'ready' ? 'refresh-outline' : 'download-outline'}
            label={buttonLabel}
            loading={busy}
            onPress={() => void checkForAppUpdate()}
            size="compact"
          />
        </Card>

        {apkUpdate?.release?.notes.length ? (
          <Card density="compact" style={styles.notesCard}>
            <AppText style={styles.centerText} variant="label">
              업데이트 내용
            </AppText>
            {apkUpdate.release.notes.map((note, index) => (
              <AppText key={`${index}-${note}`} tone="secondary" variant="caption">
                · {note}
              </AppText>
            ))}
          </Card>
        ) : null}

        <AppText tone="tertiary" style={styles.centerText} variant="caption">
          알람표 · {appUpdateLabel}
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
    notesCard: { gap: spacing.small, borderColor: palette.indigoSoft },
    releaseBlock: { alignItems: 'center', gap: spacing.tiny },
    centerText: { textAlign: 'center' },
  });
