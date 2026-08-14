import { Stack } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { getCurrentAppUpdateLabel } from '@/constants/app-release';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  getAppDistribution,
  openGooglePlayListing,
} from '@/services/app-distribution';
import {
  checkForApkUpdate,
  downloadApkUpdate,
  findCachedApkUpdate,
  formatApkSize,
  getInstalledAppInfo,
  verifyAndOpenApkInstaller,
  type ApkUpdateCheck,
} from '@/services/apk-update-service';
import { useAppStoreStatus } from '@/store/app-store';

export const DIRECT_APK_UPDATE_BUNDLE_SENTINEL = 'ALARMPYO_DIRECT_APK_UPDATE_V1';

type ManualUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'current'
  | 'check-warning'
  | 'error'
  | 'apk-available'
  | 'apk-downloading'
  | 'apk-permission'
  | 'apk-installing';

export default function AppUpdateScreen() {
  const { showDialog } = useAppDialog();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { saveStatus } = useAppStoreStatus();
  const updateInfo = Updates.useUpdates();
  const [busy, setBusy] = useState(false);
  const [manualStatus, setManualStatus] = useState<ManualUpdateStatus>('idle');
  const [apkUpdate, setApkUpdate] = useState<ApkUpdateCheck | null>(null);
  const [apkProgress, setApkProgress] = useState(0);
  const [downloadedApkUri, setDownloadedApkUri] = useState<string | null>(null);
  const permissionResumeBusy = useRef(false);
  const operationAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const updateBlocked = busy || saveStatus === 'saving';
  const playDistribution = getAppDistribution() === 'play';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operationAbort.current?.abort();
      operationAbort.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      manualStatus !== 'apk-permission' ||
      !downloadedApkUri ||
      !apkUpdate?.release
    ) {
      return;
    }
    let cancelled = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || permissionResumeBusy.current) return;
      permissionResumeBusy.current = true;
      void (async () => {
        try {
          const installed = await getInstalledAppInfo();
          if (cancelled || !mounted.current || !installed?.installPermissionAllowed) return;
          setBusy(true);
          const result = await verifyAndOpenApkInstaller(
            downloadedApkUri,
            apkUpdate.release!,
          );
          if (cancelled || !mounted.current) return;
          setManualStatus(
            result.permissionRequired ? 'apk-permission' : 'apk-installing',
          );
        } catch (error) {
          if (cancelled || !mounted.current) return;
          setDownloadedApkUri(null);
          setManualStatus('apk-available');
          showDialog(
            '설치 화면을 열지 못했어요',
            error instanceof Error
              ? error.message
              : '앱 설치 파일을 다시 내려받은 뒤 시도해 주세요.',
          );
        } finally {
          permissionResumeBusy.current = false;
          if (!cancelled && mounted.current) setBusy(false);
        }
      })();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [apkUpdate?.release, downloadedApkUri, manualStatus, showDialog]);

  const restartWithUpdate = async () => {
    if (updateBlocked) {
      showDialog(
        '작업이 끝난 뒤 다시 시작해 주세요',
        '저장 작업이 끝나면 업데이트를 적용할 수 있어요.',
      );
      return;
    }
    setBusy(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setManualStatus('error');
      setBusy(false);
      showDialog(
        '업데이트를 적용하지 못했어요',
        '앱을 완전히 종료한 뒤 다시 실행해 주세요.',
      );
    }
  };

  const openPlayUpdate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openGooglePlayListing();
    } catch {
      showDialog(
        'Google Play를 열지 못했어요',
        '인터넷 연결과 Google Play 사용 가능 여부를 확인한 뒤 다시 시도해 주세요.',
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const openPreparedApk = async () => {
    if (!downloadedApkUri || !apkUpdate?.release) return;
    setBusy(true);
    try {
      const result = await verifyAndOpenApkInstaller(
        downloadedApkUri,
        apkUpdate.release,
      );
      setManualStatus(
        result.permissionRequired ? 'apk-permission' : 'apk-installing',
      );
      if (result.permissionRequired) {
        showDialog(
          '앱 설치 권한이 필요해요',
          '이 출처의 앱 설치를 허용한 뒤 알람표로 돌아오면 설치 화면을 다시 열어요.',
        );
      }
    } catch (error) {
      setDownloadedApkUri(null);
      setManualStatus('apk-available');
      showDialog(
        '설치 화면을 열지 못했어요',
        error instanceof Error
          ? error.message
          : '앱 설치 파일을 다시 내려받은 뒤 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadAndOpenApk = async () => {
    if (!apkUpdate?.release) return;
    operationAbort.current?.abort();
    const controller = new AbortController();
    operationAbort.current = controller;
    setBusy(true);
    try {
      let fileUri = downloadedApkUri;
      if (!fileUri) {
        setManualStatus('apk-downloading');
        setApkProgress(0);
        fileUri = await downloadApkUpdate(
          apkUpdate.release,
          (progress) => {
            if (!controller.signal.aborted && mounted.current) setApkProgress(progress);
          },
          controller.signal,
        );
        if (controller.signal.aborted || !mounted.current) return;
        setDownloadedApkUri(fileUri);
      }
      if (controller.signal.aborted || !mounted.current) return;
      const result = await verifyAndOpenApkInstaller(fileUri, apkUpdate.release);
      if (controller.signal.aborted || !mounted.current) return;
      setManualStatus(
        result.permissionRequired ? 'apk-permission' : 'apk-installing',
      );
      if (result.permissionRequired) {
        showDialog(
          '앱 설치 권한이 필요해요',
          '이 출처의 앱 설치를 허용한 뒤 알람표로 돌아오면 설치 화면을 다시 열어요.',
        );
      }
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      setDownloadedApkUri(null);
      setManualStatus('error');
      showDialog(
        '앱 설치 파일을 준비하지 못했어요',
        error instanceof Error
          ? error.message
          : '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
      );
    } finally {
      if (operationAbort.current === controller) operationAbort.current = null;
      if (mounted.current) setBusy(false);
    }
  };

  const checkForAppUpdate = async () => {
    if (updateBlocked || Platform.OS === 'web') return;
    if (updateInfo.isUpdatePending || manualStatus === 'ready') {
      await restartWithUpdate();
      return;
    }
    if (
      manualStatus === 'apk-permission' ||
      manualStatus === 'apk-installing'
    ) {
      await openPreparedApk();
      return;
    }
    if (manualStatus === 'apk-available') {
      await downloadAndOpenApk();
      return;
    }

    setBusy(true);
    setManualStatus('checking');
    operationAbort.current?.abort();
    const controller = new AbortController();
    operationAbort.current = controller;
    try {
      let apkCheckError: unknown = null;
      try {
        const check = await checkForApkUpdate(controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        setApkUpdate(check);
        setDownloadedApkUri(null);
        if (check.available) {
          const cached = check.release
            ? await findCachedApkUpdate(check.release)
            : null;
          if (controller.signal.aborted || !mounted.current) return;
          setDownloadedApkUri(cached);
          setManualStatus('apk-available');
          return;
        }
      } catch (error) {
        if (controller.signal.aborted || !mounted.current) return;
        apkCheckError = error;
      }

      if (!Updates.isEnabled) {
        setManualStatus(apkCheckError instanceof Error ? 'check-warning' : 'current');
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      if (controller.signal.aborted || !mounted.current) return;
      if (!result.isAvailable && !result.isRollBackToEmbedded) {
        setManualStatus(apkCheckError instanceof Error ? 'check-warning' : 'current');
        return;
      }

      setManualStatus('downloading');
      const fetched = await Updates.fetchUpdateAsync();
      if (controller.signal.aborted || !mounted.current) return;
      if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
        setManualStatus('current');
        return;
      }

      setManualStatus('ready');
      showDialog(
        '업데이트 준비를 마쳤어요',
        '저장된 근무표를 유지한 채 앱을 다시 시작해 업데이트를 적용해요.',
        [
          { text: '나중에', style: 'cancel' },
          { text: '다시 시작하기', onPress: () => void restartWithUpdate() },
        ],
      );
    } catch {
      if (controller.signal.aborted || !mounted.current) return;
      setManualStatus('error');
      showDialog(
        '업데이트를 확인하지 못했어요',
        '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
      );
    } finally {
      if (operationAbort.current === controller) operationAbort.current = null;
      if (mounted.current) setBusy(false);
    }
  };

  const supported = Platform.OS === 'android';
  const status = updateInfo.isUpdatePending
    ? 'ready'
    : updateInfo.isDownloading
      ? 'downloading'
      : updateInfo.isChecking
        ? 'checking'
        : manualStatus;
  const title = !supported
    ? '안드로이드 앱에서 확인할 수 있어요'
    : status === 'apk-available'
      ? `새 버전 ${apkUpdate?.release?.versionName ?? ''}`.trim()
      : status === 'apk-permission'
        ? '앱 설치 권한이 필요해요'
        : status === 'apk-installing'
          ? '앱 설치 화면을 열었어요'
          : status === 'ready'
            ? '업데이트 적용 준비를 마쳤어요'
            : status === 'checking'
              ? '업데이트를 확인하고 있어요'
              : status === 'downloading' || status === 'apk-downloading'
                ? '업데이트를 다운로드하고 있어요'
                : status === 'error'
                  ? '업데이트를 다시 확인해 주세요'
                  : status === 'check-warning'
                    ? '설치 파일 서버를 확인하지 못했어요'
                  : status === 'current'
                    ? '최신 상태예요'
                    : '앱 업데이트 확인';
  const subtitle = !supported
    ? '설치된 안드로이드 앱에서 업데이트를 확인해 주세요.'
    : status === 'apk-available' && apkUpdate?.release
      ? `${formatApkSize(apkUpdate.release.sizeBytes)} · 파일을 검증한 뒤 안드로이드 설치 화면을 열어요.${apkUpdate.manifestFromCache ? ' 저장된 배포 정보로 확인했어요.' : ''}`
      : status === 'apk-permission'
        ? '이 출처의 앱 설치를 허용한 뒤 설치 화면을 다시 열어요.'
        : status === 'apk-installing'
          ? '안드로이드 설치 화면에서 설치를 승인해 주세요.'
          : status === 'ready'
            ? '다시 시작하면 새 업데이트를 바로 적용해요.'
            : status === 'apk-downloading'
              ? `업데이트 파일 ${Math.round(apkProgress * 100)}% · 중단해도 이어받을 수 있어요.`
              : status === 'downloading'
                ? `업데이트 다운로드 ${Math.round((updateInfo.downloadProgress ?? 0) * 100)}%`
                : status === 'error'
                  ? '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
                  : status === 'check-warning'
                    ? '현재 앱은 계속 사용할 수 있어요. 인터넷 연결 후 다시 확인해 주세요.'
                  : '근무표 데이터는 그대로 유지하고 필요한 파일만 받아요.';
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
  const progressPercent = status === 'apk-downloading'
    ? Math.round(apkProgress * 100)
    : status === 'downloading'
      ? Math.round((updateInfo.downloadProgress ?? 0) * 100)
      : null;

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
                  Google Play에서 업데이트해요
                </AppText>
                <AppText tone="secondary" variant="caption">
                  새 버전은 Google Play가 안전하게 설치하고 관리해요.
                </AppText>
              </View>
            </View>
            <AppButton
              icon="download-outline"
              label="Google Play 열기"
              loading={busy}
              onPress={() => void openPlayUpdate()}
              size="compact"
            />
          </Card>

          <AppText tone="tertiary" style={styles.centerText} variant="caption">
            알람표 · {getCurrentAppUpdateLabel()}
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
            disabled={
              !supported ||
              busy ||
              saveStatus === 'saving' ||
              status === 'checking' ||
              status === 'downloading' ||
              status === 'apk-downloading'
            }
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
    notesCard: { gap: spacing.small, borderColor: palette.indigoSoft },
    releaseBlock: { alignItems: 'center', gap: spacing.tiny },
    centerText: { textAlign: 'center' },
  });
