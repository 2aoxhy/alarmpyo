import * as Haptics from 'expo-haptics';
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
import { AppButton, AppText, Card, Screen, SectionHeader } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner } from '@/design-system';
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
  activeShiftIds,
  buildWorkPatternMutation,
  createExistingWorkPatternDraft,
  createWorkPatternSummarySignature,
  getFirstWorkPatternIssueTarget,
  getNewlyActiveShiftIds,
  getUnresolvedLegacyShiftIds,
  isWorkPatternSequenceChanged,
  resolveWorkPatternSaveOutcome,
  validateWorkPatternDraft,
  type EditableWorkShiftId,
  type WorkPatternDraft,
} from '@/features/setup/work-pattern-draft';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useAppStore } from '@/store/app-store';
import { toDateKey } from '@/utils/date';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  getPositionAfterReferenceDateChange,
  getWorkPatternCategoryId,
  getWorkPatternPreset,
  getWorkPatternPresetId,
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
  const { createBackup, data, resyncAlarms, updatePatternDetailed } = useAppStore();
  const navigation = useNavigation();
  const allowNavigation = useRef(false);
  const [today] = useState(() => toDateKey(new Date()));
  const [initialDraft] = useState<WorkPatternDraft>(() =>
    createExistingWorkPatternDraft({ data, today }),
  );
  const [draft, setDraft] = useState<WorkPatternDraft>(() => initialDraft);
  const [step, setStep] = useState<Step>(1);
  const [openEditor, setOpenEditor] = useState<Editor>(null);
  const [saving, setSaving] = useState(false);
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
  const summaryConfirmed =
    draft.summaryConfirmation === createWorkPatternSummarySignature(draft);
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
          '변경한 근무 방식과 시간이 저장되지 않습니다.',
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

  const invalidateSummary = (next: WorkPatternDraft): WorkPatternDraft => ({
    ...next,
    summaryConfirmation: null,
  });

  const selectPreset = (presetId: WorkPatternPresetId) => {
    const nextSequence = [...getWorkPatternPreset(presetId).shiftTypeIds];
    const eveningActivated =
      !draft.sequence.includes('evening') && nextSequence.includes('evening');
    setDraft((current) =>
      invalidateSummary({
        ...current,
        presetId,
        categoryId: getWorkPatternCategoryId(presetId),
        sequence: nextSequence,
        position: null,
        reviewedShiftIds: eveningActivated
          ? current.reviewedShiftIds.filter((id) => id !== 'evening')
          : current.reviewedShiftIds,
      }),
    );
    if (eveningActivated) setOpenEditor('times');
    void Haptics.selectionAsync();
  };

  const selectCategory = (categoryId: WorkPatternCategoryId) => {
    if (categoryId === 'weekday' || categoryId === 'custom') {
      selectPreset(categoryId);
      return;
    }
    if (draft.categoryId !== categoryId) {
      setDraft((current) =>
        invalidateSummary({
          ...current,
          categoryId,
          presetId: null,
          position: null,
        }),
      );
    }
  };

  const changeSequence = (sequence: BaseWorkShiftId[]) => {
    const eveningActivated = !draft.sequence.includes('evening') && sequence.includes('evening');
    const presetId = getWorkPatternPresetId(sequence);
    setDraft((current) =>
      invalidateSummary({
        ...current,
        sequence,
        presetId,
        categoryId: getWorkPatternCategoryId(presetId),
        position: null,
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
      }),
    );
  };

  const changeStartDate = (nextDate: string) => {
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

  const confirmSummary = () => {
    const reviewed = [...new Set([...draft.reviewedShiftIds, ...activeShiftIds(draft.sequence)])];
    const next = { ...draft, reviewedShiftIds: reviewed };
    setDraft({ ...next, summaryConfirmation: createWorkPatternSummarySignature(next) });
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
      showDialog('근무표를 확인해야 합니다', '표시된 순서와 시간 문제를 수정해야 합니다.');
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
        showDialog('근무표를 저장하지 못했습니다', '휴대폰 저장 공간을 확인한 뒤 다시 시도해야 합니다.');
        return;
      }
      if (outcome.issue === 'alarm-sync-partial') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showDialog(
          '근무표는 저장되었습니다',
          '알람을 근무표에 맞춰 다시 예약하지 못했습니다. 알람만 다시 예약할 수 있습니다.',
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
                      '알람을 다시 예약하지 못했습니다',
                      '알람 화면에서 권한을 확인한 뒤 다시 시도해야 합니다.',
                    );
                    return;
                  }
                  allowNavigation.current = true;
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
          ? '안전 백업을 만들지 못했습니다'
          : '근무표를 저장하지 못했습니다',
        outcome.issue === 'backup-failure'
          ? '기존 자료를 보호하기 위해 변경 사항을 적용하지 않았습니다.'
          : '휴대폰 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!validation.canSave) {
      focusFirstIssue();
      showDialog('근무표를 확인해야 합니다', '표시된 순서, 시간, 적용일을 확인해야 합니다.');
      return;
    }
    const run = () => void persist(patternIdentityChanged);
    const confirmScheduleImpact = () => {
      if (patternIdentityChanged && futureScheduleOverrideCount > 0) {
        showDialog(
          '새 근무 방식을 적용하시겠습니까?',
          `오늘 이후 직접 변경한 근무와 시간 ${futureScheduleOverrideCount}개를 정리합니다. 메모와 연차·교육·예비군 일정은 유지합니다.`,
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
        '근무 알람을 끄고 저장하시겠습니까?',
        '일정은 저장할 수 있지만 현재 순서에서는 이전 근무 중 알람이 울릴 수 있어 근무 알람을 꺼야 합니다.',
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
        <SectionHeader centered title="근무 방식 설정" />
        <StatusBanner
          actionLabel="패턴 보관함 열기"
          message="보관함에서 적용한 패턴은 주대·야대를 포함할 수 있어 기본 근무 방식 편집기에서 변경하지 않습니다. 보관함에서 패턴을 편집하거나 다른 패턴의 달력 비교를 확인해야 합니다. 현재 근무표는 변경하지 않았습니다."
          onAction={() => router.replace('/pattern-library' as never)}
          title="보관함 패턴 사용 중"
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
          (step === 1 ? draft.presetId === null : step === 2 ? summaryBlockingIssues.length > 0 : !validation.canSave || !hasUnsavedChanges)
        }
        label={step === 1 ? '순서와 시간 확인' : step === 2 ? '이대로 사용' : '저장'}
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
      <SectionHeader
        action="패턴 보관함"
        centered
        onAction={() => router.push('/pattern-library' as never)}
        title="근무 방식 설정"
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
              회사 순서와 시간을 확인합니다
            </AppText>
            <AppText style={styles.centerText} tone="secondary" variant="body">
              저장된 시간은 유지되며 필요한 항목만 수정할 수 있습니다.
            </AppText>
          </View>

          <Card style={styles.card}>
            <View style={styles.summaryHeading}>
              <View style={styles.summaryCopy}>
                <AppText variant="label">회사 근무 순서</AppText>
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
                showDay={validation.activeShiftIds.includes('day')}
                showEvening={validation.activeShiftIds.includes('evening')}
                showNight={validation.activeShiftIds.includes('night')}
                stackTimeInputs={stackFooter}
              />
            ) : null}
          </Card>

          {unresolvedLegacyIds.length > 0 && patternIdentityChanged && !draft.legacyMappingConfirmed ? (
            <Card style={styles.card}>
              <StatusBanner
                icon="alert-circle-outline"
                message="이전 버전의 오후 근무가 포함되어 있습니다. 새 순서로 바꾸려면 기존 오후 근무를 현재 오후 근무에 명시적으로 연결해야 합니다."
                tone="warning"
              />
              <AppButton
                label="기존 오후 근무 연결"
                onPress={() => setDraft((current) => ({ ...current, legacyMappingConfirmed: true }))}
                variant="secondary"
              />
            </Card>
          ) : null}

          {!validation.safety.canSave ? (
            <StatusBanner
              icon="alert-circle-outline"
              message="이전 근무가 끝나기 전에 다음 근무가 시작합니다. 겹치는 시간을 수정해야 합니다."
              tone="warning"
            />
          ) : getNewlyActiveShiftIds(draft).some((id) => !draft.reviewedShiftIds.includes(id)) ? (
            <StatusBanner
              icon="alarm-outline"
              message="새로 사용하는 오후 근무 시간을 확인한 뒤 ‘이대로 사용’을 눌러야 합니다."
              tone="info"
            />
          ) : null}
          {draft.presetId !== 'weekday' && validation.effectivePresetId === 'weekday' ? (
            <StatusBanner
              icon="calendar-outline"
              message="이 순서는 주간 고정과 같으므로 월~금 근무·토·일 휴무로 저장됩니다."
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
              적용할 날짜를 선택합니다
            </AppText>
            <AppText style={styles.centerText} tone="secondary" variant="body">
              선택한 날짜의 실제 근무를 맞추면 이후 일정이 자동으로 이어집니다.
            </AppText>
          </View>
          <Card style={styles.card}>
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
          </Card>

          {patternIdentityChanged && futureScheduleOverrideCount > 0 ? (
            <StatusBanner
              icon="alert-circle-outline"
              message={`저장하면 오늘 이후 직접 변경한 근무와 시간 ${futureScheduleOverrideCount}개를 정리합니다. 메모와 특별 일정은 유지합니다.`}
              tone="warning"
            />
          ) : null}
          {!validation.canEnableAlarms && validation.safety.canSave ? (
            <StatusBanner
              icon="alarm-outline"
              message="일정은 저장할 수 있지만 이전 근무 중 알람이 울릴 수 있어 저장 시 근무 알람을 꺼야 합니다."
              tone="warning"
            />
          ) : null}
          {summaryConfirmed ? (
            <StatusBanner
              icon="checkmark-circle"
              message="근무 순서와 시간을 확인했습니다."
              tone="info"
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
