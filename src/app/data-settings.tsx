import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAppDialog } from '@/components/app-dialog';
import {
  BackupPasswordDialog,
  type BackupPasswordDialogMode,
} from '@/components/backup-password-dialog';
import { getBackupRestorePresentation } from '@/components/backup-restore-feedback';
import { ListRow, MenuDivider, MenuGroup, Screen } from '@/components/ui-kit';
import { dataCopy } from '@/content/data-copy';
import type { AppDataImportPreview } from '@/services/app-data-service';
import { exportBackupFile, pickBackupFile } from '@/services/backup-file-service';
import {
  decryptBackupContents,
  encryptBackupContents,
  isEncryptedBackupContents,
} from '@/services/encrypted-backup-service';
import {
  pickWorkSettingsFile,
  shareWorkSettingsFile,
} from '@/services/work-settings-share-file-service';
import {
  doesWorkSettingsPreviewApplyEvening,
  type SharedShiftSettings,
  type WorkSettingsSharePreview,
} from '@/services/work-settings-share-service';
import {
  useAppStoreActions,
  type PendingRestoreBackupPreview,
} from '@/store/app-store';
import { formatCompactTime, formatKoreanDate } from '@/utils/date';

function formatAlarmLead(minutes: number): string {
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours}시간 전`
    : `${hours}시간 ${remainingMinutes}분 전`;
}

function formatSharedShiftLine(label: string, shift: SharedShiftSettings): string {
  if (shift.startMinutes === null || shift.endMinutes === null) return `${label} · 휴무`;
  const endPrefix = shift.endsNextDay ? '다음 날 ' : '';
  const alarm = shift.alarmEnabled
    ? `알람 ${formatAlarmLead(shift.alarmMinutesBefore)}`
    : '알람 끔';
  return `${label} ${formatCompactTime(shift.startMinutes)}~${endPrefix}${formatCompactTime(shift.endMinutes)} · ${alarm}`;
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

// 공유 API가 저장 완료를 알려 주지 않으므로 내보내기를 시도한 시각만 기록해요.
const LAST_BACKUP_EXPORT_ATTEMPT_AT_KEY =
  'alarmpyo:last-external-backup-export-attempt:v1';

export default function DataSettingsScreen() {
  const { showDialog } = useAppDialog();
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
  } = useAppStoreActions();
  const [activeOperation, setActiveOperation] = useState<DataOperation | null>(null);
  const busy = activeOperation !== null;
  const receivingSettings =
    activeOperation === 'receive-settings' || activeOperation === 'apply-settings';
  const loadingFullBackup =
    activeOperation === 'select-backup' || activeOperation === 'import-backup';
  const busyRef = useRef(false);
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
    try {
      const value = await AsyncStorage.getItem(LAST_BACKUP_EXPORT_ATTEMPT_AT_KEY);
      setLastBackupExportAttemptAt(
        value && Number.isFinite(Date.parse(value)) ? value : null,
      );
    } catch {
      setLastBackupExportAttemptAt(null);
    }
  }, []);

  const recordBackupExportAttempt = useCallback(async () => {
    const attemptedAt = new Date().toISOString();
    setLastBackupExportAttemptAt(attemptedAt);
    try {
      await AsyncStorage.setItem(LAST_BACKUP_EXPORT_ATTEMPT_AT_KEY, attemptedAt);
    } catch {
      // 내보내기 화면은 이미 닫혔으므로 보조 시각 저장 실패로 되돌리지 않아요.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (advancedBackupExpandedRef.current) void refreshBackup();
      void refreshBackupExportAttemptAt();
    }, [refreshBackup, refreshBackupExportAttemptAt]),
  );

  const toggleAdvancedBackup = useCallback(() => {
    const nextExpanded = !advancedBackupExpanded;
    advancedBackupExpandedRef.current = nextExpanded;
    setAdvancedBackupExpanded(nextExpanded);
    if (nextExpanded && !backupLookupStartedRef.current) {
      backupLookupStartedRef.current = true;
      void refreshBackup();
    }
  }, [advancedBackupExpanded, refreshBackup]);

  const refreshBackupIfLoaded = useCallback(() => {
    if (backupLookupStartedRef.current) void refreshBackup();
  }, [refreshBackup]);

  const confirmWorkSettings = (
    preview: WorkSettingsSharePreview,
    fileName: string,
  ) => {
    const { summary } = preview;
    const eveningLine = doesWorkSettingsPreviewApplyEvening(preview)
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
      '개인 일정과 메모는 유지하며, 적용 전에 현재 데이터를 자동으로 안전 백업합니다.',
    ];
    showDialog(
      '이 근무 설정을 적용하시겠습니까?',
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
                  '근무 설정을 적용했습니다',
                  '개인 일정과 메모는 그대로 유지했습니다.',
                  undefined,
                  { tone: 'success' },
                );
                refreshBackupIfLoaded();
                return;
              }
              const message = {
                'not-ready': '근무표를 불러오는 중입니다. 잠시 후 다시 시도해야 합니다.',
                'invalid-file': '파일 내용이 달라졌습니다. 파일을 다시 선택해야 합니다.',
                'backup-failed': '안전 백업을 만들지 못해 아무것도 변경하지 않았습니다.',
                'save-failed': '새 설정을 저장하지 못해 기존 설정을 유지했습니다.',
              }[result.reason];
              showDialog('근무 설정을 적용하지 못했습니다', message, undefined, {
                tone: 'danger',
              });
              if (result.reason === 'save-failed') refreshBackupIfLoaded();
            })
            .catch(() => {
              showDialog(
                '근무 설정을 적용하지 못했습니다',
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
      const fileName = await shareWorkSettingsFile(exportSharedWorkSettings());
      showDialog(
        '근무 설정 파일을 준비했습니다',
        `${fileName} 파일의 공유 화면을 닫았습니다. 앱을 선택한 경우에만 파일이 전달됩니다. 개인 일정과 메모는 포함하지 않았습니다.`,
        undefined,
        { tone: 'success' },
      );
    } catch (error) {
      showDialog(
        '근무 설정 파일을 만들지 못했습니다',
        error instanceof Error ? error.message : '잠시 후 다시 시도해야 합니다.',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      finishOperation();
    }
  };

  const receiveWorkSettings = async () => {
    if (!beginOperation('receive-settings')) return;
    try {
      const picked = await pickWorkSettingsFile();
      if (!picked) return;
      confirmWorkSettings(
        previewSharedWorkSettings(picked.contents),
        picked.fileName,
      );
    } catch (error) {
      showDialog(
        '근무 설정 파일을 읽지 못했습니다',
        error instanceof Error
          ? error.message
          : '알람표에서 만든 근무 설정 파일인지 확인해야 합니다.',
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
      const { fileName } = await exportBackupFile(exportData());
      await recordBackupExportAttempt();
      showDialog(
        '백업 내보내기 화면을 닫았습니다',
        `${fileName} 파일을 준비했지만 알람표는 저장 완료 여부를 확인할 수 없습니다. 앱이나 저장 위치를 선택했다면 해당 앱에서 파일을 확인해야 합니다.`,
      );
    } catch (error) {
      showDialog(
        '백업 파일을 만들지 못했습니다',
        error instanceof Error ? error.message : '잠시 후 다시 시도해야 합니다.',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      finishOperation();
    }
  };

  const requestPlainBackup = () => {
    showDialog(
      '암호화하지 않은 백업을 저장하시겠습니까?',
      '근무표와 설정, 개인 메모가 비밀번호 보호 없이 파일에 그대로 저장됩니다. 다른 사람에게 노출되지 않는 위치에만 보관해야 합니다.',
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
      throw new Error('진행 중인 작업이 끝난 뒤 다시 시도해야 합니다.');
    }

    try {
      if (request.mode === 'create') {
        const encrypted = await encryptBackupContents(exportData(), password);
        const { fileName } = await exportBackupFile(encrypted, { encrypted: true });
        await recordBackupExportAttempt();
        setEncryptedBackupRequest(null);
        showDialog(
          '암호화 백업 내보내기 화면을 닫았습니다',
          `${fileName} 파일을 준비했지만 알람표는 저장 완료 여부를 확인할 수 없습니다. 앱이나 저장 위치를 선택했다면 해당 앱에서 파일을 확인해야 합니다. 비밀번호는 알람표에 저장되지 않으므로 별도로 기억해야 합니다.`,
        );
        return;
      }

      const decrypted = await decryptBackupContents(request.contents, password);
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
        `근무 방식 · ${summary.patternName}`,
        `일정 적용 시작일 · ${formatKoreanDate(summary.scheduleStartDate, true)}`,
        `바꾼 날짜 ${summary.changedDateCount}개 · 메모 ${summary.noteCount}개`,
      ].join('\n'),
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '불러오기',
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
      const picked = await pickBackupFile();
      if (!picked) return;
      if (picked.encrypted || isEncryptedBackupContents(picked.contents)) {
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
          : '알람표에서 만든 백업 파일인지 확인해야 합니다.',
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
          '현재 근무표만으로 복원 완료 여부를 확인할 수 없어 자동으로 덮어쓰지 않았습니다. 다시 눌러 원본 백업 보관을 확인해야 합니다.',
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
          : '대기 중인 복원 전 백업은 지우지 않았습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
        undefined,
        { tone: success ? 'success' : 'danger' },
      );
    } catch {
      showDialog(
        '복원 전 백업을 저장하지 못했습니다',
        '대기 중인 복원 전 백업은 유지했습니다. 잠시 후 다시 시도해야 합니다.',
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
      '보호 중인 원본 백업을 보관하시겠습니까?',
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
                  '예상하지 못한 오류가 발생했습니다. 현재 근무표와 대기 중인 복원 전 백업을 확인해야 합니다.',
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
      '모든 데이터를 초기화하시겠습니까?',
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
                    '오늘 근무 위치부터 다시 설정해야 합니다.',
                    undefined,
                    { tone: 'success' },
                  );
                } else if (result.status === 'partial') {
                  showDialog(
                    '초기화 후 확인이 필요합니다',
                    '앱 데이터는 초기화했지만 타이머·수면 알림을 포함한 알람 예약이나 안전 백업 후속 처리는 끝나지 않았습니다. 처음 설정을 마친 뒤 타이머와 알람 화면에서 상태를 확인해야 합니다.',
                    undefined,
                    { tone: 'warning' },
                  );
                } else {
                  showDialog(
                    '초기화하지 못했습니다',
                    result.reason === 'backup-failed'
                      ? '안전 백업을 만들지 못해 현재 데이터를 유지했습니다.'
                      : '안전 백업은 만들었지만 현재 데이터를 지우지 못했습니다. 다시 시도해야 합니다.',
                    undefined,
                    { tone: 'danger' },
                  );
                }
                if (result.dataReset) refreshBackupIfLoaded();
              })
              .catch(() => {
                showDialog(
                  '초기화 결과를 확인하지 못했습니다',
                  '앱을 다시 연 뒤 데이터와 알람 상태를 확인해야 합니다.',
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
    ? '보호 중인 백업을 먼저 보관해야 합니다.'
    : backupLookupStatus === 'loading'
      ? '자동 백업을 확인하고 있습니다.'
      : backupLookupStatus === 'error'
        ? '자동 백업을 확인하지 못했습니다. 다시 확인해야 합니다.'
        : latestBackup
      ? `${latestBackup.summary.patternName} · 바꾼 날짜 ${latestBackup.summary.changedDateCount}개 · 메모 ${latestBackup.summary.noteCount}개`
      : '복구할 자동 백업이 아직 없습니다.';

  return (
    <>
      <Stack.Screen options={{ title: '데이터 관리' }} />
      <Screen safeAreaEdges={['left', 'right']}>
        <MenuGroup title="근무 설정 공유">
          <ListRow
            disabled={busy && activeOperation !== 'send-settings'}
            icon="share-outline"
            loading={activeOperation === 'send-settings'}
            onPress={() => void sendWorkSettings()}
            subtitle="근무 방식·시간·알람을 파일로 공유합니다."
            title="설정 보내기"
          />
          <MenuDivider />
          <ListRow
            disabled={busy && !receivingSettings}
            icon="download-outline"
            loading={receivingSettings}
            onPress={() => void receiveWorkSettings()}
            subtitle="받은 파일을 확인한 뒤 적용합니다."
            title="설정 받기"
          />
          <MenuDivider />
          <ListRow
            icon="book-outline"
            onPress={() => router.push('/pattern-library' as never)}
            subtitle="근무 순서만 담은 파일을 가져오거나 공유합니다."
            title="근무 패턴 보관함"
          />
        </MenuGroup>

        <MenuGroup title={dataCopy.backupSection.text}>
          <ListRow
            allowSubtitleWrapping
            disabled={busy && activeOperation !== 'export-encrypted-backup'}
            icon="shield-outline"
            loading={activeOperation === 'export-encrypted-backup'}
            onPress={() => setEncryptedBackupRequest({ mode: 'create' })}
            subtitle={
              lastBackupExportAttemptAt
                ? `마지막 내보내기 시도 ${formatBackupCreatedAt(lastBackupExportAttemptAt)} · 저장 여부는 공유 화면에서 확인합니다.`
                : '비밀번호로 보호한 백업 파일을 준비합니다. 공유 화면에서 저장해야 앱 밖에 남습니다.'
            }
            title="암호화 백업 만들기"
          />
          <MenuDivider />
          <ListRow
            disabled={busy && !loadingFullBackup}
            icon="download-outline"
            loading={loadingFullBackup}
            onPress={() => void loadFullBackup()}
            subtitle="알람표 백업 파일을 확인한 뒤 안전하게 복구합니다."
            title="백업 파일 복구하기"
          />
        </MenuGroup>

        <MenuGroup title="고급 관리">
          <ListRow
            expanded={advancedBackupExpanded}
            icon="options-outline"
            onPress={toggleAdvancedBackup}
            subtitle="기기 안의 자동 백업과 보호되지 않은 백업을 관리합니다."
            title={advancedBackupExpanded ? '고급 관리 접기' : '고급 관리 보기'}
          />
          {advancedBackupExpanded ? (
            <>
              <MenuDivider />
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
                subtitle={`앱을 삭제하면 함께 지워집니다 · ${latestBackupSubtitle}`}
                title="기기 안의 최근 백업 복구하기"
              />
              {pendingRestoreBackup ? (
                <>
                  <MenuDivider />
                  <ListRow
                    disabled={busy && activeOperation !== 'save-pending-backup'}
                    icon="alert-circle-outline"
                    loading={activeOperation === 'save-pending-backup'}
                    onPress={requestPendingRestoreBackupSave}
                    subtitle={pendingBackupSubtitle}
                    title={
                      pendingBackupNeedsReview
                        ? '보호 중인 원본 백업 보관하기'
                        : '복원 전 백업 저장하기'
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
                    subtitle="저장공간 상태를 확인한 뒤 기기 백업을 다시 조회합니다."
                    title="기기 백업 다시 확인하기"
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
                subtitle="개인 메모가 보호되지 않은 채 저장됩니다. 다른 방식이 꼭 필요할 때만 사용해야 합니다."
                title="보호되지 않은 백업 만들기"
              />
            </>
          ) : null}
        </MenuGroup>

        <MenuGroup title="위험 작업">
          <ListRow
            destructive
            disabled={busy && activeOperation !== 'reset-data'}
            icon="refresh-outline"
            loading={activeOperation === 'reset-data'}
            onPress={reset}
            subtitle="안전 백업 후 처음 설정으로 돌아갑니다."
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
      />
    </>
  );
}
