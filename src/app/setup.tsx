import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { DatePickerField } from '@/components/date-picker-field';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner, ToggleRow } from '@/design-system';
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
  buildSetupPreview,
  createSetupSequenceOptions,
  getSuggestedWorkTimesForPreset,
  normalizeSetupScreenStep,
  type SetupScreenStep,
  type SetupWorkTimeValues,
} from '@/features/setup/setup-flow';
import {
  activeShiftIds,
  buildWorkPatternMutation,
  createInitialWorkPatternDraft,
  createWorkPatternSummarySignature,
  getFirstWorkPatternIssueTarget,
  restoreInitialWorkPatternDraft,
  validateWorkPatternDraft,
  type EditableWorkShiftId,
  type WorkPatternDraft,
} from '@/features/setup/work-pattern-draft';
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
import { useAppStore } from '@/store/app-store';
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
  const stackTimeInputs = width <= 320 || fontScale >= 1.3;
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
  const [initialWorkPatternDraft] = useState<WorkPatternDraft>(() =>
    createInitialWorkPatternDraft({ shiftTypes: data.shiftTypes, today }),
  );
  const [draft, setDraft] = useState<WorkPatternDraft>(() => initialWorkPatternDraft);
  const [step, setStep] = useState<SetupScreenStep>(1);
  const [draftReady, setDraftReady] = useState(false);
  const [resumedDraft, setResumedDraft] = useState(false);
  const [editedWorkTimeFields, setEditedWorkTimeFields] = useState<SetupWorkTimeField[]>([]);
  const [openEditor, setOpenEditor] = useState<'sequence' | 'times' | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [focusShiftTypeId, setFocusShiftTypeId] = useState<EditableWorkShiftId | null>(null);
  const issueHeadingRef = useRef<View>(null);

  const { alarmsWanted, categoryId, position, presetId, referenceDate, sequence, times } = draft;
  const dayStart = times.day.start;
  const dayEnd = times.day.end;
  const eveningStart = times.evening.start;
  const eveningEnd = times.evening.end;
  const nightStart = times.night.start;
  const nightEnd = times.night.end;

  useEffect(() => {
    let active = true;
    void readSetupDraft().then((draft) => {
      if (!active) return;
      if (draft) {
        setStep(draft.presetId ? normalizeSetupScreenStep(draft.step) : 1);
        setDraft(restoreInitialWorkPatternDraft(initialWorkPatternDraft, draft));
        setEditedWorkTimeFields(draft.editedWorkTimeFields);
        setResumedDraft(isMeaningfulSetupDraft(draft));
      }
      setDraftReady(true);
    });
    return () => {
      active = false;
    };
  }, [initialWorkPatternDraft]);

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
        confirmedSequenceSignature: draft.summaryConfirmation,
        confirmedWorkTimeSignature: draft.summaryConfirmation,
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
    draft.summaryConfirmation,
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
    () => validateWorkPatternDraft(draft, data.shiftTypes),
    [data.shiftTypes, draft],
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

  const summarySignature = useMemo(() => createWorkPatternSummarySignature(draft), [draft]);
  const summaryConfirmed = draft.summaryConfirmation === summarySignature;
  const sequenceConfirmed = summaryConfirmed;
  const workTimesConfirmed = summaryConfirmed;
  const scheduleSafety = validation.safety;
  const referenceDateValid = !validation.issues.some((issue) => issue.code === 'date-invalid');
  const normalizedToWeekday =
    presetId !== null && presetId !== 'weekday' && validation.effectivePresetId === 'weekday';
  const stepTwoBlockingIssues = validation.issues.filter(
    (issue) =>
      issue.code !== 'summary-unconfirmed' &&
      issue.code !== 'new-shift-review-required' &&
      issue.code !== 'position-required',
  );

  useEffect(() => {
    if (focusRequest <= 0 || focusShiftTypeId !== null) return;
    const timeout = setTimeout(() => {
      const node = findNodeHandle(issueHeadingRef.current);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    }, 0);
    return () => clearTimeout(timeout);
  }, [focusRequest, focusShiftTypeId, step]);

  const focusFirstIssue = (checked = validation) => {
    const target = getFirstWorkPatternIssueTarget(checked);
    if (!target) return;
    setStep(target.step);
    setOpenEditor(target.editor);
    setFocusShiftTypeId(target.shiftTypeId);
    setFocusRequest((current) => current + 1);
  };

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

  const invalidateSummary = (next: WorkPatternDraft): WorkPatternDraft => ({
    ...next,
    summaryConfirmation: null,
  });

  const selectPreset = (nextPresetId: WorkPatternPresetId) => {
    const nextSequence = [...getWorkPatternPreset(nextPresetId).shiftTypeIds];
    const eveningActivated =
      !draft.sequence.includes('evening') && nextSequence.includes('evening');
    const nextTimes = applySetupPresetSuggestions({
      editedFields: editedWorkTimeFields,
      suggestedTimes: getSuggestedWorkTimesForPreset(nextPresetId),
      values: workTimeValues,
    });
    setDraft((current) =>
      invalidateSummary({
        ...current,
        categoryId: getWorkPatternCategoryId(nextPresetId),
        presetId: nextPresetId,
        sequence: nextSequence,
        position: null,
        times: {
          day: { start: nextTimes.dayStart, end: nextTimes.dayEnd },
          evening: { start: nextTimes.eveningStart, end: nextTimes.eveningEnd },
          night: { start: nextTimes.nightStart, end: nextTimes.nightEnd },
        },
        alarmsWanted: false,
        reviewedShiftIds: eveningActivated
          ? current.reviewedShiftIds.filter((id) => id !== 'evening')
          : current.reviewedShiftIds,
      }),
    );
    if (eveningActivated) setOpenEditor('times');
  };

  const selectCategory = (nextCategoryId: WorkPatternCategoryId) => {
    if (nextCategoryId === 'weekday' || nextCategoryId === 'custom') {
      selectPreset(nextCategoryId);
      return;
    }
    if (draft.categoryId !== nextCategoryId) {
      setDraft((current) =>
        invalidateSummary({
          ...current,
          categoryId: nextCategoryId,
          presetId: null,
          position: null,
        }),
      );
    }
  };

  const changeSequence = (next: BaseWorkShiftId[]) => {
    const eveningActivated = !draft.sequence.includes('evening') && next.includes('evening');
    const detectedPresetId = getWorkPatternPresetId(next);
    setDraft((current) =>
      invalidateSummary({
        ...current,
        sequence: [...next],
        presetId: detectedPresetId,
        categoryId: getWorkPatternCategoryId(detectedPresetId),
        position: null,
        alarmsWanted: false,
        reviewedShiftIds: eveningActivated
          ? current.reviewedShiftIds.filter((id) => id !== 'evening')
          : current.reviewedShiftIds,
      }),
    );
    if (eveningActivated) setOpenEditor('times');
  };

  const changeTime = (
    shiftTypeId: EditableWorkShiftId,
    field: 'start' | 'end',
    value: string,
  ) => {
    setDraft((current) =>
      invalidateSummary({
        ...current,
        times: {
          ...current.times,
          [shiftTypeId]: { ...current.times[shiftTypeId], [field]: value },
        },
        alarmsWanted: false,
      }),
    );
  };

  const markWorkTimeEdited = (field: SetupWorkTimeField) => {
    setEditedWorkTimeFields((current) =>
      current.includes(field) ? current : [...current, field],
    );
  };

  const changeReferenceDate = (nextDate: string) => {
    setDraft((current) => ({
      ...current,
      position: getPositionAfterReferenceDateChange({
        currentDate: current.referenceDate,
        nextDate,
        selectedPosition: current.position,
      }),
      scheduleStartDate: nextDate,
      referenceDate: nextDate,
    }));
  };

  const save = async () => {
    if (!referenceDateValid) {
      focusFirstIssue();
      showDialog(
        '날짜를 확인해야 합니다',
        '일정 적용 시작일을 연도-월-일 형식으로 정확히 입력해야 합니다.',
      );
      return;
    }
    if (
      presetId === null ||
      validation.activePosition === null ||
      !validation.activeShiftIds.every((id) => validation.shifts[id].duration !== null)
    ) {
      focusFirstIssue();
      showDialog(
        '근무 정보를 확인해야 합니다',
        '실제 근무 순서와 시작·종료 시간을 확인해야 합니다.',
      );
      return;
    }
    if (!sequenceConfirmed || !workTimesConfirmed) {
      focusFirstIssue();
      showDialog(
        '회사 근무표를 확인해야 합니다',
        '근무 순서와 시간을 확인한 뒤 설정을 완료해야 합니다.',
      );
      return;
    }
    if (!scheduleSafety.canSave) {
      focusFirstIssue();
      showDialog(
        '겹치는 근무 시간을 수정해야 합니다',
        '이전 근무가 끝나기 전에 다음 근무가 시작합니다.',
      );
      return;
    }
    const checked = validateWorkPatternDraft(draft, data.shiftTypes);
    if (!checked.canSave) {
      focusFirstIssue(checked);
      showDialog(
        '근무표를 확인해야 합니다',
        '표시된 순서와 시간, 일정 적용 시작일을 확인해야 합니다.',
      );
      return;
    }
    const mutation = buildWorkPatternMutation(draft, data.shiftTypes);
    const payload = {
      ...mutation,
      notificationsEnabled: effectiveAlarmsWanted,
    };

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
          '근무표를 저장하지 못했습니다',
          '휴대폰 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
        );
        return;
      }

      await clearSetupDraft().catch(() => undefined);
      if (effectiveAlarmsWanted && !alarmReady) {
        showDialog(
          '근무표 설정을 마쳤습니다',
          alarmFailed
            ? '알람을 준비하지 못했습니다. 설정에서 다시 시도해야 합니다.'
            : '필요한 알람 권한을 허용하면 근무 알람이 자동으로 준비됩니다.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const goForward = () => {
    if (step === 1) {
      setOpenEditor(
        sequence.includes('evening') ? 'times' : presetId === 'custom' ? 'sequence' : null,
      );
      setStep(2);
      return;
    }
    if (step === 2) {
      setDraft((current) => {
        const reviewed = [
          ...new Set([...current.reviewedShiftIds, ...activeShiftIds(current.sequence)]),
        ];
        const next = { ...current, reviewedShiftIds: reviewed };
        return { ...next, summaryConfirmation: createWorkPatternSummarySignature(next) };
      });
      setOpenEditor(null);
      setStep(3);
    }
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
                stepTwoBlockingIssues.length > 0
              : saving)
        }
        label={
          step === 1
            ? '순서와 시간 설정하기'
            : step === 2
              ? scheduleSafety.canSave
                ? '이대로 사용'
                : '겹치는 시간 확인'
              : validation.canSave
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
      <SetupProgress compact={width <= 320 || fontScale >= 1.3} step={step} />

      {resumedDraft ? (
        <StatusBanner
          icon="checkmark-circle"
          message="이전에 입력한 내용부터 이어서 설정합니다."
          tone="info"
        />
      ) : null}

      {normalizedToWeekday ? (
        <StatusBanner
          icon="calendar-outline"
          message="입력한 순서는 주간 고정과 같으므로 월~금 근무·토·일 휴무로 적용됩니다."
          tone="info"
        />
      ) : null}

      {step === 1 ? (
        <View
          accessibilityLabel="근무 방식 선택"
          accessible
          collapsable={false}
          ref={issueHeadingRef}>
          <WorkModeStep
            categoryId={categoryId}
            onSelectCategory={selectCategory}
            onSelect={selectPreset}
            presetId={presetId}
            stackOptions={stackModeOptions}
          />
        </View>
      ) : null}

      {step === 2 && presetId !== null ? (
        <View style={styles.secondStep}>
          <View
            accessibilityLabel="회사 순서와 시간 확인"
            accessible
            collapsable={false}
            ref={issueHeadingRef}
            style={styles.stepHeading}>
            <AppText accessibilityRole="header" variant="heading" style={styles.centerText}>
              회사 순서와 시간을 확인합니다
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.centerText}>
              대표 예시를 확인하고 회사 시간과 다르면 필요한 항목만 수정해야 합니다.
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
              </View>
            ) : null}

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
                  dayDuration={validation.shifts.day.duration}
                  dayEnd={dayEnd}
                  dayStart={dayStart}
                  eveningColor={eveningAppearance?.accentColor ?? palette.indigoDark}
                  eveningDuration={validation.shifts.evening.duration}
                  eveningEnd={eveningEnd}
                  eveningStart={eveningStart}
                  focusRequest={focusRequest}
                  focusShiftTypeId={focusShiftTypeId}
                  nightColor={nightAppearance?.accentColor ?? palette.violet}
                  nightDuration={validation.shifts.night.duration}
                  nightEnd={nightEnd}
                  nightStart={nightStart}
                  onChangeDayEnd={(value) => {
                    markWorkTimeEdited('dayEnd');
                    changeTime('day', 'end', value);
                  }}
                  onChangeDayStart={(value) => {
                    markWorkTimeEdited('dayStart');
                    changeTime('day', 'start', value);
                  }}
                  onChangeEveningEnd={(value) => {
                    markWorkTimeEdited('eveningEnd');
                    changeTime('evening', 'end', value);
                  }}
                  onChangeEveningStart={(value) => {
                    markWorkTimeEdited('eveningStart');
                    changeTime('evening', 'start', value);
                  }}
                  onChangeNightEnd={(value) => {
                    markWorkTimeEdited('nightEnd');
                    changeTime('night', 'end', value);
                  }}
                  onChangeNightStart={(value) => {
                    markWorkTimeEdited('nightStart');
                    changeTime('night', 'start', value);
                  }}
                  showDay={validation.activeShiftIds.includes('day')}
                  showEvening={validation.activeShiftIds.includes('evening')}
                  showNight={validation.activeShiftIds.includes('night')}
                  stackTimeInputs={stackTimeInputs}
                />
              </View>
            ) : null}

            <StatusBanner
              icon={sequenceConfirmed && workTimesConfirmed ? 'checkmark-circle' : 'alert-circle-outline'}
              message={
                sequenceConfirmed && workTimesConfirmed
                  ? '확인한 순서와 시간입니다.'
                  : '아래의 “이대로 사용”을 누르면 순서와 시간을 한 번에 확인합니다.'
              }
              tone="info"
            />
          </Card>

          {!scheduleSafety.canSave ? (
            <StatusBanner
              icon="alert-circle-outline"
              message="이전 근무가 끝나기 전에 다음 근무가 시작합니다. 순서나 시간을 수정해야 저장할 수 있습니다."
              tone="warning"
            />
          ) : !scheduleSafety.canEnableAlarms ? (
            <StatusBanner
              icon="alarm-outline"
              message="다음 근무 알람이 이전 근무 중 울리는 순서입니다. 일정은 저장할 수 있지만 수정 전에는 근무 알람을 켤 수 없습니다."
              tone="warning"
            />
          ) : null}
        </View>
      ) : null}

      {step === 3 && presetId !== null ? (
        <View style={styles.secondStep}>
          <View
            accessibilityLabel="일정 적용 시작일 설정"
            accessible
            collapsable={false}
            ref={issueHeadingRef}
            style={styles.stepHeading}>
            <AppText accessibilityRole="header" variant="heading" style={styles.centerText}>
              일정 적용 시작일을 설정합니다
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.centerText}>
              이 날짜의 실제 근무를 맞추면 이후 일정이 자동으로 이어집니다.
            </AppText>
          </View>

          <Card style={styles.setupCard}>
            <View style={styles.sectionCopy}>
              <AppText accessibilityRole="header" variant="label">일정 적용 시작일</AppText>
              <AppText variant="caption" tone="secondary">
                이 날짜 전 일정은 만들지 않습니다.
              </AppText>
            </View>
            <DatePickerField
              accessibilityLabel="일정 적용 시작일"
              onChange={changeReferenceDate}
              placeholder={today}
              today={today}
              value={referenceDate}
            />

            {validation.effectivePresetId !== 'weekday' ? (
              <>
                <View style={styles.divider} />
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionCopy}>
                    <AppText accessibilityRole="header" variant="label">
                      {referenceDateValid
                        ? `${formatKoreanDate(referenceDate)}의 실제 근무`
                        : '일정 적용 시작일의 실제 근무'}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      근무를 시작한 날짜를 기준으로 정확한 순번을 선택해야 합니다.
                    </AppText>
                  </View>
                  <RotationPositionPicker
                    compact={compactPositionOptions}
                    onSelect={(nextPosition) =>
                      setDraft((current) => ({ ...current, position: nextPosition }))
                    }
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
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, alarmsWanted: value }))
                }
                subtitle={
                  scheduleSafety.canEnableAlarms
                    ? '설정 완료 후 필요한 권한을 안내합니다. 지금 건너뛰어도 설정의 알람에서 나중에 켤 수 있습니다.'
                    : '다음 알람이 이전 근무 중 울리지 않도록 순서나 시간을 먼저 수정해야 합니다.'
                }
                title="근무 알람 준비하기"
                value={effectiveAlarmsWanted}
              />
            </Card>
          ) : null}

          <Card style={styles.storageCard}>
            <AppText accessibilityRole="header" variant="label">
              자료는 이 휴대폰에만 저장됩니다
            </AppText>
            <AppText tone="secondary" variant="caption">
              서버로 전송하지 않습니다. 앱을 삭제하면 근무표·메모·설정도 함께 삭제됩니다. 설정 후 데이터 메뉴에서 외부 백업을 만들 수 있습니다.
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
