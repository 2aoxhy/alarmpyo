import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { DatePickerField } from '@/components/date-picker-field';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { PageHeader, StatusBanner, Surface } from '@/design-system';
import {
  triggerNotificationFeedback,
  triggerSelectionFeedback,
} from '@/features/feedback/feedback-controller';
import {
  PatternSequenceEditor,
  RotationPositionPicker,
  SetupProgress,
  WeekdaySchedule,
  WorkModeStep,
  WorkTimeEditor,
} from '@/features/setup/setup-components';
import { validateSetupInput } from '@/features/setup/setup-flow';
import {
  buildWorkPatternMutation,
  createExistingWorkPatternDraft,
  getFirstWorkPatternIssueTarget,
  getNewlyActiveShiftIds,
  getUnresolvedLegacyShiftIds,
  isWorkPatternSequenceChanged,
  resolveWorkPatternSaveOutcome,
  validateWorkPatternDraft,
  type EditableWorkShiftId,
  type WorkPatternDraft,
} from '@/features/setup/work-pattern-draft';
import { createWorkPatternEditorController } from '@/features/setup/work-pattern-editor-controller';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  arePatternEditorDataEqual,
  selectSettingsData,
} from '@/features/settings/settings-store-selection';
import { useAppCommands, useAppSelector } from '@/store/app-store';
import { toDateKey } from '@/utils/date';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  type BaseWorkShiftId,
  type WorkPatternCategoryId,
  type WorkPatternPresetId,
} from '@/utils/work-pattern';

type Editor = 'sequence' | 'times' | null;
type Step = 1 | 2 | 3;

export default function PatternEditorScreen() {
  const { showDialog } = useAppDialog();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackOptions = width < 430 || fontScale >= 1.3;
  const compactPositions = width < 390 || fontScale >= 1.3;
  const stackFooter = width <= 320 || fontScale >= 1.3;
  const data = useAppSelector(selectSettingsData, arePatternEditorDataEqual);
  const { createBackup, resyncAlarms, updatePatternDetailed } = useAppCommands();
  const navigation = useNavigation();
  const allowNavigation = useRef(false);
  const [today] = useState(() => toDateKey(new Date()));
  const [initialDraft] = useState<WorkPatternDraft>(() =>
    createExistingWorkPatternDraft({ data, today }),
  );
  const [draft, setDraft] = useState<WorkPatternDraft>(() => initialDraft);
  const editorController = useMemo(
    () => createWorkPatternEditorController('edit'),
    [],
  );
  const [step, setStep] = useState<Step>(1);
  const [openEditor, setOpenEditor] = useState<Editor>(null);
  const [saving, setSaving] = useState(false);
  const [revealValidation, setRevealValidation] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [focusShiftTypeId, setFocusShiftTypeId] = useState<EditableWorkShiftId | null>(null);
  const issueHeadingRef = useRef<View>(null);

  const dayShift = data.shiftTypes.find((shift) => shift.id === 'day');
  const eveningShift = data.shiftTypes.find((shift) => shift.id === 'evening');
  const nightShift = data.shiftTypes.find((shift) => shift.id === 'night');
  const dayAppearance = dayShift ? getShiftAppearance(dayShift, palette, isDark) : null;
  const eveningAppearance = eveningShift
    ? getShiftAppearance(eveningShift, palette, isDark)
    : null;
  const nightAppearance = nightShift ? getShiftAppearance(nightShift, palette, isDark) : null;

  const validation = useMemo(
    () => validateWorkPatternDraft(draft, data.shiftTypes),
    [data.shiftTypes, draft],
  );
  const timeValidation = useMemo(
    () =>
      validateSetupInput({
        presetId: draft.presetId,
        sequence: draft.sequence,
        position: draft.position,
        referenceDate: draft.referenceDate,
        dayStart: draft.times.day.start,
        dayEnd: draft.times.day.end,
        eveningStart: draft.times.evening.start,
        eveningEnd: draft.times.evening.end,
        nightStart: draft.times.night.start,
        nightEnd: draft.times.night.end,
      }),
    [draft],
  );
  const patternIdentityChanged = isWorkPatternSequenceChanged(draft);
  const hasUnsavedChanges =
    patternIdentityChanged ||
    draft.scheduleStartDate !== initialDraft.scheduleStartDate ||
    draft.referenceDate !== initialDraft.referenceDate ||
    draft.position !== initialDraft.position ||
    (['day', 'evening', 'night'] as const).some(
      (id) =>
        draft.times[id].start !== draft.sourceTimes[id].start ||
        draft.times[id].end !== draft.sourceTimes[id].end,
    );
  const futureScheduleOverrideCount = useMemo(
    () =>
      new Set(
        [...Object.keys(data.overrides), ...Object.keys(data.timeOverrides)].filter(
          (dateKey) => dateKey >= today,
        ),
      ).size,
    [data.overrides, data.timeOverrides, today],
  );
  const unresolvedLegacyIds = getUnresolvedLegacyShiftIds(draft);
  const summaryBlockingIssues = validation.issues.filter(
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

  const focusFirstIssue = (
    checked: ReturnType<typeof validateWorkPatternDraft> = validation,
  ) => {
    setRevealValidation(true);
    const target = getFirstWorkPatternIssueTarget(checked);
    if (!target) return;
    setStep(target.step);
    setOpenEditor(target.editor);
    setFocusShiftTypeId(target.shiftTypeId);
    setFocusRequest((current) => current + 1);
  };

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
          '저장하지 않고 나가시겠습니까?',
          '근무 순서와 시간 변경이 사라집니다.',
          [
            {
              text: '계속 설정',
              actionId: 'cancel',
              icon: 'close',
              style: 'cancel',
            },
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
          { tone: 'danger' },
        );
      }),
    [hasUnsavedChanges, navigation, saving, showDialog],
  );

  const selectPreset = (presetId: WorkPatternPresetId) => {
    const nextSequence = editorController.selectPreset(draft, presetId).sequence;
    const eveningActivated =
      !draft.sequence.includes('evening') && nextSequence.includes('evening');
    setDraft((current) => editorController.selectPreset(current, presetId));
    if (eveningActivated) setOpenEditor('times');
    void triggerSelectionFeedback();
  };

  const selectCategory = (categoryId: WorkPatternCategoryId) => {
    if (categoryId === 'weekday' || categoryId === 'custom') {
      selectPreset(categoryId);
      return;
    }
    if (draft.categoryId !== categoryId) {
      setDraft((current) => editorController.selectCategory(current, categoryId));
    }
  };

  const changeSequence = (sequence: BaseWorkShiftId[]) => {
    const eveningActivated = !draft.sequence.includes('evening') && sequence.includes('evening');
    setDraft((current) => editorController.changeSequence(current, sequence));
    if (eveningActivated) setOpenEditor('times');
  };

  const changeTime = (
    shiftTypeId: EditableWorkShiftId,
    field: 'start' | 'end',
    value: string,
  ) => {
    setDraft((current) =>
      editorController.changeTime(current, shiftTypeId, field, value),
    );
  };

  const changeStartDate = (nextDate: string) => {
    setDraft((current) => editorController.changeReferenceDate(current, nextDate));
  };

  const confirmSummary = () => {
    setRevealValidation(true);
    if (summaryBlockingIssues.length > 0) {
      focusFirstIssue();
      return;
    }
    setDraft(editorController.confirmSummary(draft));
    setOpenEditor(null);
    setStep(3);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  const persist = async (clearFutureScheduleOverrides: boolean) => {
    const checked = validateWorkPatternDraft(draft, data.shiftTypes);
    if (!checked.canSave) {
      focusFirstIssue(checked);
      showDialog('근무표 확인', '표시된 순서와 시간 오류를 수정');
      return;
    }
    let backupCreated = false;
    setSaving(true);
    try {
      await createBackup();
      backupCreated = true;
      const mutation = buildWorkPatternMutation(draft, data.shiftTypes);
      const persisted = await updatePatternDetailed(
        mutation.pattern,
        mutation.shiftTypePatches,
        clearFutureScheduleOverrides
          ? { clearFutureScheduleOverridesFrom: today }
          : undefined,
      );
      const outcome = resolveWorkPatternSaveOutcome({
        alarmsWanted: draft.alarmsWanted,
        alarmsReady: checked.canEnableAlarms,
        alarmSyncFailed:
          persisted.saveOutcome?.issues.some(
            (issue) => issue.issueCode === 'alarm-sync-failed',
          ) ?? false,
        backupCreated,
        persisted: persisted.operationSucceeded,
        valid: true,
      });
      if (outcome.issue === 'storage-failure') {
        showDialog('저장 실패', '저장 공간을 확인한 뒤 다시 시도');
        return;
      }
      if (outcome.issue === 'alarm-sync-partial') {
        void triggerNotificationFeedback('warning');
        showDialog(
          '근무표 저장 완료',
          '알람 재예약 실패 · 근무표는 저장됨',
          [
            {
              text: '나중에',
              actionId: 'cancel',
              icon: 'close',
              style: 'cancel',
              onPress: () => {
                allowNavigation.current = true;
                goBack();
              },
            },
            {
              text: '알람 다시 예약',
              actionId: 'retry',
              icon: 'refresh-outline',
              onPress: () => {
                void resyncAlarms(true).then((synced) => {
                  if (!synced) {
                    showDialog(
                      '알람 재예약 실패',
                      '알람 화면에서 권한 확인 후 다시 시도',
                    );
                    return;
                  }
                  allowNavigation.current = true;
                  void triggerNotificationFeedback('success');
                  goBack();
                });
              },
            },
          ],
          { tone: 'warning' },
        );
        return;
      }
      allowNavigation.current = true;
      void triggerNotificationFeedback('success');
      goBack();
    } catch {
      const outcome = resolveWorkPatternSaveOutcome({
        alarmsWanted: draft.alarmsWanted,
        alarmsReady: false,
        backupCreated,
        persisted: false,
        valid: true,
      });
      showDialog(
        outcome.issue === 'backup-failure'
          ? '백업 실패'
          : '저장 실패',
        outcome.issue === 'backup-failure'
          ? '변경 사항 미적용 · 기존 근무표 유지'
          : '저장 공간을 확인한 뒤 다시 시도',
      );
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!validation.canSave) {
      focusFirstIssue();
      showDialog('근무표 확인', '순서·시간·적용일 오류를 수정');
      return;
    }
    const run = () => void persist(patternIdentityChanged);
    const confirmScheduleImpact = () => {
      if (patternIdentityChanged && futureScheduleOverrideCount > 0) {
        showDialog(
          '새 근무표를 적용하시겠습니까?',
          `오늘 이후 직접 변경 ${futureScheduleOverrideCount}개 제거 · 메모와 특별 일정 유지`,
          [
            {
              text: '계속 설정',
              actionId: 'cancel',
              icon: 'close',
              style: 'cancel',
            },
            {
              text: '정리 후 저장',
              actionId: 'save',
              icon: 'checkmark',
              onPress: run,
            },
          ],
          { tone: 'warning' },
        );
        return;
      }
      run();
    };
    if (draft.alarmsWanted && !validation.canEnableAlarms) {
      showDialog(
        '근무 알람을 끄시겠습니까?',
        '근무 시간 겹침 · 알람 예약 불가',
        [
          {
            text: '계속 설정',
            actionId: 'cancel',
            icon: 'close',
            style: 'cancel',
          },
          {
            text: '알람 끄고 저장',
            actionId: 'save',
            icon: 'checkmark',
            onPress: confirmScheduleImpact,
          },
        ],
        { tone: 'warning' },
      );
      return;
    }
    confirmScheduleImpact();
  };

  if (data.appliedPatternSource !== 'legacy') {
    return (
      <Screen contentStyle={styles.screen} safeAreaEdges={['left', 'right']}>
        <PageHeader title="근무표 설정" />
        <StatusBanner
          actionLabel="보관함 열기"
          message="편집 위치: 패턴 보관함 · 현재 근무표 유지"
          onAction={() => router.replace('/pattern-library' as never)}
          title="보관함 패턴"
          tone="info"
        />
      </Screen>
    );
  }

  const footer = (
    <View style={[styles.footer, stackFooter && styles.footerStacked]}>
      {step > 1 ? (
        <AppButton
          disabled={saving}
          label="뒤로"
          onPress={() => setStep((step - 1) as Step)}
          style={styles.footerButton}
          variant="secondary"
        />
      ) : null}
      <AppButton
        disabled={
          saving ||
          (step === 1 ? draft.presetId === null : step === 2 ? false : !validation.canSave || !hasUnsavedChanges)
        }
        label={step === 1 ? '다음' : step === 2 ? '적용일 선택' : '저장'}
        loading={saving}
        onPress={
          step === 1
            ? () => {
                setOpenEditor(
                  getNewlyActiveShiftIds(draft).length > 0
                    ? 'times'
                    : draft.presetId === 'custom'
                      ? 'sequence'
                      : null,
                );
                setStep(2);
              }
            : step === 2
              ? confirmSummary
              : requestSave
        }
        style={styles.footerButton}
      />
    </View>
  );

  return (
    <Screen contentStyle={styles.screen} footer={footer} safeAreaEdges={['left', 'right']}>
      <PageHeader
        title="근무표 설정"
        trailing={
          <AppButton
            label="보관함"
            onPress={() => router.push('/pattern-library' as never)}
            size="compact"
            variant="ghost"
          />
        }
      />
      <SetupProgress compact={width <= 320 || fontScale >= 1.3} step={step} />

      {step === 1 ? (
        <View
          accessibilityLabel="근무 방식 선택"
          accessible
          collapsable={false}
          ref={issueHeadingRef}>
          <WorkModeStep
            categoryId={draft.categoryId}
            onSelect={selectPreset}
            onSelectCategory={selectCategory}
            presetId={draft.presetId}
            stackOptions={stackOptions}
          />
        </View>
      ) : null}

      {step === 2 && draft.presetId ? (
        <View style={styles.stepContent}>
          <View
            accessibilityLabel="회사 순서와 시간 확인"
            accessible
            collapsable={false}
            ref={issueHeadingRef}
            style={styles.heading}>
            <AppText accessibilityRole="header" style={styles.centerText} variant="heading">
              순서와 시간
            </AppText>
            <AppText style={styles.centerText} tone="secondary" variant="body">
              필요한 항목만 수정
            </AppText>
          </View>

          <Surface style={styles.card}>
            <View style={styles.summaryHeading}>
              <View style={styles.summaryCopy}>
                <AppText variant="label">근무 순서</AppText>
                <AppText tone="secondary" variant="caption">
                  {draft.presetId === 'weekday'
                    ? '월~금 주간 · 토~일 휴무'
                    : draft.sequence.join(' → ').replaceAll('day', '주간').replaceAll('evening', '오후').replaceAll('night', '야간').replaceAll('off', '휴무')}
                </AppText>
              </View>
              <AppButton
                label={openEditor === 'sequence' ? '접기' : '순서 수정'}
                onPress={() => setOpenEditor((value) => value === 'sequence' ? null : 'sequence')}
                size="compact"
                variant="secondary"
              />
            </View>
            {openEditor === 'sequence' ? (
              draft.presetId === 'weekday' ? (
                <WeekdaySchedule dayEnd={draft.times.day.end} dayStart={draft.times.day.start} />
              ) : (
                <PatternSequenceEditor onChange={changeSequence} sequence={draft.sequence} />
              )
            ) : null}

            <View style={styles.divider} />
            <View style={styles.summaryHeading}>
              <View style={styles.summaryCopy}>
                <AppText variant="label">근무 시간</AppText>
                <AppText tone="secondary" variant="caption">
                  {validation.activeShiftIds
                    .map((id) => `${id === 'day' ? '주간' : id === 'evening' ? '오후' : '야간'} ${draft.times[id].start}~${draft.times[id].end}`)
                    .join(' · ')}
                </AppText>
              </View>
              <AppButton
                label={openEditor === 'times' ? '접기' : '시간 수정'}
                onPress={() => setOpenEditor((value) => value === 'times' ? null : 'times')}
                size="compact"
                variant="secondary"
              />
            </View>
            {openEditor === 'times' ? (
              <WorkTimeEditor
                dayColor={dayAppearance?.accentColor ?? palette.mintDark}
                dayDuration={timeValidation.dayDuration}
                dayEnd={draft.times.day.end}
                dayStart={draft.times.day.start}
                eveningColor={eveningAppearance?.accentColor ?? palette.indigoDark}
                eveningDuration={timeValidation.eveningDuration}
                eveningEnd={draft.times.evening.end}
                eveningStart={draft.times.evening.start}
                focusRequest={focusRequest}
                focusShiftTypeId={focusShiftTypeId}
                nightColor={nightAppearance?.accentColor ?? palette.violet}
                nightDuration={timeValidation.nightDuration}
                nightEnd={draft.times.night.end}
                nightStart={draft.times.night.start}
                onChangeDayEnd={(value) => changeTime('day', 'end', value)}
                onChangeDayStart={(value) => changeTime('day', 'start', value)}
                onChangeEveningEnd={(value) => changeTime('evening', 'end', value)}
                onChangeEveningStart={(value) => changeTime('evening', 'start', value)}
                onChangeNightEnd={(value) => changeTime('night', 'end', value)}
                onChangeNightStart={(value) => changeTime('night', 'start', value)}
                revealErrors={revealValidation}
                showDay={validation.activeShiftIds.includes('day')}
                showEvening={validation.activeShiftIds.includes('evening')}
                showNight={validation.activeShiftIds.includes('night')}
                stackTimeInputs={stackFooter}
              />
            ) : null}
          </Surface>

          {unresolvedLegacyIds.length > 0 && patternIdentityChanged && !draft.legacyMappingConfirmed ? (
            <View style={styles.legacySection}>
              <StatusBanner
                icon="alert-circle-outline"
                message="저장 전 이전 오후 근무 연결"
                tone="warning"
              />
              <AppButton
                label="기존 오후 근무 연결"
                onPress={() => setDraft((current) => ({ ...current, legacyMappingConfirmed: true }))}
                variant="secondary"
              />
            </View>
          ) : null}

          {!validation.safety.canSave ? (
            <StatusBanner
              icon="alert-circle-outline"
              message="근무 시간 겹침 · 시작·종료 시간 수정"
              tone="warning"
            />
          ) : getNewlyActiveShiftIds(draft).some((id) => !draft.reviewedShiftIds.includes(id)) ? (
            <StatusBanner
              icon="alarm-outline"
              message="새로 추가한 근무 시간 확인 필요"
              tone="info"
            />
          ) : null}
          {draft.presetId !== 'weekday' && validation.effectivePresetId === 'weekday' ? (
            <StatusBanner
              icon="calendar-outline"
              message="주간 고정으로 저장 · 월~금 주간, 토·일 휴무"
              tone="info"
            />
          ) : null}
        </View>
      ) : null}

      {step === 3 && draft.presetId ? (
        <View style={styles.stepContent}>
          <View
            accessibilityLabel="적용할 날짜 선택"
            accessible
            collapsable={false}
            ref={issueHeadingRef}
            style={styles.heading}>
            <AppText accessibilityRole="header" style={styles.centerText} variant="heading">
              적용일과 시작 근무
            </AppText>
            <AppText style={styles.centerText} tone="secondary" variant="body">
              선택한 근무부터 순서 반복
            </AppText>
          </View>
          <Surface style={styles.card}>
            <AppText variant="label">일정 적용 시작일</AppText>
            <DatePickerField
              accessibilityLabel="일정 적용 시작일"
              onChange={changeStartDate}
              placeholder={today}
              today={today}
              value={draft.scheduleStartDate}
            />
            {validation.effectivePresetId !== 'weekday' ? (
              <>
                <View style={styles.divider} />
                <AppText variant="label">이 날짜의 실제 근무</AppText>
                <RotationPositionPicker
                  compact={compactPositions}
                  onSelect={(position) => setDraft((current) => ({ ...current, position }))}
                  position={draft.position}
                  sequence={draft.sequence}
                  shiftTypes={data.shiftTypes}
                />
              </>
            ) : null}
          </Surface>

          {patternIdentityChanged && futureScheduleOverrideCount > 0 ? (
            <StatusBanner
              icon="alert-circle-outline"
              message={`오늘 이후 직접 변경 ${futureScheduleOverrideCount}개 제거 · 메모와 특별 일정 유지`}
              tone="warning"
            />
          ) : null}
          {!validation.canEnableAlarms && validation.safety.canSave ? (
            <StatusBanner
              icon="alarm-outline"
              message="근무 시간 겹침 · 저장 시 근무 알람 꺼짐"
              tone="warning"
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: { gap: spacing.large, paddingTop: spacing.small },
    centerText: { textAlign: 'center' },
    stepContent: { gap: spacing.medium },
    heading: { gap: spacing.tiny },
    card: { gap: spacing.medium, padding: spacing.medium },
    legacySection: { gap: spacing.medium },
    summaryHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    summaryCopy: { minWidth: 180, flex: 1, gap: spacing.tiny },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line },
    footer: { flexDirection: 'row', gap: spacing.small },
    footerStacked: { flexDirection: 'column' },
    footerButton: { flex: 1 },
  });
}
