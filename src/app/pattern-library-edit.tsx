import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { AppField, PageHeader, StatusBanner, Surface } from '@/design-system';
import {
  triggerNotificationFeedback,
  triggerSelectionFeedback,
} from '@/features/feedback/feedback-controller';
import {
  createPatternDraft,
  formatPatternSequence,
  MAX_PATTERN_LENGTH,
  validatePatternDraft,
  type PatternDraft,
} from '@/features/pattern-library/pattern-library-model';
import {
  PatternSequenceDayEditor,
  PatternSequenceStrip,
} from '@/features/pattern-library/pattern-sequence-day-editor';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PatternShiftCode } from '@/models/app-data';
import { useAppStore } from '@/store/app-store';
import { toDateKey } from '@/utils/date';

export default function PatternLibraryEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { showDialog } = useAppDialog();
  const { data, saveUserPattern } = useAppStore();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const editing = id ? data.patternVault.find((entry) => entry.id === id) : undefined;
  const [initialDraft] = useState<PatternDraft>(() => createPatternDraft(editing));
  const [draft, setDraft] = useState<PatternDraft>(() => initialDraft);
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const allowNavigation = useRef(false);
  const validation = useMemo(() => validatePatternDraft(draft), [draft]);
  const changed = JSON.stringify(initialDraft) !== JSON.stringify(draft);

  const activeIndex = Math.min(selectedIndex, draft.shiftCodes.length - 1);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowNavigation.current || !changed) return;
        event.preventDefault();
        showDialog(
          '저장하지 않고 나가시겠습니까?',
          '변경한 패턴 이름과 근무 순서가 저장되지 않습니다.',
          [
            { text: '계속 편집', actionId: 'cancel', icon: 'close', style: 'cancel' },
            {
              text: '저장하지 않고 나가기',
              actionId: 'delete',
              icon: 'trash-outline',
              style: 'destructive',
              onPress: () => {
                allowNavigation.current = true;
                navigation.dispatch(event.data.action);
              },
            },
          ],
          { tone: 'warning' },
        );
      }),
    [changed, navigation, showDialog],
  );

  const changeCode = (index: number, code: PatternShiftCode) => {
    setDraft((current) => ({
      ...current,
      shiftCodes: current.shiftCodes.map((item, itemIndex) =>
        itemIndex === index ? code : item,
      ),
    }));
    void triggerSelectionFeedback();
  };

  const removeDay = (index: number) => {
    setDraft((current) => ({
      ...current,
      shiftCodes: current.shiftCodes.filter((_, itemIndex) => itemIndex !== index),
    }));
    setSelectedIndex((current) => Math.max(0, Math.min(current, draft.shiftCodes.length - 2)));
  };

  const addDay = () => {
    if (draft.shiftCodes.length >= MAX_PATTERN_LENGTH) return;
    setSelectedIndex(draft.shiftCodes.length);
    setDraft((current) => ({ ...current, shiftCodes: [...current.shiftCodes, 'OFF'] }));
  };

  const save = async () => {
    setSubmitAttempted(true);
    if (!validation.valid || saving) {
      if (validation.message) {
        showDialog('패턴을 확인해야 합니다', validation.message, undefined, {
          tone: 'warning',
        });
      }
      return;
    }
    setSaving(true);
    try {
      const result = await saveUserPattern({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        anchorDate: editing?.anchorDate ?? toDateKey(new Date()),
        shiftCodes: draft.shiftCodes,
      });
      if (result.status === 'saved' || result.status === 'unchanged') {
        allowNavigation.current = true;
        void triggerNotificationFeedback('success');
        router.back();
        return;
      }
      const message =
        result.reason === 'vault-full'
          ? '보관함에는 패턴을 100개까지 저장할 수 있습니다.'
          : result.reason === 'source-conflict'
            ? '다른 출처의 같은 ID 패턴이 있어 저장할 수 없습니다.'
            : '패턴을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.';
      showDialog('패턴을 저장하지 못했습니다', message, undefined, {
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  if (id && (!editing || editing.source !== 'user')) {
    return (
      <Screen>
        <PageHeader title="패턴 편집" />
        <StatusBanner
          actionLabel="보관함으로 이동"
          message="편집할 수 있는 내 패턴을 찾지 못했습니다."
          onAction={() => router.replace('/pattern-library' as never)}
          title="패턴 확인 필요"
          tone="warning"
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: editing ? '패턴 편집' : '패턴 만들기' }} />
      <Screen
        contentStyle={styles.screen}
        footer={
          <AppButton
            disabled={!changed || saving}
            icon="checkmark"
            label={saving ? '저장 중' : '패턴 저장'}
            loading={saving}
            onPress={() => void save()}
          />
        }
        safeAreaEdges={['left', 'right']}
        scroll>
        <PageHeader
          subtitle="날짜를 고른 뒤 그날의 근무만 수정합니다."
          title={editing ? '패턴 편집' : '내 패턴 만들기'}
        />
        <StatusBanner
          message="이 패턴은 근무 순서만 포함합니다. 근무 시간, 알람, 권한 설정은 변경하지 않습니다."
          title="설정 보호"
          tone="info"
        />
        <AppField
          autoCapitalize="none"
          errorText={
            (nameTouched || submitAttempted) && validation.issue === 'name-required'
              ? validation.message ?? undefined
              : undefined
          }
          helperText="나중에 구분할 수 있는 이름을 입력합니다."
          label="패턴 이름"
          maxLength={80}
          onBlur={() => setNameTouched(true)}
          onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
          placeholder="예: 우리 회사 6일 순환"
          required
          value={draft.name}
        />
        <Surface density="compact" tone="muted" style={styles.summary}>
          <AppText variant="label">근무 순서 · {draft.shiftCodes.length}/42일</AppText>
          <AppText tone="secondary" variant="caption">
            {formatPatternSequence(draft.shiftCodes)}
          </AppText>
        </Surface>
        <View style={styles.sequenceSection}>
          <View style={styles.sequenceHeading}>
            <View style={styles.sequenceHeadingCopy}>
              <AppText accessibilityRole="header" variant="heading">날짜별 근무</AppText>
              <AppText tone="secondary" variant="caption">
                {activeIndex + 1}/{draft.shiftCodes.length}일을 편집합니다.
              </AppText>
            </View>
            <AppButton
              accessibilityHint="패턴 끝에 휴무 하루를 추가합니다."
              disabled={draft.shiftCodes.length >= MAX_PATTERN_LENGTH}
              icon="add"
              label={draft.shiftCodes.length >= MAX_PATTERN_LENGTH ? '42일 최대' : '날짜 추가'}
              onPress={addDay}
              size="compact"
              variant="secondary"
            />
          </View>
          <PatternSequenceStrip
            codes={draft.shiftCodes}
            onSelect={setSelectedIndex}
            selectedIndex={activeIndex}
          />
          <PatternSequenceDayEditor
            code={draft.shiftCodes[activeIndex]}
            index={activeIndex}
            onChange={changeCode}
            onRemove={removeDay}
            total={draft.shiftCodes.length}
          />
        </View>
      </Screen>
    </>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: {
      gap: spacing.large,
    },
    summary: {
      gap: spacing.small,
      padding: spacing.large,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 18,
      backgroundColor: palette.surfaceSoft,
    },
    sequenceSection: { gap: spacing.medium },
    sequenceHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    sequenceHeadingCopy: { minWidth: 180, flex: 1, gap: spacing.tiny },
  });
}
