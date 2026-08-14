import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { DatePickerField } from '@/components/date-picker-field';
import { ShiftChip } from '@/components/shift-chip';
import { AppButton, AppText, Card, Screen, SectionHeader } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner } from '@/design-system';
import {
  PatternSequenceEditor,
  RotationPositionPicker,
} from '@/features/setup/setup-components';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { getScheduleStartDate } from '@/services/app-data-service';
import { useAppStore } from '@/store/app-store';
import {
  addDays,
  differenceInCalendarDays,
  formatKoreanDate,
  isValidDateKey,
  toDateKey,
} from '@/utils/date';
import {
  createWorkPatternFromReference,
  getEffectiveWorkPatternPresetId,
  getPatternPositionForDate,
  getPositionAfterReferenceDateChange,
  getWeekdayPatternPosition,
  getWorkPatternPreset,
  getWorkPatternPresetId,
  isBaseWorkShiftId,
  isValidCustomPatternSequence,
  WORK_PATTERN_PRESETS,
  type BaseWorkShiftId,
  type WorkPatternPresetId,
} from '@/utils/work-pattern';

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function sameSequence(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export default function PatternEditorScreen() {
  const { showDialog } = useAppDialog();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackPreview = width < 360 || fontScale >= 1.3;
  const compactPositions = width < 390 || fontScale >= 1.25;
  const { createBackup, data, updatePattern } = useAppStore();
  const navigation = useNavigation();
  const allowNavigation = useRef(false);
  const [today] = useState(() => toDateKey(new Date()));
  const initialPresetId = getWorkPatternPresetId(data.pattern.shiftTypeIds);
  const initialSequence = data.pattern.shiftTypeIds.filter(isBaseWorkShiftId);
  const initialScheduleStartDate = getScheduleStartDate(data);
  const initialReferenceDate =
    initialScheduleStartDate > today ? initialScheduleStartDate : today;
  const initialPosition =
    initialPresetId !== 'weekday' &&
    initialSequence.length > 0 &&
    isValidDateKey(data.pattern.anchorDate)
      ? positiveModulo(
          differenceInCalendarDays(initialReferenceDate, data.pattern.anchorDate),
          initialSequence.length,
        )
      : null;
  const [presetId, setPresetId] = useState<WorkPatternPresetId>(initialPresetId);
  const [sequence, setSequence] = useState<BaseWorkShiftId[]>(initialSequence);
  const [scheduleStartDate, setScheduleStartDate] = useState(initialScheduleStartDate);
  const [referenceDate, setReferenceDate] = useState(initialReferenceDate);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(initialPosition);
  const [saving, setSaving] = useState(false);
  const scheduleStartDateValid = isValidDateKey(scheduleStartDate);
  const referenceDateValid = isValidDateKey(referenceDate);
  const sequenceValid = isValidCustomPatternSequence(sequence);
  const effectivePresetId = getEffectiveWorkPatternPresetId(presetId, sequence)!;
  const normalizedToWeekday =
    presetId !== 'weekday' && effectivePresetId === 'weekday';
  const patternIdentityChanged = !sameSequence(sequence, initialSequence);
  const hasUnsavedChanges =
    presetId !== initialPresetId ||
    patternIdentityChanged ||
    scheduleStartDate !== initialScheduleStartDate ||
    (effectivePresetId !== 'weekday' &&
      (referenceDate !== initialReferenceDate || selectedPosition !== initialPosition));
  const futureScheduleOverrideCount = useMemo(
    () =>
      new Set(
        [...Object.keys(data.overrides), ...Object.keys(data.timeOverrides)].filter(
          (dateKey) => dateKey >= today,
        ),
      ).size,
    [data.overrides, data.timeOverrides, today],
  );
  const previewPosition =
    effectivePresetId === 'weekday'
      ? scheduleStartDateValid
        ? getWeekdayPatternPosition(scheduleStartDate)
        : null
      : scheduleStartDateValid &&
          referenceDateValid &&
          selectedPosition !== null &&
          sequenceValid
        ? getPatternPositionForDate({
            date: scheduleStartDate,
            referenceDate,
            referencePosition: selectedPosition,
            sequenceLength: sequence.length,
          })
        : null;

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (saving && !allowNavigation.current) {
          event.preventDefault();
          return;
        }
        if (!hasUnsavedChanges || allowNavigation.current) return;
        event.preventDefault();
        showDialog(
          '저장하지 않고 나갈까요?',
          '선택한 근무 방식과 일정 적용 시작일이 사라져요.',
          [
            { text: '계속 설정하기', style: 'cancel' },
            {
              text: '저장하지 않고 나가기',
              style: 'destructive',
              onPress: () => {
                allowNavigation.current = true;
                navigation.dispatch(event.data.action);
              },
            },
          ],
        );
      }),
    [hasUnsavedChanges, navigation, saving, showDialog],
  );

  const preview = useMemo(() => {
    if (!scheduleStartDateValid || previewPosition === null) return [];
    return Array.from({ length: sequence.length }, (_, index) => ({
      dateKey: addDays(scheduleStartDate, index),
      shift: data.shiftTypes.find(
        (shift) => shift.id === sequence[(previewPosition + index) % sequence.length],
      ),
    }));
  }, [data.shiftTypes, previewPosition, scheduleStartDate, scheduleStartDateValid, sequence]);

  const selectPreset = (nextPresetId: WorkPatternPresetId) => {
    setPresetId(nextPresetId);
    setSequence([...getWorkPatternPreset(nextPresetId).shiftTypeIds]);
    setSelectedPosition(null);
    void Haptics.selectionAsync();
  };

  const changeSequence = (next: BaseWorkShiftId[]) => {
    setSequence(next);
    setSelectedPosition(null);
  };

  const changeReferenceDate = (nextDate: string) => {
    setSelectedPosition((currentPosition) =>
      getPositionAfterReferenceDateChange({
        currentDate: referenceDate,
        nextDate,
        selectedPosition: currentPosition,
      }),
    );
    setReferenceDate(nextDate);
  };

  const selectPosition = (index: number) => {
    setSelectedPosition(index);
    void Haptics.selectionAsync();
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  const persistPattern = async (clearFutureScheduleOverrides = false) => {
    const anchorSourceDate =
      effectivePresetId === 'weekday' ? scheduleStartDate : referenceDate;
    const anchorPosition =
      effectivePresetId === 'weekday'
        ? getWeekdayPatternPosition(scheduleStartDate)
        : (selectedPosition ?? 0);
    setSaving(true);
    try {
      await createBackup();
      const saved = await updatePattern(
        createWorkPatternFromReference({
          presetId: effectivePresetId,
          position: anchorPosition,
          referenceDate: anchorSourceDate,
          scheduleStartDate,
          shiftTypeIds: sequence,
        }),
        {},
        clearFutureScheduleOverrides
          ? { clearFutureScheduleOverridesFrom: today }
          : undefined,
      );
      if (!saved) {
        showDialog('근무 방식을 저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
        return;
      }
      allowNavigation.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goBack();
    } catch {
      showDialog(
        '안전 백업을 만들지 못했어요',
        '기존 근무표의 안전 백업을 만들지 못해 근무 방식을 변경하지 않았어요.',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmClearFutureScheduleOverrides = () => {
    showDialog(
      '기본 근무표로 정리할까요?',
      `오늘 이후 직접 변경한 근무와 시간 ${futureScheduleOverrideCount}개를 정리해요. 메모와 연차·교육·예비군 일정은 유지해요.`,
      [
        { text: '계속 설정하기', style: 'cancel' },
        {
          text: '정리하기',
          style: 'destructive',
          onPress: () => void persistPattern(true),
        },
      ],
    );
  };

  const save = () => {
    if (!scheduleStartDateValid || !sequenceValid) {
      showDialog(
        '근무 정보를 확인해 주세요',
        '일정 적용 시작일과 1~42일의 회사 근무 순서를 확인해 주세요.',
      );
      return;
    }
    if (
      effectivePresetId !== 'weekday' &&
      (!referenceDateValid || selectedPosition === null)
    ) {
      showDialog(
        '근무 순번을 확인해 주세요',
        '순번 기준일과 그날의 실제 근무를 선택해 주세요.',
      );
      return;
    }
    if (patternIdentityChanged && futureScheduleOverrideCount > 0) {
      showDialog(
        '근무 방식을 변경할까요?',
        `직접 변경한 향후 일정 ${futureScheduleOverrideCount}개를 정리한 뒤 새 근무 방식을 적용해요. 메모와 연차·교육·예비군 일정은 유지해요.`,
        [
          { text: '계속 설정하기', style: 'cancel' },
          { text: '정리 후 변경하기', onPress: () => void persistPattern(true) },
        ],
      );
      return;
    }
    void persistPattern(patternIdentityChanged);
  };

  return (
    <Screen
      contentStyle={styles.screen}
      safeAreaEdges={['left', 'right']}
      footer={
        <AppButton
          disabled={saving || !hasUnsavedChanges}
          icon="checkmark"
          label={
            saving
              ? '저장 중'
              : !scheduleStartDateValid ||
                  !sequenceValid ||
                  (effectivePresetId !== 'weekday' &&
                    (!referenceDateValid || selectedPosition === null))
                ? '입력 확인하기'
                : '저장하기'
          }
          loading={saving}
          onPress={save}
        />
      }>
      <View>
        <SectionHeader centered title="근무 방식" />
        <Card style={styles.card}>
          <View accessibilityRole="radiogroup" style={styles.patternOptions}>
            {WORK_PATTERN_PRESETS.map((preset) => {
              const selected = preset.id === presetId;
              return (
                <Pressable
                  accessibilityLabel={preset.name}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={preset.id}
                  onPress={() => selectPreset(preset.id)}
                  style={({ pressed }) => [
                    styles.patternOption,
                    selected && styles.patternOptionSelected,
                    pressed && styles.pressed,
                  ]}>
                  <AppIcon
                    color={selected ? palette.indigoDark : palette.inkMuted}
                    name={preset.id === 'weekday' ? 'shift-day' : 'repeat'}
                    size={20}
                  />
                  <View style={styles.patternCopy}>
                    <AppText variant="label">{preset.shortName}</AppText>
                    <AppText variant="caption" tone="secondary">{preset.description}</AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {presetId !== 'weekday' ? (
            <>
              <View style={styles.divider} />
              <View style={styles.sectionCopy}>
                <AppText variant="label">회사 근무 순서</AppText>
                <AppText variant="caption" tone="secondary">
                  대표 예시가 다르면 날짜를 눌러 실제 순서로 바꿔요.
                </AppText>
              </View>
              <PatternSequenceEditor sequence={sequence} onChange={changeSequence} />
              {normalizedToWeekday ? (
                <StatusBanner
                  icon="calendar-outline"
                  message="이 순서는 주간 고정과 같아 월~금 근무·토·일 휴무로 요일에 맞춰 저장해요."
                  tone="info"
                />
              ) : null}
            </>
          ) : null}

          {!hasUnsavedChanges && futureScheduleOverrideCount > 0 ? (
            <>
              <View style={styles.divider} />
              <AppText tone="secondary" style={styles.centerText} variant="caption">
                향후 직접 변경 일정 {futureScheduleOverrideCount}개가 기본 근무표보다 먼저 적용되고 있어요.
              </AppText>
              <AppButton
                disabled={saving}
                label="기본 근무표로 정리하기"
                onPress={confirmClearFutureScheduleOverrides}
                variant="secondary"
              />
            </>
          ) : null}
        </Card>
      </View>

      <View>
        <SectionHeader centered title="시작일" />
        <Card style={styles.card}>
          <AppText tone="secondary" style={styles.centerText} variant="caption">
            이 날짜부터 새 근무표를 계산하고 이전 일정은 유지해요.
          </AppText>
          <DatePickerField
            accessibilityLabel="일정 적용 시작일 선택하기"
            onChange={setScheduleStartDate}
            placeholder={initialScheduleStartDate}
            today={today}
            value={scheduleStartDate}
          />
        </Card>
      </View>

      {effectivePresetId !== 'weekday' ? (
        <View>
          <SectionHeader centered title="순번 맞추기" />
          <Card style={styles.card}>
            <AppText tone="secondary" style={styles.centerText} variant="caption">
              실제 근무를 아는 날짜와 그날의 근무를 선택해 주세요.
            </AppText>
            <DatePickerField
              accessibilityLabel="근무 순번 기준일 선택하기"
              onChange={changeReferenceDate}
              placeholder={today}
              today={today}
              value={referenceDate}
            />
            <RotationPositionPicker
              compact={compactPositions}
              onSelect={selectPosition}
              position={selectedPosition}
              sequence={sequence}
              shiftTypes={data.shiftTypes}
            />
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader centered title="적용 첫날부터 미리 보기" />
        <Card style={[styles.previewCard, stackPreview && styles.previewCardStacked]}>
          {preview.length > 0 ? (
            preview.map((item, index) => (
              <View
                key={`${item.dateKey}-${index}`}
                style={[styles.previewItem, stackPreview && styles.previewItemStacked]}>
                <AppText variant="caption" tone="secondary" style={styles.previewDate}>
                  {formatKoreanDate(item.dateKey)}
                </AppText>
                {item.shift ? <ShiftChip compact shift={item.shift} /> : null}
              </View>
            ))
          ) : (
            <View style={styles.emptyPreview}>
              <AppIcon color={palette.inkSoft} name="options-outline" size={22} />
              <AppText tone="secondary" style={styles.centerText} variant="caption">
                순번 기준일과 실제 근무를 확인하면 미리 보기가 표시돼요.
              </AppText>
            </View>
          )}
        </Card>
      </View>
    </Screen>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: { gap: spacing.large, paddingTop: spacing.small },
    centerText: { textAlign: 'center' },
    card: { gap: spacing.medium, padding: spacing.medium },
    sectionCopy: { gap: spacing.tiny },
    patternOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    patternOption: {
      minWidth: 138,
      minHeight: 72,
      flexBasis: '45%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
      padding: spacing.small,
    },
    patternOptionSelected: {
      borderColor: palette.indigo,
      backgroundColor: palette.indigoSoft,
    },
    patternCopy: { minWidth: 0, flex: 1, gap: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line },
    pressed: { opacity: 0.72 },
    previewCard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
      padding: spacing.medium,
    },
    previewCardStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
    previewItem: {
      minWidth: 136,
      minHeight: 58,
      flexBasis: '30%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
      padding: spacing.small,
    },
    previewItemStacked: {
      width: '100%',
      flexBasis: 'auto',
      flexDirection: 'row',
    },
    previewDate: { textAlign: 'center' },
    emptyPreview: {
      minHeight: 80,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
    },
  });
}
