import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Screen, SectionHeader } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { AppField, StatusBanner } from '@/design-system';
import {
  createPatternDraft,
  formatPatternSequence,
  MAX_PATTERN_LENGTH,
  validatePatternDraft,
  type PatternDraft,
} from '@/features/pattern-library/pattern-library-model';
import { PatternSequenceDayEditor } from '@/features/pattern-library/pattern-sequence-day-editor';
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
  const allowNavigation = useRef(false);
  const validation = useMemo(() => validatePatternDraft(draft), [draft]);
  const changed = JSON.stringify(initialDraft) !== JSON.stringify(draft);

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
    void Haptics.selectionAsync();
  };

  const removeDay = (index: number) => {
    setDraft((current) => ({
      ...current,
      shiftCodes: current.shiftCodes.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addDay = () => {
    if (draft.shiftCodes.length >= MAX_PATTERN_LENGTH) return;
    setDraft((current) => ({ ...current, shiftCodes: [...current.shiftCodes, 'OFF'] }));
  };

  const save = async () => {
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        <SectionHeader centered title="패턴 편집" />
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
            disabled={!changed || !validation.valid || saving}
            icon="checkmark"
            label={saving ? '저장 중' : '패턴 저장'}
            loading={saving}
            onPress={() => void save()}
          />
        }
        safeAreaEdges={['left', 'right']}
        scroll={false}>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={draft.shiftCodes}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(_, index) => `pattern-day-${index}`}
          ListFooterComponent={
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
              variant="secondary"
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <SectionHeader centered title={editing ? '패턴 편집' : '내 패턴 만들기'} />
              <StatusBanner
                message="이 패턴은 근무 순서만 포함합니다. 근무 시간, 알람, 권한 설정은 변경하지 않습니다."
                title="설정 보호"
                tone="info"
              />
              <AppField
                autoCapitalize="none"
                errorText={validation.issue === 'name-required' ? validation.message ?? undefined : undefined}
                helperText="나중에 구분할 수 있는 이름을 입력합니다."
                label="패턴 이름"
                maxLength={80}
                onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                placeholder="예: 우리 회사 6일 순환"
                required
                value={draft.name}
              />
              <View style={styles.summary}>
                <AppText variant="label">근무 순서 · {draft.shiftCodes.length}/42일</AppText>
                <AppText tone="secondary" variant="caption">
                  {formatPatternSequence(draft.shiftCodes)}
                </AppText>
              </View>
            </View>
          }
          renderItem={({ index, item }) => (
            <PatternSequenceDayEditor
              code={item}
              index={index}
              onChange={changeCode}
              onRemove={removeDay}
              total={draft.shiftCodes.length}
            />
          )}
          showsVerticalScrollIndicator
        />
      </Screen>
    </>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: {
      minHeight: 0,
      flex: 1,
      paddingHorizontal: 0,
      paddingTop: 0,
    },
    listContent: {
      paddingHorizontal: spacing.large,
      paddingTop: spacing.large,
      paddingBottom: spacing.xlarge,
    },
    header: {
      gap: spacing.large,
      marginBottom: spacing.large,
    },
    summary: {
      gap: spacing.small,
      padding: spacing.large,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 18,
      backgroundColor: palette.surfaceSoft,
    },
  });
}
