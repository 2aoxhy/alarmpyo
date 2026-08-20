import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { DatePickerField } from '@/components/date-picker-field';
import { SelectionPill } from '@/components/selection-controls';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { PageHeader, StatusBanner, Surface } from '@/design-system';
import {
  triggerNotificationFeedback,
  triggerSelectionFeedback,
} from '@/features/feedback/feedback-controller';
import { PatternApplicationPreview } from '@/features/pattern-library/pattern-application-preview';
import {
  adaptPatternApplicationPreviewRows,
  buildPatternOverridePolicy,
  type OverrideResolutionMode,
} from '@/features/pattern-library/pattern-library-model';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useAppStore } from '@/store/app-store';
import { toDateKey } from '@/utils/date';

const POLICY_OPTIONS: readonly {
  mode: OverrideResolutionMode;
  title: string;
  description: string;
}[] = [
  {
    mode: 'preserve',
    title: '모두 유지',
    description: '비교 범위의 직접 근무와 시간 수정을 그대로 둡니다.',
  },
  {
    mode: 'remove-all',
    title: '모두 제거',
    description: '비교 범위의 직접 근무와 시간 수정을 제거합니다.',
  },
  {
    mode: 'select',
    title: '날짜별 선택',
    description: '달력에서 선택한 날짜의 직접 수정을 유지합니다.',
  },
] as const;

export default function PatternLibraryApplyScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { showDialog } = useAppDialog();
  const { applyPatternFromVault, data, previewPatternApplication } = useAppStore();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width <= 360 || fontScale >= 1.3;
  const [today] = useState(() => toDateKey(new Date()));
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [mode, setMode] = useState<OverrideResolutionMode>('preserve');
  const [selectedPreservedDates, setSelectedPreservedDates] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [applying, setApplying] = useState(false);
  const entry = data.patternVault.find((item) => item.id === id);

  const basePreviewResult = useMemo(
    () =>
      id
        ? previewPatternApplication({
            patternId: id,
            effectiveDate,
            overridePolicy: { mode: 'preserve' },
          })
        : { status: 'failure' as const, reason: 'pattern-not-found' as const },
    [effectiveDate, id, previewPatternApplication],
  );
  const directOverrideDateKeys = useMemo(
    () =>
      basePreviewResult.status === 'ready'
        ? basePreviewResult.preview.directOverrideDateKeys
        : [],
    [basePreviewResult],
  );
  const defaultPreservedDates = useMemo(
    () => new Set(directOverrideDateKeys),
    [directOverrideDateKeys],
  );
  const effectiveSelectedDates = selectionInitialized
    ? selectedPreservedDates
    : defaultPreservedDates;
  const overridePolicy = useMemo(
    () =>
      buildPatternOverridePolicy({
        directOverrideDateKeys,
        mode,
        preservedDateKeys: effectiveSelectedDates,
      }),
    [directOverrideDateKeys, effectiveSelectedDates, mode],
  );
  const previewResult = useMemo(
    () =>
      mode === 'preserve'
        ? basePreviewResult
        : id
        ? previewPatternApplication({ patternId: id, effectiveDate, overridePolicy })
        : { status: 'failure' as const, reason: 'pattern-not-found' as const },
    [basePreviewResult, effectiveDate, id, mode, overridePolicy, previewPatternApplication],
  );
  const preview = previewResult.status === 'ready' ? previewResult.preview : null;
  const activePolicy = POLICY_OPTIONS.find((option) => option.mode === mode)!;
  const rows = useMemo(
    () => adaptPatternApplicationPreviewRows(data.shiftTypes, preview?.rows ?? []),
    [data.shiftTypes, preview?.rows],
  );

  const changeMode = (nextMode: OverrideResolutionMode) => {
    if (nextMode === 'select' && !selectionInitialized) {
      setSelectedPreservedDates(new Set(directOverrideDateKeys));
      setSelectionInitialized(true);
    }
    setMode(nextMode);
    void triggerSelectionFeedback();
  };

  const togglePreservedDate = (dateKey: string) => {
    setSelectionInitialized(true);
    setSelectedPreservedDates((current) => {
      const next = new Set(current);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const applyPattern = async () => {
    if (!id || !preview || applying) return;
    setApplying(true);
    try {
      const result = await applyPatternFromVault({
        patternId: id,
        effectiveDate,
        overridePolicy,
      });
      if (result.status === 'success') {
        void triggerNotificationFeedback('success');
        showDialog(
          '패턴을 적용했습니다',
          result.clearedOverrideDateKeys.length > 0
            ? `직접 수정 ${result.clearedOverrideDateKeys.length}개를 정리했습니다. 근무 시간, 알람, 권한 설정은 유지했습니다.`
            : '근무 시간, 알람, 권한 설정을 유지하고 순서만 적용했습니다.',
          [
            {
              text: '확인',
              actionId: 'confirm',
              icon: 'checkmark',
              onPress: () => router.replace('/pattern-library' as never),
            },
          ],
          { tone: 'success' },
        );
        return;
      }
      if (result.reason === 'rollback-failed') {
        showDialog(
          '근무표 복구 상태를 확인해야 합니다',
          result.rolledBack
            ? '이전 근무 자료는 복구했지만 알람 동기화 결과를 확인하지 못했습니다. 알람 설정에서 예약 상태를 확인하고 다시 동기화해야 합니다.'
            : '이전 근무 자료 복구에 실패했습니다. 현재 근무표를 즉시 확인하고 알람 설정에서 예약 상태를 다시 동기화해야 합니다.',
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
      const message =
        result.reason === 'backup-failed'
          ? '안전 백업을 만들지 못해 현재 근무표를 유지했습니다.'
          : result.reason === 'sync-failed' && result.rolledBack
            ? '새 패턴의 알람 예약에 실패해 이전 근무표와 알람 상태로 되돌렸습니다.'
          : result.rolledBack
            ? '적용 중 문제가 발생해 이전 근무표로 되돌렸습니다.'
            : '적용 결과를 확인하지 못했습니다. 현재 근무표를 확인해야 합니다.';
      showDialog('패턴을 적용하지 못했습니다', message, undefined, {
        tone: 'danger',
      });
    } finally {
      setApplying(false);
    }
  };

  if (!entry || !preview) {
    return (
      <Screen>
        <PageHeader title="패턴 적용" />
        <StatusBanner
          actionLabel="보관함으로 이동"
          message="적용할 패턴과 날짜를 확인해야 합니다."
          onAction={() => router.replace('/pattern-library' as never)}
          title="패턴 확인 필요"
          tone="warning"
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '패턴 적용' }} />
      <Screen
        contentStyle={styles.screen}
        footer={
          <AppButton
            disabled={applying || preview === null}
            icon="checkmark"
            label={applying ? '적용 중' : '이 패턴 적용'}
            loading={applying}
            onPress={() => void applyPattern()}
          />
        }
        safeAreaEdges={['left', 'right']}>
        <PageHeader
          subtitle="적용일이 포함된 달력에서 현재 일정과 적용 후 일정을 비교합니다."
          title="적용 전 비교"
        />
        <View style={styles.intro}>
          <AppText accessibilityRole="header" variant="heading">
            {entry.name}
          </AppText>
          <AppText tone="secondary" variant="body">
            적용일부터 다음 달력 범위의 변경 내용을 확인합니다.
          </AppText>
        </View>

        <StatusBanner
          message="외부 패턴은 근무 순서만 변경합니다. 근무 시간, 알람, 알림 권한과 기타 앱 설정은 변경하지 않습니다."
          title="설정 보호"
          tone="info"
        />

        <Surface style={styles.sectionCard} tone="muted">
          <AppText accessibilityRole="header" variant="label">
            적용일
          </AppText>
          <DatePickerField
            accessibilityLabel="패턴 적용일"
            onChange={(dateKey) => {
              setEffectiveDate(dateKey);
              setSelectionInitialized(false);
              setSelectedPreservedDates(new Set());
            }}
            placeholder="YYYY-MM-DD"
            today={today}
            value={effectiveDate}
          />
        </Surface>

        <View style={styles.policySection}>
          <AppText accessibilityRole="header" variant="heading">
            직접 수정 처리
          </AppText>
          <View
            accessibilityLabel="직접 수정 처리 방식"
            accessibilityRole="radiogroup"
            style={[styles.policyGrid, stacked && styles.policyGridStacked]}>
            {POLICY_OPTIONS.map((option) => (
              <SelectionPill
                accessibilityHint={option.description}
                key={option.mode}
                label={option.title}
                onPress={() => changeMode(option.mode)}
                selected={mode === option.mode}
                style={styles.policyCard}
              />
            ))}
          </View>
          <AppText tone="secondary" variant="caption">
            {activePolicy.description}
          </AppText>
        </View>

        <StatusBanner
          message={`변경 ${preview.changedDateCount}일 · 직접 수정 ${preview.directOverrideDateKeys.length}개 · 제거 ${preview.clearedOverrideDateKeys.length}개`}
          title="적용 전 요약"
          tone={preview.clearedOverrideDateKeys.length > 0 ? 'warning' : 'neutral'}
        />
        <PatternApplicationPreview
          mode={mode}
          onTogglePreservedDate={togglePreservedDate}
          rows={rows}
          selectedDateKeys={effectiveSelectedDates}
        />
      </Screen>
    </>
  );
}

function createStyles(_palette: AppPalette) {
  return StyleSheet.create({
    screen: {
      gap: spacing.xlarge,
      paddingTop: spacing.small,
    },
    intro: {
      alignItems: 'center',
      gap: spacing.small,
    },
    sectionCard: {
      gap: spacing.medium,
      padding: spacing.large,
    },
    policySection: {
      gap: spacing.medium,
    },
    policyGrid: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.small,
    },
    policyGridStacked: {
      flexDirection: 'column',
    },
    policyCard: {
      minWidth: 0,
      flex: 1,
    },
  });
}
