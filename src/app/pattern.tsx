import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { AnimatedShiftIcon, getShiftIconKind } from '@/components/animated-shift-icon';
import { DatePickerField } from '@/components/date-picker-field';
import { AppButton, AppText, Card, Screen, SectionHeader } from '@/components/ui-kit';
import { ShiftChip } from '@/components/shift-chip';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
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
import { getShiftAppearance } from '@/utils/shift-appearance';
import { formatTimeInput } from '@/utils/shift-time';
import {
  createWorkPatternFromReference,
  getPositionAfterReferenceDateChange,
  getRotationPatternPositionForDate,
  getWeekdayPatternPosition,
  getWorkPatternKind,
  ROTATION_PATTERN_NAME,
  ROTATION_PATTERN_SHIFT_TYPE_IDS,
  WEEKDAY_PATTERN_NAME,
  WEEKDAY_PATTERN_SHIFT_TYPE_IDS,
  type WorkPatternKind,
} from '@/utils/work-pattern';

const ROTATION_POSITION_LABELS = [
  '주간 첫째 날',
  '주간 둘째 날',
  '야간 첫째 날',
  '야간 둘째 날',
  '휴무 첫째 날',
  '휴무 둘째 날',
] as const;
const ROTATION_SHORT_LABELS = ['주간 1', '주간 2', '야간 1', '야간 2', '휴무 1', '휴무 2'] as const;

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export default function PatternEditorScreen() {
  const { showDialog } = useAppDialog();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackPreview = width < 360 || fontScale >= 1.3;
  const { createBackup, data, updatePattern } = useAppStore();
  const navigation = useNavigation();
  const allowNavigation = useRef(false);
  const [today] = useState(() => toDateKey(new Date()));
  const initialPatternKind = getWorkPatternKind(data.pattern.shiftTypeIds) ?? 'rotation';
  const initialScheduleStartDate = getScheduleStartDate(data);
  const initialReferenceDate =
    initialScheduleStartDate > today ? initialScheduleStartDate : today;
  const initialPosition =
    initialPatternKind === 'rotation' && isValidDateKey(data.pattern.anchorDate)
      ? positiveModulo(
          differenceInCalendarDays(initialReferenceDate, data.pattern.anchorDate),
          ROTATION_PATTERN_SHIFT_TYPE_IDS.length,
        )
      : null;
  const [patternKind, setPatternKind] = useState<WorkPatternKind>(initialPatternKind);
  const [scheduleStartDate, setScheduleStartDate] = useState(initialScheduleStartDate);
  const [referenceDate, setReferenceDate] = useState(initialReferenceDate);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(initialPosition);
  const [saving, setSaving] = useState(false);
  const scheduleStartDateValid = isValidDateKey(scheduleStartDate);
  const referenceDateValid = isValidDateKey(referenceDate);
  const activeSequence =
    patternKind === 'weekday'
      ? WEEKDAY_PATTERN_SHIFT_TYPE_IDS
      : ROTATION_PATTERN_SHIFT_TYPE_IDS;
  const previewDate = scheduleStartDate;
  const previewPosition =
    patternKind === 'weekday'
      ? scheduleStartDateValid
        ? getWeekdayPatternPosition(scheduleStartDate)
        : null
      : scheduleStartDateValid && referenceDateValid && selectedPosition !== null
        ? getRotationPatternPositionForDate({
            date: scheduleStartDate,
            referenceDate,
            referencePosition: selectedPosition,
          })
        : null;
  const hasUnsavedChanges =
    patternKind !== initialPatternKind ||
    scheduleStartDate !== initialScheduleStartDate ||
    (patternKind === 'rotation' &&
      (referenceDate !== initialReferenceDate || selectedPosition !== initialPosition));
  const futureScheduleOverrideCount = useMemo(
    () =>
      new Set([
        ...Object.keys(data.overrides),
        ...Object.keys(data.timeOverrides),
      ].filter((dateKey) => dateKey >= today)).size,
    [data.overrides, data.timeOverrides, today],
  );
  const dayShift = data.shiftTypes.find((shift) => shift.id === 'day');
  const daySchedule =
    dayShift &&
    dayShift.startMinutes !== null &&
    dayShift.endMinutes !== null
      ? `${formatTimeInput(dayShift.startMinutes)}~${formatTimeInput(dayShift.endMinutes)}`
      : '시간 설정 필요';

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

  const preview = useMemo(
    () => {
      if (!isValidDateKey(previewDate) || previewPosition === null) return [];
      return Array.from({ length: activeSequence.length }, (_, index) => ({
        dateKey: addDays(previewDate, index),
        shift: data.shiftTypes.find(
          (shift) => shift.id === activeSequence[(previewPosition + index) % activeSequence.length],
        ),
      }));
    },
    [activeSequence, data.shiftTypes, previewDate, previewPosition],
  );

  const selectPosition = (index: number) => {
    setSelectedPosition(index);
    void Haptics.selectionAsync();
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

  const selectPatternKind = (kind: WorkPatternKind) => {
    setPatternKind(kind);
    void Haptics.selectionAsync();
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  const persistPattern = async (clearFutureScheduleOverrides = false) => {
    const anchorSourceDate = patternKind === 'weekday' ? scheduleStartDate : referenceDate;
    const anchorPosition =
      patternKind === 'weekday'
        ? getWeekdayPatternPosition(scheduleStartDate)
        : (selectedPosition ?? 0);
    setSaving(true);
    try {
      await createBackup();
      const saved = await updatePattern(
        createWorkPatternFromReference({
          kind: patternKind,
          position: anchorPosition,
          referenceDate: anchorSourceDate,
          scheduleStartDate,
        }),
        {},
        clearFutureScheduleOverrides
          ? { clearFutureScheduleOverridesFrom: today }
          : undefined,
      );
      if (!saved) {
        showDialog(
          '근무 방식을 저장하지 못했어요',
          '잠시 후 다시 시도해 주세요.',
        );
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
    if (!scheduleStartDateValid) {
      showDialog(
        '날짜를 확인해 주세요',
        '일정 적용 시작일을 연도-월-일 형식으로 정확히 입력해 주세요.',
      );
      return;
    }
    if (patternKind === 'rotation' && !isValidDateKey(referenceDate)) {
      showDialog(
        '날짜를 확인해 주세요',
        '순번 기준일을 연도-월-일 형식으로 정확히 입력해 주세요.',
      );
      return;
    }
    if (patternKind === 'rotation' && selectedPosition === null) {
      showDialog('근무 순번을 선택해 주세요', '순번 기준일의 실제 근무를 선택해 주세요.');
      return;
    }

    if (patternKind !== initialPatternKind && futureScheduleOverrideCount > 0) {
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

    void persistPattern(patternKind !== initialPatternKind);
  };

  return (
    <Screen
      contentStyle={styles.screen}
      safeAreaEdges={['left', 'right']}
      footer={
        <AppButton
          disabled={
            saving ||
            !hasUnsavedChanges
          }
          icon="checkmark"
          label={
            saving
              ? '저장 중'
              : !scheduleStartDateValid ||
                  (patternKind === 'rotation' &&
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
        <Card style={styles.modeCard}>
          <View accessibilityRole="radiogroup" style={styles.patternOptions}>
            <Pressable
              aria-checked={patternKind === 'rotation'}
              accessibilityLabel={ROTATION_PATTERN_NAME}
              accessibilityRole="radio"
              accessibilityState={{ checked: patternKind === 'rotation' }}
              onPress={() => selectPatternKind('rotation')}
              style={({ pressed }) => [
                styles.patternOption,
                patternKind === 'rotation' && styles.patternOptionSelected,
                pressed && styles.pressed,
              ]}>
              <View style={styles.patternOptionIcon}>
                <AppIcon color={palette.violet} name="repeat" size={20} />
              </View>
              <AppText numberOfLines={2} variant="label" style={styles.patternOptionTitle}>
                3조 2교대
              </AppText>
            </Pressable>
            <Pressable
              aria-checked={patternKind === 'weekday'}
              accessibilityLabel={WEEKDAY_PATTERN_NAME}
              accessibilityRole="radio"
              accessibilityState={{ checked: patternKind === 'weekday' }}
              onPress={() => selectPatternKind('weekday')}
              style={({ pressed }) => [
                styles.patternOption,
                patternKind === 'weekday' && styles.patternOptionSelected,
                pressed && styles.pressed,
              ]}>
              <View style={[styles.patternOptionIcon, styles.weekdayPatternIcon]}>
                <AnimatedShiftIcon animated={false} color={palette.mintDark} kind="day" size={21} />
              </View>
              <AppText numberOfLines={2} variant="label" style={styles.patternOptionTitle}>
                주간 고정
              </AppText>
            </Pressable>
          </View>

          <View style={styles.divider} />

          {patternKind === 'rotation' ? (
            <View style={styles.patternSummary}>
              <AppText variant="label" style={styles.centerText}>
                {ROTATION_PATTERN_NAME}
              </AppText>
              <View style={styles.sequenceFlow}>
                {ROTATION_PATTERN_SHIFT_TYPE_IDS.map((id, index) => {
                  const shift = data.shiftTypes.find((item) => item.id === id);
                  if (!shift) return null;
                  const appearance = getShiftAppearance(shift, palette, isDark);
                  return (
                    <View key={`${id}-${index}`} style={styles.sequenceItem}>
                      <View
                        accessibilityLabel={ROTATION_POSITION_LABELS[index]}
                        accessible
                        style={[
                          styles.sequenceCircle,
                          {
                            backgroundColor: appearance.softColor,
                            borderColor: appearance.accentColor,
                          },
                        ]}>
                        <AnimatedShiftIcon
                          animated={false}
                          color={appearance.accentColor}
                          kind={getShiftIconKind(shift.id, shift.isOff)}
                          size={19}
                        />
                      </View>
                      <AppText tone="secondary" style={styles.sequenceLabel} variant="caption">
                        {ROTATION_SHORT_LABELS[index]}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.fixedSummary}>
              <View style={[styles.fixedSummaryItem, styles.fixedSummaryItemDivider]}>
                <AnimatedShiftIcon animated={false} color={palette.mintDark} kind="day" size={21} />
                <View style={styles.fixedSummaryCopy}>
                  <AppText variant="label">월~금</AppText>
                  <AppText tone="secondary" variant="caption">
                    {daySchedule} 주간
                  </AppText>
                </View>
              </View>
              <View style={styles.fixedSummaryItem}>
                <AnimatedShiftIcon animated={false} color={palette.inkMuted} kind="off" size={21} />
                <View style={styles.fixedSummaryCopy}>
                  <AppText variant="label">토·일</AppText>
                  <AppText tone="secondary" variant="caption">
                    고정 휴무
                  </AppText>
                </View>
              </View>
            </View>
          )}

          {patternKind === initialPatternKind &&
          !hasUnsavedChanges &&
          futureScheduleOverrideCount > 0 ? (
            <View style={styles.cleanupBlock}>
              <View style={styles.divider} />
              <AppText tone="secondary" style={styles.centerText} variant="caption">
                향후 직접 변경 일정 {futureScheduleOverrideCount}개가 기본 근무표보다 먼저 적용되고
                있어요.
              </AppText>
              <AppButton
                disabled={saving}
                label="기본 근무표로 정리하기"
                onPress={confirmClearFutureScheduleOverrides}
                variant="secondary"
              />
            </View>
          ) : null}
        </Card>
      </View>

      <View>
        <SectionHeader centered title="시작일" />
        <Card style={styles.scheduleCard}>
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

      {patternKind === 'rotation' ? (
        <View>
          <SectionHeader
            centered
            title="순번 맞추기"
          />
          <Card style={styles.scheduleCard}>
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
            {!referenceDateValid ? (
              <AppText color={palette.danger} style={styles.centerText} variant="caption">
                날짜를 연도-월-일 형식으로 입력해 주세요.
              </AppText>
            ) : selectedPosition === null ? (
              <AppText color={palette.amber} style={styles.centerText} variant="caption">
                순번 기준일의 실제 근무를 다시 선택해 주세요.
              </AppText>
            ) : null}
            <View style={styles.divider} />
            <View accessibilityRole="radiogroup" style={styles.positionGrid}>
              {ROTATION_PATTERN_SHIFT_TYPE_IDS.map((id, index) => {
                const shift = data.shiftTypes.find((item) => item.id === id);
                if (!shift) return null;
                const selected = selectedPosition === index;
                const appearance = getShiftAppearance(shift, palette, isDark);
                return (
                  <Pressable
                    aria-checked={selected}
                    key={`${id}-position-${index}`}
                    accessibilityLabel={ROTATION_POSITION_LABELS[index]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => selectPosition(index)}
                    style={({ pressed }) => [
                      styles.positionOption,
                      selected && {
                        borderColor: appearance.accentColor,
                        backgroundColor: appearance.softColor,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <AnimatedShiftIcon
                      animated={false}
                      color={appearance.accentColor}
                      kind={getShiftIconKind(shift.id, shift.isOff)}
                      size={18}
                    />
                    <AppText numberOfLines={1} style={styles.positionLabel} variant="label">
                      {ROTATION_SHORT_LABELS[index]}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
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
                <AppText
                  variant="caption"
                  tone="secondary"
                  style={styles.previewDate}>
                  {item.dateKey ? formatKoreanDate(item.dateKey) : '날짜 확인 필요'}
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
    modeCard: { gap: spacing.medium, padding: spacing.medium },
    patternOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    patternOption: {
      flex: 1,
      flexBasis: 132,
      minWidth: 126,
      minHeight: 58,
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.small,
      borderRadius: radii.medium,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      backgroundColor: palette.surfaceSoft,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
    },
    patternOptionSelected: {
      borderColor: palette.indigo,
      backgroundColor: palette.indigoSoft,
    },
    patternOptionIcon: {
      width: 34,
      height: 34,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: palette.violetSoft,
    },
    weekdayPatternIcon: { backgroundColor: palette.mintSoft },
    patternOptionTitle: { flex: 1, minWidth: 0, textAlign: 'center' },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.controlLine },
    cleanupBlock: { gap: spacing.small },
    patternSummary: { gap: spacing.medium },
    sequenceFlow: { flexDirection: 'row', justifyContent: 'center' },
    sequenceItem: { flex: 1, minWidth: 42, alignItems: 'center', gap: 4 },
    sequenceCircle: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sequenceLabel: { fontSize: 11, textAlign: 'center' },
    fixedSummary: {
      flexDirection: 'row',
      overflow: 'hidden',
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    fixedSummaryItem: {
      flex: 1,
      minWidth: 0,
      minHeight: 82,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.tiny,
      padding: spacing.small,
    },
    fixedSummaryItemDivider: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: palette.line,
    },
    fixedSummaryCopy: { alignItems: 'center', gap: 2 },
    scheduleCard: { gap: spacing.medium },
    positionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    positionOption: {
      flexBasis: 88,
      minWidth: 82,
      flexGrow: 1,
      minHeight: 54,
      paddingHorizontal: spacing.small,
      borderRadius: radii.medium,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      backgroundColor: palette.surfaceSoft,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.tiny,
    },
    positionLabel: { textAlign: 'center' },
    previewCard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
      padding: spacing.small,
    },
    previewCardStacked: { flexDirection: 'column' },
    previewItem: {
      flexBasis: '48%',
      flexGrow: 0,
      minHeight: 64,
      padding: spacing.small,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.tiny,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    previewItemStacked: { width: '100%', flexBasis: 'auto' },
    emptyPreview: {
      width: '100%',
      minHeight: 96,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      padding: spacing.large,
    },
    previewDate: { width: '100%', textAlign: 'center' },
    pressed: { opacity: 0.65 },
  });
}
