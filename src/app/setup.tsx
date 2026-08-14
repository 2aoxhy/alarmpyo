import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import {
  DAY_SHIFT_END_MINUTES,
  DAY_SHIFT_START_MINUTES,
  EVENING_SHIFT_END_MINUTES,
  EVENING_SHIFT_START_MINUTES,
  NIGHT_SHIFT_END_MINUTES,
  NIGHT_SHIFT_START_MINUTES,
} from '@/constants/shift-schedule';
import { AppField, StatusBanner, ToggleRow } from '@/design-system';
import {
  RotationPositionPicker,
  PatternSequenceEditor,
  SetupHero,
  SetupPreview,
  SetupProgress,
  WeekdaySchedule,
  WorkModeStep,
  WorkTimeEditor,
} from '@/features/setup/setup-components';
import {
  applySetupPresetSuggestions,
  buildInitialSetupPayload,
  buildSetupPreview,
  createSetupSequenceSignature,
  createSetupSequenceOptions,
  createSetupWorkTimeSignature,
  getSuggestedWorkTimesForPreset,
  normalizeSetupScreenStep,
  type SetupScreenStep,
  type SetupWorkTimeValues,
  validateSetupInput,
} from '@/features/setup/setup-flow';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  clearSetupDraft,
  isMeaningfulSetupDraft,
  readSetupDraft,
  SETUP_DRAFT_VERSION,
  type SetupWorkTimeField,
  writeSetupDraft,
} from '@/services/setup-draft-service';
import {
  analyzeScheduleSafety,
  createScheduleSafetyShifts,
} from '@/services/schedule-safety-service';
import { useAppStore } from '@/store/app-store';
import { formatTimeInput } from '@/utils/shift-time';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  getPositionAfterReferenceDateChange,
  getWorkPatternCategoryId,
  getWorkPatternPresetId,
  getWorkPatternPreset,
  type BaseWorkShiftId,
  type WorkPatternCategoryId,
  type WorkPatternPresetId,
} from '@/utils/work-pattern';
import { formatKoreanDate, toDateKey } from '@/utils/date';

export default function SetupScreen() {
  const { showDialog } = useAppDialog();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackFooter = width < 420 || fontScale >= 1.25;
  const stackModeOptions = width < 430 || fontScale >= 1.3;
  const compactPositionOptions = width < 390 || fontScale >= 1.25;
  const { completeInitialSetup, data, requestAlarmAccess } = useAppStore();
  const dayShift = data.shiftTypes.find((shift) => shift.id === 'day');
  const eveningShift = data.shiftTypes.find((shift) => shift.id === 'evening');
  const nightShift = data.shiftTypes.find((shift) => shift.id === 'night');
  const dayAppearance = dayShift ? getShiftAppearance(dayShift, palette, isDark) : null;
  const eveningAppearance = eveningShift
    ? getShiftAppearance(eveningShift, palette, isDark)
    : null;
  const nightAppearance = nightShift ? getShiftAppearance(nightShift, palette, isDark) : null;
  const [today] = useState(() => toDateKey(new Date()));
  const [step, setStep] = useState<SetupScreenStep>(1);
  const [categoryId, setCategoryId] = useState<WorkPatternCategoryId | null>(null);
  const [presetId, setPresetId] = useState<WorkPatternPresetId | null>(null);
  const [sequence, setSequence] = useState<BaseWorkShiftId[]>(() => [
    ...getWorkPatternPreset('three-team-two-shift').shiftTypeIds,
  ]);
  const [position, setPosition] = useState<number | null>(null);
  const [referenceDate, setReferenceDate] = useState(today);
  const [dayStart, setDayStart] = useState(() =>
    formatTimeInput(dayShift?.startMinutes ?? DAY_SHIFT_START_MINUTES),
  );
  const [dayEnd, setDayEnd] = useState(() =>
    formatTimeInput(dayShift?.endMinutes ?? DAY_SHIFT_END_MINUTES),
  );
  const [eveningStart, setEveningStart] = useState(() =>
    formatTimeInput(eveningShift?.startMinutes ?? EVENING_SHIFT_START_MINUTES),
  );
  const [eveningEnd, setEveningEnd] = useState(() =>
    formatTimeInput(eveningShift?.endMinutes ?? EVENING_SHIFT_END_MINUTES),
  );
  const [nightStart, setNightStart] = useState(() =>
    formatTimeInput(nightShift?.startMinutes ?? NIGHT_SHIFT_START_MINUTES),
  );
  const [nightEnd, setNightEnd] = useState(() =>
    formatTimeInput(nightShift?.endMinutes ?? NIGHT_SHIFT_END_MINUTES),
  );
  const [alarmsWanted, setAlarmsWanted] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [resumedDraft, setResumedDraft] = useState(false);
  const [editedWorkTimeFields, setEditedWorkTimeFields] = useState<SetupWorkTimeField[]>([]);
  const [confirmedSequenceSignature, setConfirmedSequenceSignature] = useState<string | null>(null);
  const [confirmedWorkTimeSignature, setConfirmedWorkTimeSignature] = useState<string | null>(null);
  const [openEditor, setOpenEditor] = useState<'sequence' | 'times' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void readSetupDraft().then((draft) => {
      if (!active) return;
      if (draft) {
        setStep(draft.presetId ? normalizeSetupScreenStep(draft.step) : 1);
        setPresetId(draft.presetId);
        setCategoryId(getWorkPatternCategoryId(draft.presetId));
        setSequence(draft.sequence);
        setPosition(draft.position);
        setReferenceDate(draft.referenceDate);
        setDayStart(draft.dayStart);
        setDayEnd(draft.dayEnd);
        setEveningStart(draft.eveningStart);
        setEveningEnd(draft.eveningEnd);
        setNightStart(draft.nightStart);
        setNightEnd(draft.nightEnd);
        setAlarmsWanted(draft.alarmsWanted);
        setEditedWorkTimeFields(draft.editedWorkTimeFields);
        setConfirmedSequenceSignature(draft.confirmedSequenceSignature);
        setConfirmedWorkTimeSignature(draft.confirmedWorkTimeSignature);
        setResumedDraft(isMeaningfulSetupDraft(draft));
      }
      setDraftReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const timeout = setTimeout(() => {
      void writeSetupDraft({
        version: SETUP_DRAFT_VERSION,
        step,
        presetId,
        sequence,
        position,
        referenceDate,
        dayStart,
        dayEnd,
        eveningStart,
        eveningEnd,
        nightStart,
        nightEnd,
        alarmsWanted,
        editedWorkTimeFields,
        confirmedSequenceSignature,
        confirmedWorkTimeSignature,
      }).catch(() => undefined);
    }, 180);
    return () => clearTimeout(timeout);
  }, [
    alarmsWanted,
    dayEnd,
    dayStart,
    draftReady,
    eveningEnd,
    eveningStart,
    editedWorkTimeFields,
    confirmedSequenceSignature,
    confirmedWorkTimeSignature,
    nightEnd,
    nightStart,
    presetId,
    position,
    referenceDate,
    sequence,
    step,
  ]);

  const workTimeValues = useMemo<SetupWorkTimeValues>(
    () => ({
      dayStart,
      dayEnd,
      eveningStart,
      eveningEnd,
      nightStart,
      nightEnd,
    }),
    [dayEnd, dayStart, eveningEnd, eveningStart, nightEnd, nightStart],
  );

  const validation = useMemo(
    () =>
      validateSetupInput({
        presetId,
        sequence,
        position,
        referenceDate,
        dayStart,
        dayEnd,
        eveningStart,
        eveningEnd,
        nightStart,
        nightEnd,
      }),
    [
      dayEnd,
      dayStart,
      eveningEnd,
      eveningStart,
      nightEnd,
      nightStart,
      position,
      presetId,
      referenceDate,
      sequence,
    ],
  );
  const preview = useMemo(
    () =>
      buildSetupPreview({
        activePosition: validation.activePosition,
        presetId,
        sequence,
        referenceDate,
      }),
    [presetId, referenceDate, sequence, validation.activePosition],
  );

  const sequenceSignature = useMemo(
    () => createSetupSequenceSignature(sequence),
    [sequence],
  );
  const workTimeSignature = useMemo(
    () => createSetupWorkTimeSignature({ sequence, values: workTimeValues }),
    [sequence, workTimeValues],
  );
  const sequenceConfirmed = confirmedSequenceSignature === sequenceSignature;
  const workTimesConfirmed = confirmedWorkTimeSignature === workTimeSignature;
  const scheduleSafety = useMemo(
    () =>
      analyzeScheduleSafety({
        sequence,
        shifts: createScheduleSafetyShifts(data.shiftTypes, {
          day: {
            startMinutes: validation.dayStartMinutes,
            endMinutes: validation.dayEndMinutes,
          },
          evening: {
            startMinutes: validation.eveningStartMinutes,
            endMinutes: validation.eveningEndMinutes,
          },
          night: {
            startMinutes: validation.nightStartMinutes,
            endMinutes: validation.nightEndMinutes,
          },
        }),
      }),
    [
      data.shiftTypes,
      sequence,
      validation.dayEndMinutes,
      validation.dayStartMinutes,
      validation.eveningEndMinutes,
      validation.eveningStartMinutes,
      validation.nightEndMinutes,
      validation.nightStartMinutes,
    ],
  );

  const effectiveAlarmsWanted = alarmsWanted && scheduleSafety.canEnableAlarms;
  const sequenceSummary = useMemo(
    () => createSetupSequenceOptions(sequence).map((item) => item.shortName).join(' → '),
    [sequence],
  );
  const workTimeSummary = useMemo(
    () =>
      validation.activeShiftIds
        .map((id) => {
          const label = id === 'day' ? '주간' : id === 'evening' ? '오후' : '야간';
          return `${label} ${workTimeValues[`${id}Start`]}~${workTimeValues[`${id}End`]}`;
        })
        .join(' · '),
    [validation.activeShiftIds, workTimeValues],
  );

  const selectPreset = (nextPresetId: WorkPatternPresetId) => {
    const nextTimes = applySetupPresetSuggestions({
      editedFields: editedWorkTimeFields,
      suggestedTimes: getSuggestedWorkTimesForPreset(nextPresetId),
      values: workTimeValues,
    });
    setCategoryId(getWorkPatternCategoryId(nextPresetId));
    setPresetId(nextPresetId);
    setSequence([...getWorkPatternPreset(nextPresetId).shiftTypeIds]);
    setPosition(null);
    setDayStart(nextTimes.dayStart);
    setDayEnd(nextTimes.dayEnd);
    setEveningStart(nextTimes.eveningStart);
    setEveningEnd(nextTimes.eveningEnd);
    setNightStart(nextTimes.nightStart);
    setNightEnd(nextTimes.nightEnd);
    setConfirmedSequenceSignature(null);
    setConfirmedWorkTimeSignature(null);
    setAlarmsWanted(false);
  };

  const selectCategory = (nextCategoryId: WorkPatternCategoryId) => {
    setCategoryId(nextCategoryId);
    if (nextCategoryId === 'weekday' || nextCategoryId === 'custom') {
      selectPreset(nextCategoryId);
      return;
    }
    if (getWorkPatternCategoryId(presetId) !== nextCategoryId) {
      setPresetId(null);
      setPosition(null);
      setConfirmedSequenceSignature(null);
      setConfirmedWorkTimeSignature(null);
    }
  };

  const changeSequence = (next: BaseWorkShiftId[]) => {
    const detectedPresetId = getWorkPatternPresetId(next);
    setSequence(next);
    setPresetId(detectedPresetId);
    setCategoryId(getWorkPatternCategoryId(detectedPresetId));
    setPosition(null);
    setAlarmsWanted(false);
  };

  const markWorkTimeEdited = (field: SetupWorkTimeField) => {
    setEditedWorkTimeFields((current) =>
      current.includes(field) ? current : [...current, field],
    );
    setAlarmsWanted(false);
  };

  const changeReferenceDate = (nextDate: string) => {
    setPosition((currentPosition) =>
      getPositionAfterReferenceDateChange({
        currentDate: referenceDate,
        nextDate,
        selectedPosition: currentPosition,
      }),
    );
    setReferenceDate(nextDate);
  };

  const save = async () => {
    if (!validation.referenceDateValid) {
      showDialog(
        '날짜를 확인해 주세요',
        '일정 적용 시작일을 연도-월-일 형식으로 정확히 입력해 주세요.',
      );
      return;
    }
    if (
      presetId === null ||
      validation.activePosition === null ||
      !validation.canComplete
    ) {
      showDialog(
        '근무 정보를 확인해 주세요',
        '실제 근무 순서와 시작·종료 시간을 확인해 주세요.',
      );
      return;
    }
    if (!sequenceConfirmed || !workTimesConfirmed) {
      showDialog(
        '회사 근무표를 확인해 주세요',
        '근무 순서와 시간을 각각 확인한 뒤 설정을 완료해 주세요.',
      );
      return;
    }
    if (!scheduleSafety.canSave) {
      showDialog(
        '겹치는 근무 시간을 수정해 주세요',
        '이전 근무가 끝나기 전에 다음 근무가 시작하고 있어요.',
      );
      return;
    }
    const payload = buildInitialSetupPayload({
      activePosition: validation.activePosition,
      alarmsWanted: effectiveAlarmsWanted,
      dayDuration: validation.dayDuration,
      dayEndMinutes: validation.dayEndMinutes,
      dayStartMinutes: validation.dayStartMinutes,
      eveningDuration: validation.eveningDuration,
      eveningEndMinutes: validation.eveningEndMinutes,
      eveningStartMinutes: validation.eveningStartMinutes,
      nightDuration: validation.nightDuration,
      nightEndMinutes: validation.nightEndMinutes,
      nightStartMinutes: validation.nightStartMinutes,
      presetId,
      sequence,
      referenceDate,
      safetyResult: scheduleSafety,
    });

    setSaving(true);
    try {
      let alarmReady = true;
      let alarmFailed = false;
      if (effectiveAlarmsWanted) {
        try {
          alarmReady = await requestAlarmAccess();
        } catch {
          alarmReady = false;
          alarmFailed = true;
        }
      }

      const saved = await completeInitialSetup(payload);
      if (!saved) {
        showDialog(
          '근무표를 저장하지 못했어요',
          '휴대폰 저장 공간을 확인한 뒤 다시 시도해 주세요.',
        );
        return;
      }

      await clearSetupDraft().catch(() => undefined);
      if (effectiveAlarmsWanted && !alarmReady) {
        showDialog(
          '근무표 설정을 마쳤어요',
          alarmFailed
            ? '알람을 준비하지 못했어요. 설정에서 다시 시도해 주세요.'
            : '필요한 알람 권한을 허용하면 근무 알람이 자동으로 준비돼요.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const goForward = () => {
    if (step === 1) {
      setOpenEditor(presetId === 'custom' ? 'sequence' : null);
      setStep(2);
      return;
    }
    if (step === 2) setStep(3);
  };

  const footer = (
    <View style={[styles.footerActions, stackFooter && styles.footerActionsStacked]}>
      {step > 1 ? (
        <AppButton
          disabled={saving}
          label="뒤로 가기"
          onPress={() => setStep((step - 1) as SetupScreenStep)}
          size="compact"
          style={styles.footerButton}
          variant="secondary"
        />
      ) : null}
      <AppButton
        disabled={
          !draftReady ||
          (step === 1
            ? presetId === null
            : step === 2
              ? saving ||
                !sequenceConfirmed ||
                !workTimesConfirmed ||
                !scheduleSafety.canSave
              : saving)
        }
        label={
          step === 1
            ? '순서와 시간 설정하기'
            : step === 2
              ? sequenceConfirmed && workTimesConfirmed && scheduleSafety.canSave
                ? '일정 적용 시작일 설정하기'
                : '순서와 시간을 확인해 주세요'
              : validation.canComplete
              ? '설정 완료하기'
              : '입력 확인하기'
        }
        loading={step === 3 && saving}
        onPress={step < 3 ? goForward : () => void save()}
        size="compact"
        style={styles.footerButton}
      />
    </View>
  );

  return (
    <Screen key={step} contentStyle={styles.screenContent} footer={footer}>
      <SetupHero step={step} />
      <SetupProgress step={step} />

      {resumedDraft ? (
        <StatusBanner
          icon="checkmark-circle"
          message="이전에 입력한 내용부터 이어서 설정해요."
          tone="info"
        />
      ) : null}

      {validation.normalizedToWeekday ? (
        <StatusBanner
          icon="calendar-outline"
          message="입력한 순서는 주간 고정과 같아 월~금 근무·토·일 휴무로 요일에 맞춰 적용해요."
          tone="info"
        />
      ) : null}

      {step === 1 ? (
        <WorkModeStep
          categoryId={categoryId}
          onSelectCategory={selectCategory}
          onSelect={selectPreset}
          presetId={presetId}
          stackOptions={stackModeOptions}
        />
      ) : null}

      {step === 2 && presetId !== null ? (
        <View style={styles.secondStep}>
          <View style={styles.stepHeading}>
            <AppText accessibilityRole="header" variant="heading" style={styles.centerText}>
              회사 순서와 시간을 확인해요
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.centerText}>
              대표 예시이며 회사 시간에 맞게 변경해 주세요.
            </AppText>
          </View>

          <Card style={styles.setupCard}>
            <View style={styles.summaryHeading}>
              <View style={styles.summaryCopy}>
                <AppText accessibilityRole="header" variant="label">
                  회사 근무 순서
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {presetId === 'weekday' ? '월~금 주간 · 토~일 휴무' : sequenceSummary}
                </AppText>
              </View>
              <AppButton
                label={openEditor === 'sequence' ? '접기' : '순서 수정'}
                onPress={() => setOpenEditor((current) => current === 'sequence' ? null : 'sequence')}
                size="compact"
                variant="secondary"
              />
            </View>

            {openEditor === 'sequence' ? (
              <View style={styles.sectionBlock}>
                {presetId === 'weekday' ? (
                  <WeekdaySchedule dayEnd={dayEnd} dayStart={dayStart} />
                ) : (
                  <PatternSequenceEditor sequence={sequence} onChange={changeSequence} />
                )}
                <AppButton
                  icon="checkmark"
                  label={sequenceConfirmed ? '순서 확인됨' : '이 순서가 맞아요'}
                  onPress={() => {
                    setConfirmedSequenceSignature(sequenceSignature);
                    setOpenEditor(null);
                  }}
                  variant={sequenceConfirmed ? 'secondary' : 'primary'}
                />
              </View>
            ) : sequenceConfirmed ? (
              <AppText variant="caption" tone="tertiary">순서를 확인했어요.</AppText>
            ) : (
              <AppText variant="caption" tone="secondary">순서를 열어 회사 일정과 확인해 주세요.</AppText>
            )}

            <View style={styles.divider} />
            <View style={styles.summaryHeading}>
              <View style={styles.summaryCopy}>
                <AppText accessibilityRole="header" variant="label">
                  근무 시간
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {workTimeSummary}
                </AppText>
              </View>
              <AppButton
                label={openEditor === 'times' ? '접기' : '시간 수정'}
                onPress={() => setOpenEditor((current) => current === 'times' ? null : 'times')}
                size="compact"
                variant="secondary"
              />
            </View>

            {openEditor === 'times' ? (
              <View style={styles.sectionBlock}>
                <WorkTimeEditor
                  dayColor={dayAppearance?.accentColor ?? palette.mintDark}
                  dayDuration={validation.dayDuration}
                  dayEnd={dayEnd}
                  dayStart={dayStart}
                  eveningColor={eveningAppearance?.accentColor ?? palette.indigoDark}
                  eveningDuration={validation.eveningDuration}
                  eveningEnd={eveningEnd}
                  eveningStart={eveningStart}
                  nightColor={nightAppearance?.accentColor ?? palette.violet}
                  nightDuration={validation.nightDuration}
                  nightEnd={nightEnd}
                  nightStart={nightStart}
                  onChangeDayEnd={(value) => {
                    markWorkTimeEdited('dayEnd');
                    setDayEnd(value);
                  }}
                  onChangeDayStart={(value) => {
                    markWorkTimeEdited('dayStart');
                    setDayStart(value);
                  }}
                  onChangeEveningEnd={(value) => {
                    markWorkTimeEdited('eveningEnd');
                    setEveningEnd(value);
                  }}
                  onChangeEveningStart={(value) => {
                    markWorkTimeEdited('eveningStart');
                    setEveningStart(value);
                  }}
                  onChangeNightEnd={(value) => {
                    markWorkTimeEdited('nightEnd');
                    setNightEnd(value);
                  }}
                  onChangeNightStart={(value) => {
                    markWorkTimeEdited('nightStart');
                    setNightStart(value);
                  }}
                  showDay={validation.activeShiftIds.includes('day')}
                  showEvening={validation.activeShiftIds.includes('evening')}
                  showNight={validation.activeShiftIds.includes('night')}
                />
                <AppButton
                  disabled={!validation.activeShiftIds.every((id) => validation.shifts[id].duration !== null)}
                  icon="checkmark"
                  label={workTimesConfirmed ? '시간 확인됨' : '이 시간이 맞아요'}
                  onPress={() => {
                    setConfirmedWorkTimeSignature(workTimeSignature);
                    setOpenEditor(null);
                  }}
                  variant={workTimesConfirmed ? 'secondary' : 'primary'}
                />
              </View>
            ) : workTimesConfirmed ? (
              <AppText variant="caption" tone="tertiary">시간을 확인했어요.</AppText>
            ) : (
              <AppText variant="caption" tone="secondary">시간을 열어 회사 시간과 확인해 주세요.</AppText>
            )}
          </Card>

          {!scheduleSafety.canSave ? (
            <StatusBanner
              icon="alert-circle-outline"
              message="이전 근무가 끝나기 전에 다음 근무가 시작해요. 순서나 시간을 수정해야 저장할 수 있어요."
              tone="warning"
            />
          ) : !scheduleSafety.canEnableAlarms ? (
            <StatusBanner
              icon="alarm-outline"
              message="다음 근무 알람이 이전 근무 중 울리는 순서예요. 일정은 저장할 수 있지만 수정 전에는 근무 알람을 켤 수 없어요."
              tone="warning"
            />
          ) : null}
        </View>
      ) : null}

      {step === 3 && presetId !== null ? (
        <View style={styles.secondStep}>
          <View style={styles.stepHeading}>
            <AppText accessibilityRole="header" variant="heading" style={styles.centerText}>
              일정 적용 시작일을 설정해요
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.centerText}>
              이 날짜의 실제 근무를 맞추면 이후 일정이 자동으로 이어져요.
            </AppText>
          </View>

          <Card style={styles.setupCard}>
            <View style={styles.sectionCopy}>
              <AppText accessibilityRole="header" variant="label">일정 적용 시작일</AppText>
              <AppText variant="caption" tone="secondary">
                이 날짜 전 일정은 만들지 않아요.
              </AppText>
            </View>
            <View style={[styles.dateRow, stackFooter && styles.dateRowStacked]}>
              <AppField
                accessibilityLabel="일정 적용 시작일"
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={[styles.dateField, stackFooter && styles.dateFieldStacked]}
                errorText={validation.referenceDateValid ? undefined : '연도-월-일 형식으로 입력해 주세요.'}
                keyboardType="numbers-and-punctuation"
                label="날짜"
                maxLength={10}
                onChangeText={changeReferenceDate}
                placeholder={today}
                selectTextOnFocus
                value={referenceDate}
              />
              <AppButton
                accessibilityHint="일정 적용 시작일을 오늘로 바꿔요."
                label="오늘로 변경하기"
                onPress={() => changeReferenceDate(today)}
                size="compact"
                style={[styles.todayButton, stackFooter && styles.todayButtonStacked]}
                variant="secondary"
              />
            </View>

            {validation.effectivePresetId !== 'weekday' ? (
              <>
                <View style={styles.divider} />
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionCopy}>
                    <AppText accessibilityRole="header" variant="label">
                      {validation.referenceDateValid
                        ? `${formatKoreanDate(referenceDate)}의 실제 근무`
                        : '일정 적용 시작일의 실제 근무'}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      근무를 시작한 날짜를 기준으로 정확한 순번을 선택해요.
                    </AppText>
                  </View>
                  <RotationPositionPicker
                    compact={compactPositionOptions}
                    onSelect={setPosition}
                    position={position}
                    sequence={sequence}
                    shiftTypes={data.shiftTypes}
                  />
                </View>
              </>
            ) : null}
          </Card>

          <SetupPreview items={preview} shiftTypes={data.shiftTypes} today={today} />

          {Platform.OS === 'android' ? (
            <Card density="compact" style={styles.alarmCard}>
              <ToggleRow
                disabled={!scheduleSafety.canEnableAlarms}
                icon="alarm-outline"
                onValueChange={setAlarmsWanted}
                subtitle={
                  scheduleSafety.canEnableAlarms
                    ? '설정 완료 후 필요한 권한을 안내해요. 지금 건너뛰어도 설정의 알람에서 나중에 켤 수 있어요.'
                    : '다음 알람이 이전 근무 중 울리지 않도록 순서나 시간을 먼저 수정해 주세요.'
                }
                title="근무 알람 준비하기"
                value={effectiveAlarmsWanted}
              />
            </Card>
          ) : null}

          <Card style={styles.storageCard}>
            <AppText accessibilityRole="header" variant="label">
              자료는 이 휴대폰에만 저장돼요
            </AppText>
            <AppText tone="secondary" variant="caption">
              서버로 보내지 않아요. 앱을 삭제하면 근무표·메모·설정도 함께 사라져요. 설정 후 데이터 메뉴에서 외부 백업을 만들 수 있어요.
            </AppText>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screenContent: {
      gap: spacing.medium,
      paddingTop: spacing.medium,
    },
    footerActions: { flexDirection: 'row', gap: spacing.small },
    footerActionsStacked: { flexDirection: 'column' },
    footerButton: { flex: 1 },
    secondStep: { gap: spacing.medium },
    stepHeading: { gap: spacing.tiny, paddingVertical: spacing.tiny },
    centerText: { textAlign: 'center' },
    setupCard: { gap: spacing.large },
    sectionBlock: { gap: spacing.medium },
    sectionCopy: { minWidth: 0, gap: spacing.tiny },
    summaryHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    summaryCopy: { minWidth: 180, flex: 1, gap: spacing.tiny },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.small,
    },
    dateRowStacked: { flexDirection: 'column', alignItems: 'stretch' },
    dateField: { width: 'auto', minWidth: 0, flex: 1 },
    dateFieldStacked: { width: '100%', flex: 0 },
    todayButton: { minWidth: 132, marginBottom: spacing.tiny },
    todayButtonStacked: { width: '100%', marginBottom: 0 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line },
    alarmCard: {
      overflow: 'hidden',
      borderRadius: radii.large,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    storageCard: { gap: spacing.small },
  });
}
