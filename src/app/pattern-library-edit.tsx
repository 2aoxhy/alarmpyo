import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import {
  AppField,
  DisclosureRow,
  PageHeader,
  StatusBanner,
} from '@/design-system';
import {
  triggerNotificationFeedback,
  triggerSelectionFeedback,
} from '@/features/feedback/feedback-controller';
import {
  compressPatternShiftCodes,
  createPatternDraft,
  expandPatternComposerSegments,
  formatPatternComposerName,
  formatPatternSequence,
  isPatternComposerValid,
  MAX_PATTERN_LENGTH,
  normalizePatternComposerSegments,
  validatePatternDraft,
  type PatternComposerSegment,
  type PatternDraft,
} from '@/features/pattern-library/pattern-library-model';
import { PatternSegmentComposer } from '@/features/pattern-library/pattern-segment-composer';
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
  const [initialDraft] = useState<PatternDraft>(() => {
    const created = createPatternDraft(editing);
    if (editing) return created;
    const initialSegments = compressPatternShiftCodes(created.shiftCodes);
    return { ...created, name: formatPatternComposerName(initialSegments) };
  });
  const [draft, setDraft] = useState<PatternDraft>(() => initialDraft);
  const [segments, setSegments] = useState<PatternComposerSegment[]>(() =>
    compressPatternShiftCodes(initialDraft.shiftCodes),
  );
  const [segmentHistory, setSegmentHistory] = useState<PatternComposerSegment[][]>([]);
  const [customName, setCustomName] = useState(Boolean(editing));
  const [nameEditorOpen, setNameEditorOpen] = useState(Boolean(editing));
  const [advancedEditorOpen, setAdvancedEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const allowNavigation = useRef(false);
  const validation = useMemo(() => validatePatternDraft(draft), [draft]);
  const changed = JSON.stringify(initialDraft) !== JSON.stringify(draft);
  const hasUnsavedChanges = changed;

  const activeIndex = Math.min(selectedIndex, draft.shiftCodes.length - 1);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowNavigation.current || !hasUnsavedChanges) return;
        event.preventDefault();
        showDialog(
          '저장하지 않고 나가시겠습니까?',
          '이름과 근무 순서 변경이 사라집니다.',
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
    [hasUnsavedChanges, navigation, showDialog],
  );

  const commitSegments = (nextSegments: PatternComposerSegment[]) => {
    if (!isPatternComposerValid(nextSegments)) return;
    const copiedNext = normalizePatternComposerSegments(nextSegments);
    setSegmentHistory((current) => [
      ...current.slice(-19),
      segments.map((segment) => ({ ...segment })),
    ]);
    setSegments(copiedNext);
    setDraft((current) => ({
      ...current,
      name: customName ? current.name : formatPatternComposerName(copiedNext),
      shiftCodes: expandPatternComposerSegments(copiedNext),
    }));
    void triggerSelectionFeedback();
  };

  const commitCodes = (shiftCodes: PatternShiftCode[]) => {
    commitSegments(compressPatternShiftCodes(shiftCodes));
  };

  const undoComposerChange = () => {
    const previous = segmentHistory[segmentHistory.length - 1];
    if (!previous) return;
    const restored = previous.map((segment) => ({ ...segment }));
    setSegmentHistory((current) => current.slice(0, -1));
    setSegments(restored);
    setDraft((current) => ({
      ...current,
      name: customName ? current.name : formatPatternComposerName(restored),
      shiftCodes: expandPatternComposerSegments(restored),
    }));
    void triggerSelectionFeedback();
  };

  const changeCode = (index: number, code: PatternShiftCode) => {
    commitCodes(
      draft.shiftCodes.map((item, itemIndex) =>
        itemIndex === index ? code : item,
      ),
    );
  };

  const removeDay = (index: number) => {
    commitCodes(draft.shiftCodes.filter((_, itemIndex) => itemIndex !== index));
    setSelectedIndex((current) => Math.max(0, Math.min(current, draft.shiftCodes.length - 2)));
  };

  const addDay = () => {
    if (draft.shiftCodes.length >= MAX_PATTERN_LENGTH) return;
    setSelectedIndex(draft.shiftCodes.length);
    commitCodes([...draft.shiftCodes, 'OFF']);
  };

  const save = async () => {
    setSubmitAttempted(true);
    if (!validation.valid || saving) {
      if (validation.message) {
        showDialog('패턴 확인', validation.message, undefined, {
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
          ? '보관함은 패턴 100개까지 저장 가능'
          : result.reason === 'source-conflict'
            ? '같은 ID의 다른 패턴이 이미 있음'
            : '저장 공간을 확인한 뒤 다시 시도';
      showDialog('저장 실패', message, undefined, {
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
            disabled={(Boolean(editing) && !changed) || saving}
            icon="checkmark"
            label={saving ? '저장 중' : '패턴 저장'}
            loading={saving}
            onPress={() => void save()}
          />
        }
        safeAreaEdges={['left', 'right']}
        scroll>
        <PageHeader
          subtitle="근무 종류와 일수로 순서 만들기"
          title={editing ? '패턴 편집' : '내 패턴 만들기'}
        />
        <View style={styles.nameSection}>
          <View style={styles.nameHeading}>
            <View style={styles.sequenceHeadingCopy}>
              <AppText accessibilityRole="header" variant="heading">
                패턴 이름
              </AppText>
              <AppText tone="secondary" variant="caption">
                순서로 자동 생성
              </AppText>
            </View>
            <AppButton
              icon={customName ? 'refresh-outline' : 'options-outline'}
              label={customName ? '자동 이름' : '이름 수정'}
              onPress={() => {
                if (customName) {
                  setCustomName(false);
                  setNameEditorOpen(false);
                  setNameTouched(false);
                  setDraft((current) => ({
                    ...current,
                    name: formatPatternComposerName(segments),
                  }));
                } else {
                  setCustomName(true);
                  setNameEditorOpen(true);
                }
              }}
              size="compact"
              variant="ghost"
            />
          </View>
          {nameEditorOpen ? (
            <AppField
              autoCapitalize="none"
              errorText={
                (nameTouched || submitAttempted) && validation.issue === 'name-required'
                  ? validation.message ?? undefined
                  : undefined
              }
              helperText="보관함에 표시할 이름"
              label="패턴 이름"
              maxLength={80}
              onBlur={() => setNameTouched(true)}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              placeholder="예: 우리 회사 6일 순환"
              required
              value={draft.name}
            />
          ) : (
            <View style={styles.autoName}>
              <AppText variant="label">{draft.name}</AppText>
            </View>
          )}
        </View>
        <View style={styles.summary}>
          <AppText variant="label">근무 순서 · {draft.shiftCodes.length}/42일</AppText>
          <AppText tone="secondary" variant="caption">
            {formatPatternSequence(draft.shiftCodes)}
          </AppText>
          <AppText tone="tertiary" variant="caption">
            근무 순서만 저장
          </AppText>
        </View>
        <PatternSegmentComposer
          canUndo={segmentHistory.length > 0}
          onChange={commitSegments}
          onUndo={undoComposerChange}
          segments={segments}
        />

        <View style={styles.advancedSection}>
          <DisclosureRow
            expanded={advancedEditorOpen}
            icon="calendar-outline"
            onPress={() => setAdvancedEditorOpen((current) => !current)}
            subtitle="하루씩 바꿀 때 사용"
            title="날짜별 상세 편집"
          />
          {advancedEditorOpen ? (
            <View style={styles.sequenceSection}>
              <View style={styles.sequenceHeading}>
                <View style={styles.sequenceHeadingCopy}>
                  <AppText accessibilityRole="header" variant="heading">
                    날짜별 근무
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    {activeIndex + 1}/{draft.shiftCodes.length}일
                  </AppText>
                </View>
                <AppButton
                  accessibilityHint="패턴 끝에 휴무 하루를 추가합니다."
                  disabled={draft.shiftCodes.length >= MAX_PATTERN_LENGTH}
                  icon="add"
                  label={
                    draft.shiftCodes.length >= MAX_PATTERN_LENGTH
                      ? '42일 최대'
                      : '날짜 추가'
                  }
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
          ) : null}
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
    nameSection: { gap: spacing.medium },
    nameHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    autoName: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: spacing.medium,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    summary: {
      gap: spacing.small,
      paddingVertical: spacing.medium,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
    },
    advancedSection: { gap: spacing.medium },
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
