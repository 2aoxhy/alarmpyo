import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import {
  BackupPasswordDialog,
  type BackupPasswordDialogMode,
} from '@/components/backup-password-dialog';
import { getBackupRestorePresentation } from '@/components/backup-restore-feedback';
import { ListRow, MenuDivider, MenuGroup, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { dataCopy } from '@/content/data-copy';
import { StatusBanner } from '@/design-system';
import {
  type AppDataImportPreview,
  isExternalBackupReminderDue,
  type SharedShiftSettings,
  type WorkSettingsSharePreview,
} from '@/features/data-settings/data-settings-controller';
import { dataSettingsController } from '@/features/data-settings/data-settings-native-controller';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  useAppSelector,
  useAppCommands,
  type PendingRestoreBackupPreview,
} from '@/store/app-store';
import type { AppStore } from '@/application/app-store-contract';
import { formatCompactTime, formatKoreanDate } from '@/utils/date';

function formatSharedShiftLine(label: string, shift: SharedShiftSettings): string {
  if (shift.startMinutes === null || shift.endMinutes === null) return `${label} · 휴무`;
  const endPrefix = shift.endsNextDay ? '다음 날 ' : '';
  return `${label} ${formatCompactTime(shift.startMinutes)}~${endPrefix}${formatCompactTime(shift.endMinutes)}`;
}

function safePickedFileName(fileName: string): string {
  return fileName.replace(/[\r\n]/g, ' ').slice(0, 100);
}

function formatBackupCreatedAt(exportedAt: string | null): string {
  if (!exportedAt) return '생성 시각 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(exportedAt));
}

function formatSharedPatternSequence(shiftTypeIds: readonly string[]): string {
  const labels: Record<string, string> = {
    day: '주',
    evening: '오',
    night: '야',
    off: '휴',
  };
  return shiftTypeIds.map((id) => labels[id] ?? id).join(' → ');
}

type DataOperation =
  | 'apply-settings'
  | 'send-settings'
  | 'receive-settings'
  | 'export-backup'
  | 'export-encrypted-backup'
  | 'decrypt-backup'
  | 'import-backup'
  | 'select-backup'
  | 'save-pending-backup'
  | 'restore-backup'
  | 'reset-data';

type BackupLookupStatus = 'loading' | 'ready' | 'error';
type EncryptedBackupRequest =
  | { mode: 'create' }
  | { mode: 'open'; contents: string; fileName: string };

function selectCurrentRestoreSummary(store: AppStore): string {
  const changedDateCount = new Set([
    ...Object.keys(store.data.overrides),
    ...Object.keys(store.data.timeOverrides),
    ...Object.keys(store.data.dayExceptions),
    ...Object.keys(store.data.alarmOverrides),
  ]).size;
  const noteCount = Object.keys(store.data.notes).length;
  const alarmState = store.data.settings.notificationsEnabled ? '알람 켜짐' : '알람 꺼짐';
  return `${store.data.pattern.name} · 바꾼 날짜 ${changedDateCount}개 · 메모 ${noteCount}개 · ${alarmState}`;
}

export default function DataSettingsScreen() {
  const { showDialog } = useAppDialog();
  const styles = useThemedStyles(createStyles);
  const currentRestoreSummary = useAppSelector(selectCurrentRestoreSummary);
  const {
    applySharedWorkSettings,
    exportData,
    exportSharedWorkSettings,
    getLatestBackupPreview,
    getPendingRestoreBackupPreview,
    importData,
    previewImportData,
    previewSharedWorkSettings,
    resetAllDataDetailed,
    restoreLatestBackup,
    retryPendingRestoreBackup,
  } = useAppCommands();
  const [activeOperation, setActiveOperation] = useState<DataOperation | null>(null);
  const busy = activeOperation !== null;
  const receivingSettings =
    activeOperation === 'receive-settings' || activeOperation === 'apply-settings';
  const loadingFullBackup =
    activeOperation === 'select-backup' || activeOperation === 'import-backup';
  const busyRef = useRef(false);
  const encryptedBackupTriggerRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const backupFileRestoreTriggerRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const [latestBackup, setLatestBackup] = useState<AppDataImportPreview | null>(null);
  const [pendingRestoreBackup, setPendingRestoreBackup] =
    useState<PendingRestoreBackupPreview | null>(null);
  const [backupLookupStatus, setBackupLookupStatus] =
    useState<BackupLookupStatus>('loading');
  const [encryptedBackupRequest, setEncryptedBackupRequest] =
    useState<EncryptedBackupRequest | null>(null);
  const [advancedBackupExpanded, setAdvancedBackupExpanded] = useState(false);
  const advancedBackupExpandedRef = useRef(false);
  const backupLookupStartedRef = useRef(false);
  const [lastBackupExportAttemptAt, setLastBackupExportAttemptAt] =
    useState<string | null>(null);

  const beginOperation = useCallback((operation: DataOperation) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setActiveOperation(operation);
    return true;
  }, []);

  const finishOperation = useCallback(() => {
    busyRef.current = false;
    setActiveOperation(null);
  }, []);

  const refreshBackup = useCallback(async () => {
    setBackupLookupStatus('loading');
    const [latestResult, pendingResult] = await Promise.allSettled([
      getLatestBackupPreview(),
      getPendingRestoreBackupPreview(),
    ]);
    if (latestResult.status === 'fulfilled') {
      setLatestBackup(latestResult.value);
    }
    if (pendingResult.status === 'fulfilled') {
      setPendingRestoreBackup(pendingResult.value);
    }
    setBackupLookupStatus(
      latestResult.status === 'rejected' || pendingResult.status === 'rejected'
        ? 'error'
        : 'ready',
    );
  }, [getLatestBackupPreview, getPendingRestoreBackupPreview]);

  const refreshBackupExportAttemptAt = useCallback(async () => {
    setLastBackupExportAttemptAt(
      await dataSettingsController.readLastBackupExportAttemptAt(),
    );
  }, []);

  const recordBackupExportAttempt = useCallback(async () => {
    const attemptedAt = await dataSettingsController.recordBackupExportAttempt();
    setLastBackupExportAttemptAt(attemptedAt);
  }, []);

  useFocusEffect(
    useCallback(() => {
      backupLookupStartedRef.current = true;
      void refreshBackup();
      void refreshBackupExportAttemptAt();
    }, [refreshBackup, refreshBackupExportAttemptAt]),
  );

  const toggleAdvancedBackup = useCallback(() => {
    const nextExpanded = !advancedBackupExpanded;
    advancedBackupExpandedRef.current = nextExpanded;
    setAdvancedBackupExpanded(nextExpanded);
  }, [advancedBackupExpanded]);

  const refreshBackupIfLoaded = useCallback(() => {
    if (backupLookupStartedRef.current) void refreshBackup();
  }, [refreshBackup]);

  const confirmWorkSettings = (
    preview: WorkSettingsSharePreview,
    fileName: string,
  ) => {
    const { summary } = preview;
    const eveningLine = dataSettingsController.doesWorkSettingsPreviewApplyEvening(preview)
      ? formatSharedShiftLine('오후', summary.evening)
      : '오후 · 현재 휴대전화 설정 유지 (구형 파일에는 오후 설정이 없습니다)';
    const lines = [
      `파일 · ${safePickedFileName(fileName)}`,
      `근무 방식 · ${summary.patternName}`,
      `반복 순서 · ${formatSharedPatternSequence(preview.document.workSettings.pattern.shiftTypeIds)}`,
      `일정 적용 시작일 · ${formatKoreanDate(summary.scheduleStartDate, true)}`,
      '',
      formatSharedShiftLine('주간', summary.day),
      eveningLine,
      formatSharedShiftLine('야간', summary.night),
      formatSharedShiftLine('주대', summary.substituteDay),
      formatSharedShiftLine('야대', summary.substituteNight),
      '',
      '개인 알람·일정·메모는 유지하며, 적용 전에 현재 데이터를 자동으로 안전 백업합니다.',
    ];
    showDialog(
      '근무표와 시간 적용',
      lines.join('\n'),
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '적용',
          actionId: 'confirm',
          icon: 'checkmark',
          onPress: () => {
          if (!beginOperation('apply-settings')) return;
          void applySharedWorkSettings(preview)
            .then((result) => {
              if (result.success) {
                showDialog(
                  '근무표와 시간을 적용했습니다',
                  '개인 알람·일정·메모는 그대로 유지했습니다.',
                  undefined,
                  { tone: 'success' },
                );
                refreshBackupIfLoaded();
                return;
              }
              const message = {
                'not-ready': '근무표 불러오는 중 · 다시 시도',
                'invalid-file': '파일 내용 변경됨 · 파일 다시 선택',
                'backup-failed': '안전 백업을 만들지 못해 아무것도 변경하지 않았습니다.',
                'save-failed': '새 설정을 저장하지 못해 기존 설정을 유지했습니다.',
              }[result.reason];
              showDialog('근무표와 시간을 적용하지 못했습니다', message, undefined, {
                tone: 'danger',
              });
              if (result.reason === 'save-failed') refreshBackupIfLoaded();
            })
            .catch(() => {
              showDialog(
                '근무표와 시간을 적용하지 못했습니다',
                '예상하지 못한 오류가 발생하여 기존 설정을 유지했습니다.',
                undefined,
                { tone: 'danger' },
              );
            })
            .finally(finishOperation);
          },
        },
      ],
      { tone: 'warning' },
    );
  };

  const sendWorkSettings = async () => {
    if (!beginOperation('send-settings')) return;
    try {
      const fileName = await dataSettingsController.shareWorkSettingsFile(
        exportSharedWorkSettings(),
      );
      showDialog(
        '근무표와 시간 파일을 준비했습니다',
        `${fileName} 파일의 공유 화면을 닫았습니다. 앱을 선택한 경우에만 파일이 전달됩니다. V17 이상에서 받으면 근무 순서와 시간만 적용되고 개인 알람·일정·메모는 유지됩니다.`,
        undefined,
        { tone: 'success' },
      );
    } catch (error) {
      showDialog(
        '근무표와 시간 파일을 만들지 못했습니다',
        error instanceof Error ? error.message : '다시 시도',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      finishOperation();
    }
  };

  const requestSendWorkSettings = () => {
    showDialog(
      '받는 앱 버전 확인',
      'V17 이상에서 받으면 개인 알람을 유지합니다. V16 이하에서는 이전 공유 규칙으로 파일의 알람 값도 적용될 수 있으므로, 받는 사람이 V17 이상인지 확인한 뒤 보내야 합니다.',
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '파일 보내기',
          actionId: 'confirm',
          icon: 'share-outline',
          onPress: () => void sendWorkSettings(),
        },
      ],
      { tone: 'warning' },
    );
  };

  const receiveWorkSettings = async () => {
    if (!beginOperation('receive-settings')) return;
    try {
      const picked = await dataSettingsController.pickWorkSettingsFile();
      if (!picked) return;
      confirmWorkSettings(
        previewSharedWorkSettings(picked.contents),
        picked.fileName,
      );
    } catch (error) {
      showDialog(
        '근무표와 시간 파일을 읽지 못했습니다',
        error instanceof Error
          ? error.message
          : '알람표 근무 설정 파일인지 확인',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      finishOperation();
    }
  };

  const saveFullBackup = async () => {
    if (!beginOperation('export-backup')) return;
    try {
      const result = await dataSettingsController.exportBackupFile(exportData());
      if (result.storageStatus === 'cancelled') return;
      await recordBackupExportAttempt();
      showDialog(
        result.storageStatus === 'saved' ? '백업 저장 완료' : '백업 화면 종료',
        result.storageStatus === 'saved'
          ? `${result.fileName} 파일을 저장했습니다.`
          : `${result.fileName} 파일 준비 완료 · 선택한 앱 또는 저장 위치 확인 필요`,
      );
    } catch (error) {
      showDialog(
        '백업 파일을 만들지 못했습니다',
        error instanceof Error ? error.message : '다시 시도',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      finishOperation();
    }
  };

  const requestPlainBackup = () => {
    showDialog(
      '보호 없이 백업 저장',
      '근무표·설정·개인 메모가 보호 없이 저장됩니다. 안전한 위치에만 보관',
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '보호 없이 저장',
          actionId: 'save',
          icon: 'checkmark',
          style: 'destructive',
          onPress: () => void saveFullBackup(),
        },
      ],
      { tone: 'danger' },
    );
  };

  const submitEncryptedBackupPassword = async (password: string) => {
    const request = encryptedBackupRequest;
    if (!request) return;

    const operation: DataOperation =
      request.mode === 'create' ? 'export-encrypted-backup' : 'decrypt-backup';
    if (!beginOperation(operation)) {
      throw new Error('진행 중인 작업 종료 후 다시 시도');
    }

    try {
      if (request.mode === 'create') {
        const encrypted = await dataSettingsController.encryptBackupContents(
          exportData(),
          password,
        );
        const result = await dataSettingsController.exportBackupFile(encrypted, {
          encrypted: true,
        });
        if (result.storageStatus === 'cancelled') return;
        await recordBackupExportAttempt();
        setEncryptedBackupRequest(null);
        showDialog(
          result.storageStatus === 'saved' ? '암호화 백업 저장 완료' : '백업 화면 종료',
          result.storageStatus === 'saved'
            ? `${result.fileName} 파일 저장 완료 · 비밀번호 별도 보관 필요`
            : `${result.fileName} 파일 준비 완료 · 저장 여부 확인 및 비밀번호 별도 보관 필요`,
        );
        return;
      }

      const decrypted = await dataSettingsController.decryptBackupContents(
        request.contents,
        password,
      );
      const preview = previewImportData(decrypted);
      setEncryptedBackupRequest(null);
      confirmFullBackup(preview, request.fileName);
    } finally {
      finishOperation();
    }
  };

  const confirmFullBackup = (preview: AppDataImportPreview, fileName: string) => {
    const { summary } = preview;
    showDialog(
      dataCopy.restoreQuestion.text,
      [
        `파일 · ${safePickedFileName(fileName)}`,
        `생성 · ${formatBackupCreatedAt(preview.exportedAt)}`,
        '',
        `현재 · ${currentRestoreSummary}`,
        `백업 · ${summary.patternName} · 바꾼 날짜 ${summary.changedDateCount}개 · 메모 ${summary.noteCount}개 · ${summary.notificationsEnabled ? '알람 켜짐' : '알람 꺼짐'}`,
        `백업 적용일 · ${formatKoreanDate(summary.scheduleStartDate, true)}`,
        '',
        '복구 전에 현재 데이터를 안전 백업합니다.',
      ].join('\n'),
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '현재 데이터 덮어쓰기',
          actionId: 'confirm',
          icon: 'checkmark',
          onPress: () => {
            if (!beginOperation('import-backup')) return;
            void importData(preview)
              .then((success) => {
                showDialog(
                  success ? '백업을 불러왔습니다' : '백업을 불러오지 못했습니다',
                  success
                    ? '근무표와 설정을 백업 내용으로 변경했습니다.'
                    : '안전 백업을 만들지 못해 현재 데이터를 유지했습니다.',
                  undefined,
                  { tone: success ? 'success' : 'danger' },
                );
                if (success) refreshBackupIfLoaded();
              })
              .finally(finishOperation);
          },
        },
      ],
      { tone: 'warning' },
    );
  };

  const loadFullBackup = async () => {
    if (!beginOperation('select-backup')) return;
    try {
      const picked = await dataSettingsController.pickBackupFile();
      if (!picked) return;
      if (
        picked.encrypted ||
        dataSettingsController.isEncryptedBackupContents(picked.contents)
      ) {
        setEncryptedBackupRequest({
          mode: 'open',
          contents: picked.contents,
          fileName: picked.fileName,
        });
        return;
      }
      confirmFullBackup(previewImportData(picked.contents), picked.fileName);
    } catch (error) {
      showDialog(
        '백업 파일을 읽지 못했습니다',
        error instanceof Error
          ? error.message
          : '알람표 백업 파일인지 확인',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      finishOperation();
    }
  };

  const savePendingRestoreBackup = async (allowUnverified = false) => {
    if (!beginOperation('save-pending-backup')) return;
    try {
      const result = await retryPendingRestoreBackup(allowUnverified);
      await refreshBackup();
      if (result.status === 'unavailable') {
        showDialog(
          '대기 중인 백업이 없습니다',
          '이미 최근 안전 백업으로 저장되었습니다.',
        );
        return;
      }
      if (result.status === 'confirmation-required') {
        showDialog(
          '원본 백업 확인이 필요합니다',
          '복원 상태 확인 불가 · 원본 백업 보관 확인 필요',
          undefined,
          { tone: 'warning' },
        );
        return;
      }
      const success = result.status === 'saved';
      showDialog(
        success ? '복원 전 백업을 저장했습니다' : '복원 전 백업을 저장하지 못했습니다',
        success
          ? '복원하기 전 근무표를 최근 안전 백업으로 보관했습니다.'
          : '복원 전 백업 유지 · 저장 공간 확인 후 다시 시도',
        undefined,
        { tone: success ? 'success' : 'danger' },
      );
    } catch {
      showDialog(
        '복원 전 백업을 저장하지 못했습니다',
        '복원 전 백업 유지 · 다시 시도',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      finishOperation();
    }
  };

  const requestPendingRestoreBackupSave = () => {
    if (!pendingRestoreBackup) return;
    const requiresConfirmation =
      pendingRestoreBackup.recoveryState === 'source-matched' ||
      pendingRestoreBackup.recoveryState === 'diverged';
    if (!requiresConfirmation) {
      void savePendingRestoreBackup();
      return;
    }

    showDialog(
      '원본 백업 보관',
      '현재 근무표만으로 이전 복원이 끝났는지 확인할 수 없습니다. 현재 자료로 오인하지 않고, 복원을 시도하기 전에 보관한 원본을 최근 안전 백업으로 저장합니다.',
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '원본 백업 보관',
          actionId: 'save',
          icon: 'checkmark',
          onPress: () => void savePendingRestoreBackup(true),
        },
      ],
      { tone: 'warning' },
    );
  };

  const restoreAutomaticBackup = () => {
    if (!latestBackup) return;
    showDialog(
      '최근 안전 백업으로 되돌리시겠습니까?',
      [
        `생성 · ${formatBackupCreatedAt(latestBackup.exportedAt)}`,
        `근무 방식 · ${latestBackup.summary.patternName}`,
        `일정 적용 시작일 · ${formatKoreanDate(latestBackup.summary.scheduleStartDate, true)}`,
        `바꾼 날짜 ${latestBackup.summary.changedDateCount}개 · 메모 ${latestBackup.summary.noteCount}개`,
      ].join('\n'),
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '복구',
          actionId: 'confirm',
          icon: 'checkmark',
          onPress: () => {
            if (!beginOperation('restore-backup')) return;
            void restoreLatestBackup()
              .then((result) => {
                void refreshBackup();
                const presentation = getBackupRestorePresentation(result);
                const tone =
                  presentation.kind === 'success'
                    ? 'success'
                    : presentation.kind === 'partial'
                      ? 'warning'
                      : 'danger';
                if (presentation.retryPendingBackup) {
                  showDialog(
                    presentation.title,
                    presentation.message,
                    [
                        {
                          text: '나중에 하기',
                          actionId: 'cancel',
                          icon: 'close',
                          style: 'cancel',
                        },
                        {
                          text: '백업 저장 마무리하기',
                          actionId: 'save',
                          icon: 'checkmark',
                          onPress: () => void savePendingRestoreBackup(),
                        },
                    ],
                    { tone },
                  );
                } else {
                  showDialog(
                    presentation.title,
                    presentation.message,
                    undefined,
                    { tone },
                  );
                }
              })
              .catch(() => {
                showDialog(
                  '백업을 복구하지 못했습니다',
                  '처리 실패 · 현재 근무표와 복원 전 백업 확인',
                  undefined,
                  { tone: 'danger' },
                );
              })
              .finally(finishOperation);
          },
        },
      ],
      { tone: 'warning' },
    );
  };

  const reset = () => {
    showDialog(
      '모든 데이터 초기화',
      '직접 변경한 날짜와 메모, 근무 시간 등 앱 데이터를 지우고 실행 중인 타이머를 취소한 뒤 처음 설정 화면으로 돌아갑니다. 휴대폰 밖에 저장한 백업 파일은 지우지 않으며, 초기화 전에 자동으로 안전 백업합니다.',
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '초기화',
          actionId: 'delete',
          icon: 'trash-outline',
          style: 'destructive',
          onPress: () => {
            if (!beginOperation('reset-data')) return;
            void resetAllDataDetailed()
              .then((result) => {
                if (result.status === 'success') {
                  showDialog(
                    '앱 데이터를 초기화했습니다',
                    '오늘 근무 위치부터 다시 설정',
                    undefined,
                    { tone: 'success' },
                  );
                } else if (result.status === 'partial') {
                  showDialog(
                    '초기화 후 확인이 필요합니다',
                    '앱 데이터 초기화 완료 · 첫 설정 후 타이머·알람 상태 확인 필요',
                    undefined,
                    { tone: 'warning' },
                  );
                } else {
                  showDialog(
                    '초기화하지 못했습니다',
                    result.reason === 'backup-failed'
                      ? '안전 백업을 만들지 못해 현재 데이터를 유지했습니다.'
                      : '안전 백업 완료 · 데이터 삭제 실패 · 다시 시도',
                    undefined,
                    { tone: 'danger' },
                  );
                }
                if (result.dataReset) refreshBackupIfLoaded();
              })
              .catch(() => {
                showDialog(
                  '초기화 결과를 확인하지 못했습니다',
                  '앱 재실행 후 데이터·알람 상태 확인',
                  undefined,
                  { tone: 'danger' },
                );
              })
              .finally(finishOperation);
          },
        },
      ],
      { tone: 'danger' },
    );
  };

  const pendingBackupNeedsReview =
    pendingRestoreBackup?.recoveryState === 'source-matched' ||
    pendingRestoreBackup?.recoveryState === 'diverged';
  const pendingBackupSubtitle = pendingRestoreBackup
    ? `${pendingRestoreBackup.summary.patternName} · 바꾼 날짜 ${pendingRestoreBackup.summary.changedDateCount}개 · 메모 ${pendingRestoreBackup.summary.noteCount}개`
    : undefined;
  const latestBackupSubtitle = pendingRestoreBackup
    ? '보호 중인 백업 먼저 보관'
    : backupLookupStatus === 'loading'
      ? '자동 백업을 확인하고 있습니다.'
      : backupLookupStatus === 'error'
        ? '자동 백업 확인 실패 · 다시 확인'
        : latestBackup
      ? `${latestBackup.summary.patternName} · 바꾼 날짜 ${latestBackup.summary.changedDateCount}개 · 메모 ${latestBackup.summary.noteCount}개`
      : '복구할 자동 백업이 아직 없습니다.';
  const externalBackupReminderDue = isExternalBackupReminderDue(
    lastBackupExportAttemptAt,
  );

  return (
    <>
      <Stack.Screen options={{ title: '데이터 관리' }} />
      <Screen
        contentStyle={styles.screenContent}
        safeAreaEdges={['left', 'right']}>
        {pendingRestoreBackup || latestBackup ? (
          <StatusBanner
            actionLabel={pendingRestoreBackup ? '원본 보관' : '복구하기'}
            announceChanges={false}
            message={
              pendingRestoreBackup
                ? '복원 전 원본이 보호 중입니다. 덮어쓰기 전에 보관 여부를 정합니다.'
                : `${latestBackup!.summary.patternName} 근무표로 복구할 수 있습니다.`
            }
            onAction={
              pendingRestoreBackup
                ? requestPendingRestoreBackupSave
                : restoreAutomaticBackup
            }
            testID="recovery-available-banner"
            title={
              pendingRestoreBackup
                ? '복원 전 백업 미저장'
                : '자동 백업 복구 가능'
            }
            tone={pendingRestoreBackup ? 'warning' : 'info'}
          />
        ) : null}

        {externalBackupReminderDue ? (
          <StatusBanner
            announceChanges={false}
            message="암호화 백업 생성 후 저장 파일 열기 확인 필요"
            title="외부 백업 확인 권장"
            tone="neutral"
          />
        ) : null}

        <MenuGroup title="동료와 근무표 주고받기">
          <ListRow
            disabled={busy && activeOperation !== 'send-settings'}
            icon="share-outline"
            loading={activeOperation === 'send-settings'}
            onPress={requestSendWorkSettings}
            subtitle="근무 순서·시간만 · 알람·메모 제외"
            title="근무표와 시간 보내기"
          />
          <MenuDivider />
          <ListRow
            disabled={busy && !receivingSettings}
            icon="download-outline"
            loading={receivingSettings}
            onPress={() => void receiveWorkSettings()}
            subtitle="파일 확인 후 근무 순서·시간 적용"
            title="받은 근무표 적용"
          />
        </MenuGroup>

        <MenuGroup title="내 데이터 백업">
          <ListRow
            allowSubtitleWrapping
            disabled={busy && activeOperation !== 'export-encrypted-backup'}
            elementRef={encryptedBackupTriggerRef}
            icon="shield-outline"
            loading={activeOperation === 'export-encrypted-backup'}
            onPress={() => setEncryptedBackupRequest({ mode: 'create' })}
            subtitle={
              lastBackupExportAttemptAt
                ? `마지막 백업 화면 ${formatBackupCreatedAt(lastBackupExportAttemptAt)} · 저장 파일 확인 필요`
                : '암호화 파일로 보관'
            }
            title="암호화 백업"
          />
        </MenuGroup>

        <MenuGroup title="복구">
          <ListRow
            allowSubtitleWrapping
            disabled={
              backupLookupStatus !== 'ready' ||
              latestBackup === null ||
              pendingRestoreBackup !== null ||
              (busy && activeOperation !== 'restore-backup')
            }
            icon="arrow-undo-outline"
            loading={
              backupLookupStatus === 'loading' ||
              activeOperation === 'restore-backup'
            }
            onPress={latestBackup ? restoreAutomaticBackup : undefined}
            subtitle={latestBackupSubtitle}
            title="자동 백업으로 복구"
          />
          <MenuDivider />
          <ListRow
            disabled={busy && !loadingFullBackup}
            elementRef={backupFileRestoreTriggerRef}
            icon="download-outline"
            loading={loadingFullBackup}
            onPress={() => void loadFullBackup()}
            subtitle="백업 파일 선택"
            title="백업 파일로 복구"
          />
        </MenuGroup>

        <MenuGroup title="고급 관리">
          <ListRow
            expanded={advancedBackupExpanded}
            icon="options-outline"
            onPress={toggleAdvancedBackup}
            subtitle="원본 보호 · 일반 백업"
            title={advancedBackupExpanded ? '고급 관리 접기' : '고급 관리 보기'}
          />
          {advancedBackupExpanded ? (
            <>
              {pendingRestoreBackup ? (
                <>
                  <ListRow
                    disabled={busy && activeOperation !== 'save-pending-backup'}
                    icon="alert-circle-outline"
                    loading={activeOperation === 'save-pending-backup'}
                    onPress={requestPendingRestoreBackupSave}
                    subtitle={pendingBackupSubtitle}
                    title={
                      pendingBackupNeedsReview
                        ? '원본 백업 저장'
                        : '복원 전 백업 저장'
                    }
                  />
                </>
              ) : null}
              {backupLookupStatus === 'error' ? (
                <>
                  <MenuDivider />
                  <ListRow
                    disabled={busy}
                    icon="refresh-outline"
                    onPress={() => void refreshBackup()}
                    subtitle="자동 백업 다시 조회"
                    title="백업 다시 확인"
                  />
                </>
              ) : null}
              <MenuDivider />
              <ListRow
                allowSubtitleWrapping
                disabled={busy && activeOperation !== 'export-backup'}
                icon="alert-circle-outline"
                loading={activeOperation === 'export-backup'}
                onPress={requestPlainBackup}
                subtitle="암호화 안 됨 · 개인 메모 포함"
                title="일반 백업 만들기"
              />
            </>
          ) : null}
        </MenuGroup>

        <MenuGroup style={styles.dangerSection} title="위험 작업">
          <ListRow
            destructive
            disabled={busy && activeOperation !== 'reset-data'}
            icon="refresh-outline"
            loading={activeOperation === 'reset-data'}
            onPress={reset}
            subtitle="자동 백업 후 처음 설정"
            title="앱 데이터 초기화하기"
          />
        </MenuGroup>
      </Screen>
      <BackupPasswordDialog
        mode={
          (encryptedBackupRequest?.mode ?? null) as BackupPasswordDialogMode | null
        }
        onCancel={() => {
          if (!busy) setEncryptedBackupRequest(null);
        }}
        onSubmit={submitEncryptedBackupPassword}
        returnFocusRef={
          encryptedBackupRequest?.mode === 'create'
            ? encryptedBackupTriggerRef
            : backupFileRestoreTriggerRef
        }
      />
    </>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screenContent: {
      gap: spacing.large,
      paddingTop: spacing.small,
      paddingBottom: spacing.xxlarge,
    },
    dangerSection: {
      paddingLeft: spacing.small,
      borderLeftWidth: 3,
      borderLeftColor: palette.danger,
    },
  });
}
