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
        '공식 패턴을 보관했습니다',
        '근무표에는 아직 적용하지 않았습니다. 보관함에서 적용 전 비교를 확인할 수 있습니다.',
        undefined,
        { tone: 'success' },
      );
      return;
    }
    showDialog(
      '공식 패턴을 보관하지 못했습니다',
      result.reason === 'vault-full'
        ? '보관함에서 사용하지 않는 패턴을 정리해야 합니다.'
        : '현재 자료는 유지했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
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
          '패턴 파일을 보관했습니다',
          `${fileName} 파일을 검증했습니다. 근무표에는 아직 적용하지 않았습니다.`,
          undefined,
          { tone: 'success' },
        );
        return;
      }
      const reason =
        result.reason === 'source-conflict'
          ? '같은 ID의 다른 출처 패턴이 있어 덮어쓰지 않았습니다.'
          : result.reason === 'vault-full'
            ? '보관함에서 사용하지 않는 패턴을 정리해야 합니다.'
            : '현재 자료는 유지했습니다. 저장 공간을 확인해야 합니다.';
      showDialog('패턴 파일을 보관하지 못했습니다', reason, undefined, {
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
        '패턴 공유 화면을 닫았습니다',
        `${outcome.fileName} 파일을 준비했습니다. 선택한 앱이나 저장 위치에서 파일을 확인해야 합니다.`,
      );
      return;
    }
    if (outcome.status === 'error') {
      const copy = patternImportErrorCopy(outcome.error);
      showDialog('패턴 파일을 보내지 못했습니다', copy.message, undefined, {
        tone: 'danger',
      });
    }
  };

  const confirmDeletePattern = (entry: PatternVaultEntry) => {
    showDialog(
      '보관한 패턴을 삭제하시겠습니까?',
      `${entry.name} 패턴을 보관함에서 삭제합니다. 현재 근무표는 변경하지 않습니다.`,
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
                  '패턴을 삭제하지 못했습니다',
                  result.reason === 'pattern-in-use'
                    ? '현재 사용 중이거나 적용 이력에 필요한 패턴입니다. 다른 패턴을 적용하고 해당 이력을 되돌린 뒤 삭제해야 합니다.'
                    : '저장 공간을 확인한 뒤 다시 시도해야 합니다.',
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
          '이전 패턴으로 되돌렸습니다',
          '직전 적용을 취소하고 정리했던 직접 수정도 복구했습니다.',
          undefined,
          { tone: 'success' },
        );
        return;
      }
      if (result.status === 'failure' && result.reason === 'rollback-failed') {
        showDialog(
          '근무표 복구 상태를 확인해야 합니다',
          result.rolledBack
            ? '현재 근무 자료는 복구했지만 알람 동기화 결과를 확인하지 못했습니다. 알람 설정에서 예약 상태를 확인하고 다시 동기화해야 합니다.'
            : '현재 근무 자료 복구에 실패했습니다. 근무표를 즉시 확인하고 알람 설정에서 예약 상태를 다시 동기화해야 합니다.',
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
        '이전 패턴으로 되돌리지 못했습니다',
        result.status === 'nothing-to-rollback'
          ? '되돌릴 패턴 적용 이력이 없습니다.'
          : result.reason === 'history-conflict'
            ? '적용 후 근무 방식이 다시 바뀌어 자동으로 되돌릴 수 없습니다.'
            : result.reason === 'sync-failed' && result.rolledBack
              ? '이전 패턴의 알람 예약에 실패해 현재 근무표와 알람 상태를 유지했습니다.'
            : result.rolledBack
              ? '문제가 발생해 현재 근무표를 유지했습니다.'
              : '현재 근무표를 확인해야 합니다.',
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
      <Stack.Screen options={{ title: '근무 패턴 보관함' }} />
      <Screen contentStyle={styles.screen} safeAreaEdges={['left', 'right']}>
        <StatusBanner
          message="패턴은 근무 순서만 보관합니다. 가져온 뒤 적용일이 속한 달력에서 변경 내용을 먼저 비교합니다."
          title="가져오기와 적용 분리"
          tone="info"
        />

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
            <AppText tone="secondary" variant="caption">
              이 화면을 열거나 새로고침할 때만 조회합니다.
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
            message="서명과 파일 내용을 확인하고 있습니다."
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
                    ? `${result.error.message} 사용자 패턴으로 바꾸어 열지 않았습니다.`
                    : result.error.message
                }
                title={integrityFailure ? '공식 서명 검증 실패' : `${result.id} 조회 실패`}
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
                    전자서명 검증 완료
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
                  label="검증본 보관"
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
            보관한 패턴
          </AppText>
          <AppText tone="secondary" variant="caption">
            보관한 패턴을 선택한 뒤 달력에서 변경 내용을 비교합니다.
          </AppText>
        </View>
        {data.patternVault.length === 0 ? (
          <StatusBanner
            message="공식 패턴을 검증해 보관하거나 내 패턴을 만들 수 있습니다."
            title="보관한 패턴 없음"
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

        <MenuGroup title="최근 적용 이력 10개">
          {history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <AppText tone="secondary" variant="body">
                아직 패턴 적용 이력이 없습니다.
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
          accessibilityHint="직전 패턴 적용과 그때 제거한 직접 수정을 복구합니다."
          disabled={history.length === 0 || anyBusyOperation !== null}
          icon="arrow-undo-outline"
          label="마지막 패턴 적용 되돌리기"
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
