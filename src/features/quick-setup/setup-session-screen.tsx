import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppDialog, type AppDialogButton } from '@/components/app-dialog';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing } from '@/constants/app-theme';
import { StatusBanner } from '@/design-system';
import { dataSettingsController } from '@/features/data-settings/data-settings-native-controller';
import { SetupApplyingOverlay } from '@/features/setup/setup-onboarding-surface';
import { getSuggestedWorkTimesForPreset } from '@/features/setup/setup-flow';
import {
  activeShiftIds,
  buildWorkPatternMutation,
  createExistingWorkPatternDraft,
  createInitialWorkPatternDraft,
  createWorkPatternSummarySignature,
  validateWorkPatternDraft,
  type EditableWorkShiftId,
  type WorkPatternDraft,
} from '@/features/setup/work-pattern-draft';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppData } from '@/models/app-data';
import {
  areSetupDataEqual,
  selectSettingsData,
} from '@/features/settings/settings-store-selection';
import { clearSetupDraft, readSetupDraft } from '@/services/setup-draft-service';
import { useAppCommands, useAppSelector } from '@/store/app-store';
import { addDays, formatKoreanDate, toDateKey } from '@/utils/date';
import { calculatePatternPosition, isPatternScheduleDate } from '@/services/pattern-engine';
import { formatTimeInput } from '@/utils/shift-time';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  getPatternPositionForDate,
  getWeekdayPatternPosition,
  getWorkPatternCategoryId,
  getWorkPatternPresetId,
  type BaseWorkShiftId,
  type WorkPatternPresetId,
} from '@/utils/work-pattern';

import { quickSetupDraftController } from './quick-setup-draft-controller';
import {
  createQuickPreview,
  QUICK_SETUP_OPTIONS,
  type QuickSetupGroupId,
} from './quick-setup-model';
import {
  createSetupSessionDraft,
  migrateInitialSetupDraft,
  migrateQuickSetupDraft,
  resolveSetupScheduleStartDate,
  type SetupSessionDraftV2,
  type SetupSessionMode,
} from './setup-session-model';
import {
  SetupAlarmStep,
  SetupAnchorStep,
  SetupSessionProgress,
  SetupSourceStep,
} from './setup-session-steps';

type SetupSessionScreenProps = { mode: SetupSessionMode };

function projectWorkPatternDraft(
  session: SetupSessionDraftV2,
  data: AppData,
  today: string,
): WorkPatternDraft {
  const base =
    session.mode === 'initial'
      ? createInitialWorkPatternDraft({ shiftTypes: data.shiftTypes, today })
      : createExistingWorkPatternDraft({ data, today });
  const reviewedShiftIds =
    session.step === 'alarm-readiness'
      ? activeShiftIds(session.sequence)
      : base.reviewedShiftIds;
  return {
    ...base,
    presetId: session.presetId,
    categoryId: getWorkPatternCategoryId(session.presetId),
    sequence: [...session.sequence],
    scheduleStartDate: resolveSetupScheduleStartDate({
      currentScheduleStartDate: base.scheduleStartDate,
      mode: session.mode,
      source: session.source,
      today,
    }),
    referenceDate: session.referenceDate,
    position:
      session.presetId === 'weekday'
        ? getWeekdayPatternPosition(session.referenceDate)
        : session.position,
    times: session.times,
    alarmsWanted: session.alarmChoice === 'prepare',
    reviewedShiftIds,
    summaryConfirmation: session.summaryConfirmation,
  };
}

function applySuggestedTimes(
  current: SetupSessionDraftV2,
  presetId: WorkPatternPresetId,
): SetupSessionDraftV2['times'] {
  if (current.mode !== 'initial' || current.source !== null) return current.times;
  const suggestion = getSuggestedWorkTimesForPreset(presetId);
  if (!suggestion) return current.times;
  return {
    day: suggestion.day ?? current.times.day,
    evening: suggestion.evening ?? current.times.evening,
    night: suggestion.night ?? current.times.night,
  };
}

export function SetupSessionScreen({ mode }: SetupSessionScreenProps) {
  const { showDialog } = useAppDialog();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackActions = width <= 360 || fontScale >= 1.4;
  const stackTimeInputs = width <= 320 || fontScale >= 1.3;
  const compactProgress = width <= 320 || fontScale >= 1.4;
  const data = useAppSelector(selectSettingsData, areSetupDataEqual);
  const {
    commitSetup,
    previewSharedWorkSettings,
    requestAlarmAccess,
  } = useAppCommands();
  const [today] = useState(() => toDateKey(new Date()));
  const initialDataRef = useRef(data);
  const [draftSession] = useState(() => quickSetupDraftController.createSession());
  const [session, setSession] = useState<SetupSessionDraftV2>(() => {
    const created = createSetupSessionDraft({ data, mode, today });
    return Platform.OS === 'android'
      ? created
      : { ...created, alarmChoice: 'schedule-only' };
  });
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<QuickSetupGroupId | null>(null);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [showTimeEditor, setShowTimeEditor] = useState(false);
  const [revealValidation, setRevealValidation] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [focusShiftTypeId, setFocusShiftTypeId] =
    useState<EditableWorkShiftId | null>(null);
  const stepHeadingRef = useRef<Text>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const initialData = initialDataRef.current;
      const stored = await draftSession.hydrate();
      let restored = stored
        ? migrateQuickSetupDraft({ data: initialData, draft: stored, mode, today })
        : null;
      if (!restored && mode === 'initial') {
        const legacy = await readSetupDraft();
        if (legacy) {
          restored = migrateInitialSetupDraft({
            data: initialData,
            draft: legacy,
            today,
          });
        }
      }
      if (!active) return;
      if (restored) {
        const compatible =
          Platform.OS !== 'android' && restored.alarmChoice === 'prepare'
            ? { ...restored, alarmChoice: 'schedule-only' as const }
            : restored;
        setSession(compatible);
        const categoryId = getWorkPatternCategoryId(restored.presetId);
        setExpandedGroup(
          restored.source === 'recommended' &&
          (categoryId === 'two-shift' || categoryId === 'three-shift')
            ? categoryId
            : null,
        );
        setShowCustomEditor(restored.source === 'custom');
        setShowTimeEditor(false);
      }
      setHydrated(true);
    })().catch(() => {
      if (active) setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [draftSession, mode, today]);

  useEffect(() => {
    if (!hydrated) return;
    void draftSession.write(session).catch(() => undefined);
  }, [draftSession, hydrated, session]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      if (Platform.OS !== 'web') {
        const node = findNodeHandle(stepHeadingRef.current);
        if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
      }
    }, 80);
    return () => clearTimeout(timeout);
  }, [hydrated, session.step]);

  const workDraft = useMemo(
    () => projectWorkPatternDraft(session, data, today),
    [data, session, today],
  );
  const validation = useMemo(
    () => validateWorkPatternDraft(workDraft, data.shiftTypes),
    [data.shiftTypes, workDraft],
  );
  const preview = useMemo(
    () => session.source === 'current'
      ? Array.from({ length: 7 }, (_, offset) => {
          const dateKey = addDays(today, offset);
          const position = isPatternScheduleDate(data.pattern, dateKey)
            ? calculatePatternPosition(data.pattern, dateKey)
            : null;
          const shiftTypeId = position === null
            ? null
            : data.pattern.shiftTypeIds[position] ?? null;
          const shift = data.shiftTypes.find((candidate) => candidate.id === shiftTypeId);
          return {
            dateKey,
            dateLabel: formatKoreanDate(dateKey),
            shiftTypeId: shiftTypeId ?? 'off',
            shiftLabel: shift?.name ?? '일정 없음',
          };
        })
      : session.position === null
        ? []
        : createQuickPreview(
            session.sequence,
            session.referenceDate,
            session.presetId === 'weekday'
              ? getWeekdayPatternPosition(session.referenceDate)
              : session.position,
          ),
    [data.pattern, data.shiftTypes, session.position, session.presetId, session.referenceDate, session.sequence, session.source, today],
  );
  const activeShiftIds = validation.activeShiftIds;
  const currentSequenceLabel = data.pattern.shiftTypeIds
    .map((id) => data.shiftTypes.find((shift) => shift.id === id)?.name ?? id)
    .join(' → ');
  const dayShift = data.shiftTypes.find((shift) => shift.id === 'day');
  const eveningShift = data.shiftTypes.find((shift) => shift.id === 'evening');
  const nightShift = data.shiftTypes.find((shift) => shift.id === 'night');
  const dayAppearance = dayShift ? getShiftAppearance(dayShift, palette, isDark) : null;
  const eveningAppearance = eveningShift
    ? getShiftAppearance(eveningShift, palette, isDark)
    : null;
  const nightAppearance = nightShift
    ? getShiftAppearance(nightShift, palette, isDark)
    : null;
  const canPrepareAlarms =
    Platform.OS === 'android' && validation.safety.canEnableAlarms;
  const stepTwoIssues = validation.issues.filter(
    (issue) =>
      issue.code !== 'summary-unconfirmed' &&
      issue.code !== 'new-shift-review-required',
  );

  const patchSession = (patch: Partial<SetupSessionDraftV2>) => {
    setSession((current) => ({
      ...current,
      ...patch,
      summaryConfirmation:
        patch.summaryConfirmation === undefined
          ? current.summaryConfirmation
          : patch.summaryConfirmation,
    }));
  };

  const selectRecommendation = (presetId: WorkPatternPresetId) => {
    const option = QUICK_SETUP_OPTIONS.find((candidate) => candidate.presetId === presetId);
    if (!option) return;
    setSession((current) => ({
      ...current,
      source: 'recommended',
      presetId,
      sequence: [...option.sequence],
      position:
        presetId === 'weekday'
          ? getWeekdayPatternPosition(current.referenceDate)
          : null,
      times: applySuggestedTimes(current, presetId),
      summaryConfirmation: null,
    }));
    const categoryId = getWorkPatternCategoryId(presetId);
    setExpandedGroup(
      categoryId === 'two-shift' || categoryId === 'three-shift'
        ? categoryId
        : null,
    );
    setShowCustomEditor(false);
    setShowTimeEditor(false);
  };

  const useCurrentSchedule = () => {
    if (mode !== 'reconfigure') return;
    const created = createSetupSessionDraft({ data, mode, today });
    setSession(
      Platform.OS === 'android'
        ? created
        : { ...created, alarmChoice: 'schedule-only' },
    );
    setExpandedGroup(null);
    setShowCustomEditor(false);
    setShowTimeEditor(false);
  };

  const beginCustomSequence = () => {
    setShowCustomEditor(true);
    setExpandedGroup('custom');
    setSession((current) => ({
      ...current,
      source: 'custom',
      presetId: getWorkPatternPresetId(current.sequence),
      position: null,
      summaryConfirmation: null,
    }));
  };

  const changeCustomSequence = (sequence: BaseWorkShiftId[]) => {
    setSession((current) => ({
      ...current,
      source: 'custom',
      presetId: getWorkPatternPresetId(sequence),
      sequence,
      position: null,
      summaryConfirmation: null,
    }));
    setShowTimeEditor(false);
  };

  const receiveSettings = async () => {
    if (!hydrated || busy) return;
    setBusy(true);
    try {
      const picked = await dataSettingsController.pickWorkSettingsFile();
      if (!picked) return;
      const received = previewSharedWorkSettings(picked.contents);
      // The sharing service validates the portable contract as base-shift-only.
      // Keep this narrowing at the UI boundary instead of coercing unknown IDs.
      const sequence = received.document.workSettings.pattern.shiftTypeIds.filter(
        (id): id is BaseWorkShiftId =>
          id === 'day' || id === 'evening' || id === 'night' || id === 'off',
      );
      if (sequence.length === 0) throw new Error('받은 근무 순서를 확인할 수 없습니다.');
      const presetId = getWorkPatternPresetId(sequence);
      const readTime = (id: Exclude<BaseWorkShiftId, 'off'>) => {
        const receivedShift = received.document.workSettings.shiftTypes.find(
          (shift) => shift.id === id,
        );
        const current = session.times[id];
        return receivedShift
          ? {
              start: formatTimeInput(receivedShift.startMinutes ?? 0),
              end: formatTimeInput(receivedShift.endMinutes ?? 0),
            }
          : current;
      };
      setSession((current) => ({
        ...current,
        source: 'received-file',
        step: 'schedule-anchor',
        presetId,
        sequence,
        referenceDate: today,
        position:
          presetId === 'weekday'
            ? getWeekdayPatternPosition(today)
            : getPatternPositionForDate({
                date: today,
                referenceDate: received.document.workSettings.pattern.anchorDate,
                referencePosition: 0,
                sequenceLength: sequence.length,
              }),
        times: {
          day: readTime('day'),
          evening: readTime('evening'),
          night: readTime('night'),
        },
        summaryConfirmation: null,
      }));
      setExpandedGroup(null);
      setShowCustomEditor(false);
      setShowTimeEditor(false);
    } catch (error) {
      showDialog(
        '받은 근무표를 읽지 못했습니다',
        error instanceof Error
          ? error.message
          : '알람표 근무 설정 파일만 불러올 수 있습니다.',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  };

  const changeTime = (
    shiftTypeId: Exclude<BaseWorkShiftId, 'off'>,
    field: 'start' | 'end',
    value: string,
  ) => {
    setSession((current) => ({
      ...current,
      times: {
        ...current.times,
        [shiftTypeId]: { ...current.times[shiftTypeId], [field]: value },
      },
      summaryConfirmation: null,
    }));
  };

  const focusFirstTimeIssue = () => {
    const target = validation.issues.find(
      (issue) => issue.code === 'shift-time-invalid' && issue.shiftTypeId,
    );
    setShowTimeEditor(true);
    setFocusShiftTypeId(target?.shiftTypeId ?? activeShiftIds[0] ?? null);
    setFocusRequest((current) => current + 1);
  };

  const continueFromSource = () => {
    if (!session.source || !session.presetId) return;
    patchSession({
      step: 'schedule-anchor',
      position:
        session.presetId === 'weekday'
          ? getWeekdayPatternPosition(session.referenceDate)
          : session.position,
      summaryConfirmation: null,
    });
  };

  const continueToAlarm = () => {
    setRevealValidation(true);
    if (stepTwoIssues.length > 0) {
      if (
        stepTwoIssues.some(
          (issue) =>
            issue.code === 'shift-time-invalid' || issue.code === 'work-overlap',
        )
      ) {
        focusFirstTimeIssue();
      } else {
        showDialog(
          '근무표 입력 오류',
          '근무 순서·시간·오늘 근무 중 입력이 필요합니다.',
        );
      }
      return;
    }
    const reviewed = {
      ...workDraft,
      reviewedShiftIds: activeShiftIds,
    };
    patchSession({
      step: 'alarm-readiness',
      alarmChoice:
        canPrepareAlarms
          ? session.alarmChoice ??
            (mode === 'initial' || data.settings.notificationsEnabled
              ? 'prepare'
              : 'schedule-only')
          : 'schedule-only',
      summaryConfirmation: createWorkPatternSummarySignature(reviewed),
    });
  };

  const save = async () => {
    if (!session.alarmChoice || busy) return;
    const currentDraft = projectWorkPatternDraft(session, data, today);
    const checked = validateWorkPatternDraft(currentDraft, data.shiftTypes);
    if (!checked.canSave || (session.alarmChoice === 'prepare' && !checked.safety.canEnableAlarms)) {
      showDialog(
        '근무표 오류',
        '근무 순서·시간·오늘 근무 중 유효하지 않은 항목이 있습니다.',
        undefined,
        { tone: 'danger' },
      );
      return;
    }
    setBusy(true);
    try {
      let alarmReady = session.alarmChoice !== 'prepare';
      if (session.alarmChoice === 'prepare') {
        try {
          alarmReady = await requestAlarmAccess();
        } catch {
          alarmReady = false;
        }
      }
      const built = buildWorkPatternMutation(currentDraft, data.shiftTypes);
      // `current` means time/alarm editing only. Keep every original pattern field,
      // including user/legacy shift IDs and its exact anchor/start dates.
      const mutation = session.source === 'current'
        ? {
            pattern: data.pattern,
            shiftTypePatches: Object.fromEntries(
              Object.entries(built.shiftTypePatches).filter(([id]) =>
                data.pattern.shiftTypeIds.includes(id),
              ),
            ),
          }
        : built;
      const committed = await commitSetup({
        mode,
        ...mutation,
        notificationsEnabled: session.alarmChoice === 'prepare',
      });
      if (!committed.primarySaved) {
        showDialog(
          '저장 실패',
          '현재 자료 유지 · 저장 공간 확인 필요',
          undefined,
          { tone: 'danger' },
        );
        return;
      }
      alarmReady = alarmReady && committed.followUpSucceeded;
      await Promise.all([
        draftSession.complete().catch(() => undefined),
        clearSetupDraft().catch(() => undefined),
      ]);
      if (!alarmReady) {
        const alarmButtons: AppDialogButton[] = [
          { text: '나중에', actionId: 'cancel', icon: 'close', style: 'cancel' },
          {
            text: '알람 설정 보기',
            actionId: 'open-settings',
            icon: 'settings-outline',
            onPress: () => router.push('/alarm-settings?focus=permissions' as Href),
          },
        ];
        showDialog(
          '근무표 저장 완료',
          '알람 권한 미완료 · 알람 설정에서 계속',
          alarmButtons,
          { tone: 'warning' },
        );
      }
      if (mode === 'reconfigure') {
        router.replace('/work-settings-home' as Href);
      }
    } catch {
      showDialog(
        '저장 실패',
        '현재 자료 유지 · 안전 백업과 저장 공간 확인 필요',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  };

  const stepNumber =
    session.step === 'schedule-source' ? 1 : session.step === 'schedule-anchor' ? 2 : 3;
  const footerLabel =
    session.step === 'schedule-source'
      ? '다음'
      : session.step === 'schedule-anchor'
        ? '알람 설정'
        : '설정 완료';
  const footerDisabled =
    !hydrated ||
    busy ||
    (session.step === 'schedule-source'
      ? !session.source || !session.presetId
      : session.step === 'schedule-anchor'
        ? false
        : !session.alarmChoice);

  const goBack = () => {
    if (session.step === 'schedule-anchor') {
      patchSession({ step: 'schedule-source' });
      return;
    }
    if (session.step === 'alarm-readiness') {
      patchSession({ step: 'schedule-anchor' });
    }
  };

  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (session.step === 'schedule-source') return false;
      setSession((current) => ({
        ...current,
        step:
          current.step === 'alarm-readiness'
            ? 'schedule-anchor'
            : 'schedule-source',
      }));
      return true;
    });
    return () => subscription.remove();
  }, [hydrated, session.step]);

  const footer = hydrated ? (
    <View style={[styles.footer, stackActions && styles.footerStacked]}>
      {session.step !== 'schedule-source' ? (
        <AppButton
          disabled={busy}
          label="뒤로"
          onPress={goBack}
          style={styles.footerButton}
          variant="secondary"
        />
      ) : null}
      <AppButton
        disabled={footerDisabled}
        label={footerLabel}
        loading={busy}
        onPress={
          session.step === 'schedule-source'
            ? continueFromSource
            : session.step === 'schedule-anchor'
              ? continueToAlarm
              : () => void save()
        }
        style={styles.footerButton}
      />
    </View>
  ) : null;

  return (
    <Screen
      key={session.step}
      contentStyle={styles.screen}
      footer={footer}
      safeAreaEdges={mode === 'reconfigure' ? ['left', 'right'] : undefined}>
      {mode === 'initial' ? (
        <View style={styles.title}>
          <AppText accessibilityRole="header" aria-level={1} variant="heading">
            근무표 설정
          </AppText>
        </View>
      ) : null}
      <SetupSessionProgress compact={compactProgress} step={stepNumber} />

      {!hydrated ? (
        <StatusBanner
          message="중단한 설정을 불러옵니다."
          title="설정 불러오는 중"
          tone="neutral"
        />
      ) : null}

      {hydrated && session.step === 'schedule-source' ? (
        <SetupSourceStep
          busy={busy}
          currentSequenceLabel={currentSequenceLabel}
          headingRef={stepHeadingRef}
          onChangeCustomSequence={changeCustomSequence}
          onReceive={() => void receiveSettings()}
          onSelectGroup={(groupId) => {
            if (groupId === 'weekday') {
              selectRecommendation('weekday');
              return;
            }
            if (groupId === 'custom') {
              beginCustomSequence();
              return;
            }
            setExpandedGroup((current) => current === groupId ? null : groupId);
            setShowCustomEditor(false);
          }}
          onSelectRecommendation={selectRecommendation}
          onUseCurrent={useCurrentSchedule}
          expandedGroup={expandedGroup}
          session={session}
          showCustomEditor={showCustomEditor}
        />
      ) : null}

      {hydrated && session.step === 'schedule-anchor' ? (
        <SetupAnchorStep
          activeShiftIds={activeShiftIds}
          focusRequest={focusRequest}
          focusShiftTypeId={focusShiftTypeId}
          headingRef={stepHeadingRef}
          onChangeTime={changeTime}
          onSelectPosition={(position) =>
            patchSession({
              position,
              alarmChoice: null,
              summaryConfirmation: null,
            })
          }
          onToggleTimeEditor={() => setShowTimeEditor((current) => !current)}
          preview={preview}
          revealValidation={revealValidation}
          session={session}
          shiftColors={{
            day: dayAppearance?.accentColor ?? palette.mintDark,
            evening: eveningAppearance?.accentColor ?? palette.indigoDark,
            night: nightAppearance?.accentColor ?? palette.violet,
          }}
          showTimeEditor={showTimeEditor}
          stackContent={stackActions}
          stackTimeInputs={stackTimeInputs}
          today={today}
          validation={validation}
        />
      ) : null}

      {hydrated && session.step === 'alarm-readiness' ? (
        <SetupAlarmStep
          headingRef={stepHeadingRef}
          onAdjustTime={() => {
            setShowTimeEditor(true);
            patchSession({
              step: 'schedule-anchor',
              alarmChoice: null,
              summaryConfirmation: null,
            });
          }}
          onAlarmEnabledChange={(enabled) =>
            patchSession({ alarmChoice: enabled ? 'prepare' : 'schedule-only' })
          }
          preview={preview}
          session={session}
          validation={validation}
        />
      ) : null}
      <SetupApplyingOverlay visible={busy} />
    </Screen>
  );
}

function createStyles() {
  return StyleSheet.create({
    screen: { gap: spacing.large, paddingTop: spacing.medium },
    title: { minHeight: 48, justifyContent: 'center' },
    footer: { flexDirection: 'row', gap: spacing.small },
    footerStacked: { flexDirection: 'column-reverse' },
    footerButton: { flex: 1 },
  });
}
