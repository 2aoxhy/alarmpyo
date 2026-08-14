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
  buildInitialSetupPayload,
  buildSetupPreview,
  getSuggestedWorkTimesForPreset,
  normalizeSetupScreenStep,
  shouldApplySetupPresetSuggestion,
  type SetupScreenStep,
  validateSetupInput,
} from '@/features/setup/setup-flow';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  clearSetupDraft,
  readSetupDraft,
  SETUP_DRAFT_VERSION,
  writeSetupDraft,
} from '@/services/setup-draft-service';
import { useAppStore } from '@/store/app-store';
import { formatTimeInput } from '@/utils/shift-time';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  getPositionAfterReferenceDateChange,
  getWorkPatternPreset,
  type BaseWorkShiftId,
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
  const [workTimesEdited, setWorkTimesEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void readSetupDraft().then((draft) => {
      if (!active) return;
      if (draft) {
        setStep(draft.presetId ? normalizeSetupScreenStep(draft.step) : 1);
        setPresetId(draft.presetId);
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
        setResumedDraft(true);
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
    nightEnd,
    nightStart,
    presetId,
    position,
    referenceDate,
    sequence,
    step,
  ]);

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

  const selectPreset = (nextPresetId: WorkPatternPresetId) => {
    const suggestedTimes =
      shouldApplySetupPresetSuggestion({ resumedDraft, workTimesEdited })
        ? getSuggestedWorkTimesForPreset(nextPresetId)
        : null;
    setPresetId(nextPresetId);
    setSequence([...getWorkPatternPreset(nextPresetId).shiftTypeIds]);
    setPosition(null);
    if (suggestedTimes?.day) {
      setDayStart(suggestedTimes.day.start);
      setDayEnd(suggestedTimes.day.end);
    }
    if (suggestedTimes?.evening) {
      setEveningStart(suggestedTimes.evening.start);
      setEveningEnd(suggestedTimes.evening.end);
    }
    if (suggestedTimes?.night) {
      setNightStart(suggestedTimes.night.start);
      setNightEnd(suggestedTimes.night.end);
    }
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
        '첫 근무일을 연도-월-일 형식으로 정확히 입력해 주세요.',
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

    const payload = buildInitialSetupPayload({
      activePosition: validation.activePosition,
      alarmsWanted,
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
    });

    setSaving(true);
    try {
      let alarmReady = true;
      let alarmFailed = false;
      if (alarmsWanted) {
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
      if (alarmsWanted && !alarmReady) {
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
          (step === 1 ? presetId === null : saving)
        }
        label={
          step === 1
            ? '순서와 시간 설정하기'
            : step === 2
              ? '첫 근무일 설정하기'
              : validation.canComplete
              ? '설정 완료하기'
              : '입력 확인하기'
        }
        loading={step === 3 && saving}
        onPress={step < 3 ? () => setStep((step + 1) as SetupScreenStep) : () => void save()}
        size="compact"
        style={styles.footerButton}
      />
    </View>
  );

  return (
    <Screen contentStyle={styles.screenContent} footer={footer}>
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
            {presetId === 'weekday' ? (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionCopy}>
                  <AppText accessibilityRole="header" variant="label">
                    주간 고정 일정
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    월요일부터 금요일까지 근무하고 토·일요일은 쉬어요.
                  </AppText>
                </View>
                <WeekdaySchedule dayEnd={dayEnd} dayStart={dayStart} />
              </View>
            ) : (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionCopy}>
                  <AppText accessibilityRole="header" variant="label">
                    근무 반복 순서
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    1~42일 안에서 날짜를 누르거나 더하고 빼서 회사 순서와 맞춰요.
                  </AppText>
                </View>
                <PatternSequenceEditor sequence={sequence} onChange={(next) => {
                  setSequence(next);
                  setPosition(null);
                }} />
              </View>
            )}

            <View style={styles.divider} />
            <View style={styles.sectionBlock}>
              <View style={styles.sectionCopy}>
                <AppText accessibilityRole="header" variant="label">
                  근무 시간
                </AppText>
                <AppText variant="caption" tone="secondary">
                  근무 사이에 인수인계 시간이 겹쳐도 저장할 수 있어요.
                </AppText>
              </View>
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
                  setWorkTimesEdited(true);
                  setDayEnd(value);
                }}
                onChangeDayStart={(value) => {
                  setWorkTimesEdited(true);
                  setDayStart(value);
                }}
                onChangeEveningEnd={(value) => {
                  setWorkTimesEdited(true);
                  setEveningEnd(value);
                }}
                onChangeEveningStart={(value) => {
                  setWorkTimesEdited(true);
                  setEveningStart(value);
                }}
                onChangeNightEnd={(value) => {
                  setWorkTimesEdited(true);
                  setNightEnd(value);
                }}
                onChangeNightStart={(value) => {
                  setWorkTimesEdited(true);
                  setNightStart(value);
                }}
                showDay={validation.activeShiftIds.includes('day')}
                showEvening={validation.activeShiftIds.includes('evening')}
                showNight={validation.activeShiftIds.includes('night')}
              />
            </View>
          </Card>
        </View>
      ) : null}

      {step === 3 && presetId !== null ? (
        <View style={styles.secondStep}>
          <View style={styles.stepHeading}>
            <AppText accessibilityRole="header" variant="heading" style={styles.centerText}>
              첫 근무일을 설정해요
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.centerText}>
              날짜와 그날의 실제 근무를 맞추면 이후 일정이 자동으로 이어져요.
            </AppText>
          </View>

          <Card style={styles.setupCard}>
            <View style={styles.sectionCopy}>
              <AppText accessibilityRole="header" variant="label">첫 근무일</AppText>
              <AppText variant="caption" tone="secondary">
                이 날짜 전 일정은 만들지 않아요.
              </AppText>
            </View>
            <View style={[styles.dateRow, stackFooter && styles.dateRowStacked]}>
              <AppField
                accessibilityLabel="첫 근무일"
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
                accessibilityHint="첫 근무일을 오늘로 바꿔요."
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
                        : '첫 근무일의 실제 근무'}
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
                icon="alarm-outline"
                onValueChange={setAlarmsWanted}
                subtitle="켜면 설정 완료 후 필요한 권한을 하나씩 안내해요. 정확한 알람·일반 알림·전체 화면 알람은 지금 건너뛰어도 나중에 알람에서 다시 설정할 수 있어요."
                title="근무 알람 준비하기"
                value={alarmsWanted}
              />
            </Card>
          ) : null}

          <Card style={styles.storageCard}>
            <AppText accessibilityRole="header" variant="label">
              자료는 이 휴대폰에만 저장돼요
            </AppText>
            <AppText tone="secondary" variant="caption">
              계정이나 자체 서버로 보내지 않아요. 앱을 삭제하면 근무표·메모·설정도 함께 사라져요.
            </AppText>
            <AppText tone="secondary" variant="caption">
              설정을 마친 뒤 설정의 데이터 메뉴에서 백업 파일을 만들어 다른 위치에 보관할 수 있어요.
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
