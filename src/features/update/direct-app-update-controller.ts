import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type {
  AppDialogButton,
  AppDialogOptions,
} from '../../components/app-dialog-contract';
import { getCurrentAppUpdateLabel } from '../../constants/app-release';
import { updateCopy } from '../../content/update-copy';
import {
  getAppDistribution,
  openGooglePlayListing,
} from '../../services/app-distribution';
import {
  checkForApkUpdate,
  downloadApkUpdate,
  findCachedApkUpdate,
  formatApkSize,
  getInstalledAppInfo,
  verifyAndOpenApkInstaller,
  type ApkUpdateCheck,
} from '../../services/apk-update-service';

export type DirectUpdateDialogPresenter = {
  (
    title: string,
    message?: string,
    buttons?: undefined,
    options?: AppDialogOptions,
  ): void;
  (
    title: string,
    message: string | undefined,
    buttons: AppDialogButton[],
    options: AppDialogOptions,
  ): void;
};

export type DirectUpdateStatus =
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

export type UseDirectAppUpdateControllerOptions = {
  saveInProgress: boolean;
  showDialog: DirectUpdateDialogPresenter;
};

/** Owns Expo, Play, APK, app-lifecycle, and installer side effects. */
export function useDirectAppUpdateController({
  saveInProgress,
  showDialog,
}: UseDirectAppUpdateControllerOptions) {
  const updateInfo = Updates.useUpdates();
  const [busy, setBusy] = useState(false);
  const [manualStatus, setManualStatus] = useState<DirectUpdateStatus>('idle');
  const [apkUpdate, setApkUpdate] = useState<ApkUpdateCheck | null>(null);
  const [apkProgress, setApkProgress] = useState(0);
  const [downloadedApkUri, setDownloadedApkUri] = useState<string | null>(null);
  const permissionResumeBusy = useRef(false);
  const operationAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const updateBlocked = busy || saveInProgress;
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
          if (
            cancelled ||
            !mounted.current ||
            !installed?.installPermissionAllowed
          ) {
            return;
          }
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
            '설치 화면을 열지 못했습니다',
            error instanceof Error
              ? error.message
              : '앱 설치 파일을 다시 내려받은 뒤 시도해야 합니다.',
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

  const restartWithUpdate = useCallback(async () => {
    if (updateBlocked) {
      showDialog(
        '작업이 끝난 뒤 다시 시작해야 합니다',
        '저장 작업이 끝나면 업데이트를 적용할 수 있습니다.',
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
        '업데이트를 적용하지 못했습니다',
        '앱을 완전히 종료한 뒤 다시 실행해야 합니다.',
      );
    }
  }, [showDialog, updateBlocked]);

  const openPlayUpdate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openGooglePlayListing();
    } catch {
      showDialog(
        'Google Play를 열지 못했습니다',
        '인터넷 연결과 Google Play 사용 가능 여부를 확인한 뒤 다시 시도해야 합니다.',
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy, showDialog]);

  const openPreparedApk = useCallback(async () => {
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
          '앱 설치 권한이 필요합니다',
          '이 출처의 앱 설치를 허용한 뒤 알람표로 돌아오면 설치 화면을 다시 엽니다.',
        );
      }
    } catch (error) {
      setDownloadedApkUri(null);
      setManualStatus('apk-available');
      showDialog(
        '설치 화면을 열지 못했습니다',
        error instanceof Error
          ? error.message
          : '앱 설치 파일을 다시 내려받은 뒤 시도해야 합니다.',
      );
    } finally {
      setBusy(false);
    }
  }, [apkUpdate, downloadedApkUri, showDialog]);

  const downloadAndOpenApk = useCallback(async () => {
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
            if (!controller.signal.aborted && mounted.current) {
              setApkProgress(progress);
            }
          },
          controller.signal,
        );
        if (controller.signal.aborted || !mounted.current) return;
        setDownloadedApkUri(fileUri);
      }
      if (controller.signal.aborted || !mounted.current) return;
      const result = await verifyAndOpenApkInstaller(
        fileUri,
        apkUpdate.release,
      );
      if (controller.signal.aborted || !mounted.current) return;
      setManualStatus(
        result.permissionRequired ? 'apk-permission' : 'apk-installing',
      );
      if (result.permissionRequired) {
        showDialog(
          '앱 설치 권한이 필요합니다',
          '이 출처의 앱 설치를 허용한 뒤 알람표로 돌아오면 설치 화면을 다시 엽니다.',
        );
      }
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      setDownloadedApkUri(null);
      setManualStatus('error');
      showDialog(
        '앱 설치 파일을 준비하지 못했습니다',
        error instanceof Error
          ? error.message
          : '인터넷 연결을 확인한 뒤 다시 시도해야 합니다.',
      );
    } finally {
      if (operationAbort.current === controller) operationAbort.current = null;
      if (mounted.current) setBusy(false);
    }
  }, [apkUpdate, downloadedApkUri, showDialog]);

  const checkForAppUpdate = useCallback(async () => {
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
        setManualStatus(
          apkCheckError instanceof Error ? 'check-warning' : 'current',
        );
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      if (controller.signal.aborted || !mounted.current) return;
      if (!result.isAvailable && !result.isRollBackToEmbedded) {
        setManualStatus(
          apkCheckError instanceof Error ? 'check-warning' : 'current',
        );
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
        '업데이트 준비를 마쳤습니다',
        '저장된 근무표를 유지한 채 앱을 다시 시작해 업데이트를 적용합니다.',
        [
          {
            text: '나중에',
            actionId: 'cancel',
            icon: 'close',
            style: 'cancel',
          },
          {
            text: '다시 시작하기',
            actionId: 'retry',
            icon: 'refresh-outline',
            onPress: () => void restartWithUpdate(),
          },
        ],
        { tone: 'success' },
      );
    } catch {
      if (controller.signal.aborted || !mounted.current) return;
      setManualStatus('error');
      showDialog(
        updateCopy.checkFailedTitle.text,
        '인터넷 연결을 확인한 뒤 다시 시도해야 합니다.',
      );
    } finally {
      if (operationAbort.current === controller) operationAbort.current = null;
      if (mounted.current) setBusy(false);
    }
  }, [
    downloadAndOpenApk,
    manualStatus,
    openPreparedApk,
    restartWithUpdate,
    showDialog,
    updateBlocked,
    updateInfo.isUpdatePending,
  ]);

  const supported = Platform.OS === 'android';
  const status: DirectUpdateStatus = updateInfo.isUpdatePending
    ? 'ready'
    : updateInfo.isDownloading
      ? 'downloading'
      : updateInfo.isChecking
        ? 'checking'
        : manualStatus;
  const downloadProgress =
    status === 'apk-downloading'
      ? apkProgress
      : status === 'downloading'
        ? (updateInfo.downloadProgress ?? 0)
        : null;

  return {
    actionDisabled:
      !supported ||
      busy ||
      saveInProgress ||
      status === 'checking' ||
      status === 'downloading' ||
      status === 'apk-downloading',
    apkProgress,
    apkSizeLabel: apkUpdate?.release
      ? formatApkSize(apkUpdate.release.sizeBytes)
      : null,
    apkUpdate,
    appUpdateLabel: getCurrentAppUpdateLabel(),
    busy,
    checkForAppUpdate,
    downloadedApkUri,
    downloadProgress,
    openPlayUpdate,
    playDistribution,
    status,
    supported,
  };
}
