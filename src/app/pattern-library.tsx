import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import {
  AppButton,
  AppText,
  MenuDivider,
  MenuGroup,
  Screen,
} from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner, Surface } from '@/design-system';
import {
  formatPatternSequence,
  formatPatternSource,
} from '@/features/pattern-library/pattern-library-model';
import {
  isPatternIntegrityError,
  patternImportErrorCopy,
  usePatternLibraryController,
  type ValidatedPatternDescriptor,
} from '@/features/pattern-library/pattern-library-controller';
import { PatternVaultCard } from '@/features/pattern-library/pattern-vault-card';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PatternVaultEntry } from '@/models/app-data';
import {
  isPatternVaultEntryApplied,
} from '@/services/pattern-vault-service';
import { useAppStore } from '@/store/app-store';
import { formatKoreanDate } from '@/utils/date';

type BusyOperation = 'rollback' | `delete:${string}`;

function formatPatternAppliedAt(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '적용 시간 확인 필요';
  return timestamp.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PatternLibraryScreen() {
  const { showDialog } = useAppDialog();
  const {
    data,
    deletePattern,
    importValidatedPattern,
    rollbackLastPatternApplication,
  } = useAppStore();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackActions = width <= 320 || fontScale >= 1.5;
  const [busyOperation, setBusyOperation] = useState<BusyOperation | null>(null);
  const {
    busyOperation: runtimeBusyOperation,
    importPatternFile: pickAndImportPatternFile,
    notifySuccess,
    officialLoading,
    officialResults,
    refreshOfficialPatterns,
    saveOfficialPattern: saveOfficialPatternThroughController,
    sharePattern: sharePatternThroughController,
  } = usePatternLibraryController({ importValidatedPattern });
  const anyBusyOperation = busyOperation ?? runtimeBusyOperation;

  const saveOfficialPattern = async (descriptor: ValidatedPatternDescriptor) => {
    if (anyBusyOperation) return;
    const result = await saveOfficialPatternThroughController(descriptor);
    if (!result) return;
    if (result.status === 'saved' || result.status === 'unchanged') {
      showDialog(
        '보관 완료',
        '근무표에는 아직 적용되지 않았습니다.',
        undefined,
        { tone: 'success' },
      );
      return;
    }
    showDialog(
      '보관 실패',
      result.reason === 'vault-full'
        ? '보관함에서 사용하지 않는 패턴 정리'
        : '저장 공간을 확인한 뒤 다시 시도',
      undefined,
      { tone: 'danger' },
    );
  };

  const importPatternFile = async () => {
    if (anyBusyOperation) return;
    const outcome = await pickAndImportPatternFile();
    if (outcome.status === 'cancelled') return;
    if (outcome.status === 'completed') {
      const { fileName, result } = outcome;
      if (result.status === 'saved' || result.status === 'unchanged') {
        showDialog(
          '보관 완료',
          `${fileName} · 근무표에는 아직 적용되지 않았습니다.`,
          undefined,
          { tone: 'success' },
        );
        return;
      }
      const reason =
        result.reason === 'source-conflict'
          ? '같은 ID의 다른 패턴이 이미 있음'
          : result.reason === 'vault-full'
            ? '보관함에서 사용하지 않는 패턴 정리'
            : '저장 공간 확인';
      showDialog('보관 실패', reason, undefined, {
        tone: 'danger',
      });
      return;
    }
    if (outcome.status === 'error') {
      const copy = patternImportErrorCopy(outcome.error);
      showDialog(copy.title, copy.message, undefined, { tone: 'danger' });
    }
  };

  const sharePattern = async (entry: PatternVaultEntry) => {
    if (anyBusyOperation) return;
    const outcome = await sharePatternThroughController(entry);
    if (outcome.status === 'completed') {
      showDialog(
        '공유 화면 종료',
        `${outcome.fileName} · 선택한 앱 또는 저장 위치 확인`,
      );
      return;
    }
    if (outcome.status === 'error') {
      const copy = patternImportErrorCopy(outcome.error);
      showDialog('공유 실패', copy.message, undefined, {
        tone: 'danger',
      });
    }
  };

  const confirmDeletePattern = (entry: PatternVaultEntry) => {
    showDialog(
      '보관한 패턴을 삭제하시겠습니까?',
      `${entry.name} 삭제 · 현재 근무표는 유지`,
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '패턴 삭제',
          actionId: 'delete',
          icon: 'trash-outline',
          style: 'destructive',
          onPress: () => {
            const operation: BusyOperation = `delete:${entry.id}`;
            setBusyOperation(operation);
            void deletePattern(entry.id)
              .then((result) => {
                if (result.status === 'deleted' || result.status === 'not-found') return;
                showDialog(
                  '삭제 실패',
                  result.reason === 'pattern-in-use'
                    ? '사용 중인 패턴 또는 복구 이력에 필요한 패턴'
                    : '저장 공간을 확인한 뒤 다시 시도',
                  undefined,
                  { tone: 'danger' },
                );
              })
              .finally(() => setBusyOperation(null));
          },
        },
      ],
      { tone: 'danger' },
    );
  };

  const rollback = async () => {
    if (anyBusyOperation) return;
    setBusyOperation('rollback');
    try {
      const result = await rollbackLastPatternApplication();
      if (result.status === 'success') {
        void notifySuccess();
        showDialog(
          '되돌리기 완료',
          '직전 패턴과 직접 수정을 복구했습니다.',
          undefined,
          { tone: 'success' },
        );
        return;
      }
      if (result.status === 'failure' && result.reason === 'rollback-failed') {
        showDialog(
          '복구 상태 확인',
          result.rolledBack
            ? '근무표 복구 완료 · 알람 동기화 미확인. 알람 설정에서 예약 상태 확인.'
            : '근무표 복구 실패 · 현재 근무표와 알람 예약을 바로 확인.',
          [
            { text: '닫기', actionId: 'cancel', icon: 'close', style: 'cancel' },
            {
              text: '알람 설정 열기',
              actionId: 'open-settings',
              icon: 'settings-outline',
              onPress: () => router.push('/alarm-settings' as never),
            },
          ],
          { tone: 'danger' },
        );
        return;
      }
      showDialog(
        '되돌리기 실패',
        result.status === 'nothing-to-rollback'
          ? '되돌릴 적용 이력 없음'
          : result.reason === 'history-conflict'
            ? '적용 뒤 근무 방식이 다시 변경됨'
            : result.reason === 'sync-failed' && result.rolledBack
              ? '알람 예약 실패 · 현재 근무표와 알람 유지'
            : result.rolledBack
              ? '현재 근무표 유지'
              : '현재 근무표 확인',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      setBusyOperation(null);
    }
  };

  const history = data.patternHistory.slice(0, 10);
  return (
    <>
      <Stack.Screen options={{ title: '패턴 보관함' }} />
      <Screen contentStyle={styles.screen} safeAreaEdges={['left', 'right']}>
        <View style={[styles.topActions, stackActions && styles.topActionsStacked]}>
          <AppButton
            disabled={anyBusyOperation !== null}
            icon="add"
            label="내 패턴 만들기"
            onPress={() => router.push('/pattern-library-edit' as never)}
            style={styles.topAction}
          />
          <AppButton
            disabled={anyBusyOperation !== null}
            icon="download-outline"
            label="파일 가져오기"
            loading={runtimeBusyOperation === 'file-import'}
            onPress={() => void importPatternFile()}
            style={styles.topAction}
            variant="secondary"
          />
        </View>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingCopy}>
            <AppText accessibilityRole="header" variant="heading">
              공식 패턴
            </AppText>
          </View>
          <AppButton
            disabled={officialLoading}
            icon="refresh-outline"
            label="새로고침"
            loading={officialLoading}
            onPress={() => void refreshOfficialPatterns('manual')}
            size="compact"
            variant="secondary"
          />
        </View>

        {officialResults === null && officialLoading ? (
          <StatusBanner
            message="파일 서명 확인 중"
            title="공식 패턴 확인 중"
            tone="neutral"
          />
        ) : null}

        {officialResults?.map((result) => {
          const stored = data.patternVault.find((entry) => entry.id === result.id);
          if (result.status === 'error') {
            const integrityFailure = isPatternIntegrityError(result.error);
            return (
              <StatusBanner
                key={result.id}
                message={
                  integrityFailure
                    ? `${result.error.message} 파일을 열지 않았습니다.`
                    : result.error.message
                }
                title={integrityFailure ? '공식 패턴 확인 실패' : `${result.id} 조회 실패`}
                tone="danger"
              />
            );
          }
          const alreadyStored =
            stored?.source === 'official' &&
            stored.sourceVersion === result.pattern.sourceVersion &&
            stored.shiftCodes.join('\u0000') === result.pattern.shiftCodes.join('\u0000');
          return (
            <Surface key={result.id} style={styles.officialCard}>
              <View style={styles.officialCopy}>
                <View style={styles.verifiedRow}>
                  <AppText tone="secondary" variant="caption">
                    서명 확인
                  </AppText>
                  {alreadyStored ? (
                    <View style={styles.storedBadge}>
                      <AppText variant="caption">보관됨</AppText>
                    </View>
                  ) : null}
                </View>
                <AppText accessibilityRole="header" variant="heading">
                  {result.pattern.name}
                </AppText>
                <AppText tone="secondary" variant="caption">
                  {result.pattern.shiftCodes.length}일 주기 · {formatPatternSequence(result.pattern.shiftCodes)}
                </AppText>
              </View>
              {!alreadyStored ? (
                <AppButton
                  disabled={anyBusyOperation !== null}
                  icon="shield-outline"
                  label="보관"
                  loading={runtimeBusyOperation === `official-save:${result.id}`}
                  onPress={() => void saveOfficialPattern(result.pattern)}
                  variant="secondary"
                />
              ) : null}
            </Surface>
          );
        })}

        <View style={styles.sectionHeadingCopy}>
          <AppText accessibilityRole="header" variant="heading">
            보관함
          </AppText>
          <AppText tone="secondary" variant="caption">
            적용 전 달력 비교
          </AppText>
        </View>
        {data.patternVault.length === 0 ? (
          <StatusBanner
            message="패턴 만들기 또는 파일 가져오기"
            title="저장된 패턴 없음"
            tone="neutral"
          />
        ) : (
          data.patternVault.map((entry) => (
            <PatternVaultCard
              active={isPatternVaultEntryApplied(data, entry)}
              busy={anyBusyOperation !== null}
              entry={entry}
              key={entry.id}
              onApply={() =>
                router.push({ pathname: '/pattern-library-apply', params: { id: entry.id } } as never)
              }
              onDelete={() => confirmDeletePattern(entry)}
              onEdit={
                entry.source === 'user'
                  ? () =>
                      router.push({ pathname: '/pattern-library-edit', params: { id: entry.id } } as never)
                  : undefined
              }
              onShare={entry.source === 'user' ? () => void sharePattern(entry) : undefined}
            />
          ))
        )}

        <MenuGroup title="최근 적용">
          {history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <AppText tone="secondary" variant="body">
                적용 이력 없음
              </AppText>
            </View>
          ) : (
            history.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <MenuDivider /> : null}
                <View
                  accessibilityLabel={`${item.nextPattern.name}. ${formatPatternAppliedAt(item.appliedAt)}에 적용. ${formatKoreanDate(item.nextPattern.scheduleStartDate ?? item.nextPattern.anchorDate, true)}부터. 직접 수정 ${item.overrideDateKeys.length}개 제거.`}
                  accessible
                  style={styles.historyRow}>
                  <View style={styles.historyCopy}>
                    <AppText variant="label">{item.nextPattern.name}</AppText>
                    <AppText tone="secondary" variant="caption">
                      {formatPatternSource(item.source)} · {formatPatternAppliedAt(item.appliedAt)}
                      {'\n'}{formatKoreanDate(item.nextPattern.scheduleStartDate ?? item.nextPattern.anchorDate)}부터 · 직접 수정 {item.overrideDateKeys.length}개 제거
                    </AppText>
                  </View>
                </View>
              </View>
            ))
          )}
        </MenuGroup>

        <AppButton
          accessibilityHint="직전 패턴과 직접 수정을 복구합니다."
          disabled={history.length === 0 || anyBusyOperation !== null}
          icon="arrow-undo-outline"
          label="직전 적용 되돌리기"
          loading={busyOperation === 'rollback'}
          onPress={() => void rollback()}
          variant="secondary"
        />
      </Screen>
    </>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: {
      gap: spacing.xlarge,
      paddingTop: spacing.small,
    },
    topActions: {
      flexDirection: 'row',
      gap: spacing.small,
    },
    topActionsStacked: {
      flexDirection: 'column',
    },
    topAction: {
      minWidth: 0,
      flex: 1,
    },
    sectionHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    sectionHeadingCopy: {
      minWidth: 0,
      flex: 1,
      gap: spacing.tiny,
    },
    officialCard: {
      gap: spacing.large,
      padding: spacing.large,
    },
    officialCopy: {
      gap: spacing.tiny,
    },
    verifiedRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.small,
    },
    storedBadge: {
      minHeight: 26,
      justifyContent: 'center',
      paddingHorizontal: spacing.small,
      borderWidth: 1,
      borderColor: palette.selectionBorder,
      borderRadius: 999,
      backgroundColor: palette.selectionSurface,
    },
    emptyHistory: {
      padding: spacing.medium,
    },
    historyRow: {
      minHeight: 64,
      justifyContent: 'center',
      paddingHorizontal: spacing.large,
      paddingVertical: spacing.medium,
    },
    historyCopy: {
      minWidth: 0,
      gap: spacing.tiny,
    },
  });
}
