import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { DisclosureRow, SegmentedControl, StatusBanner } from '@/design-system';
import {
  triggerNotificationFeedback,
  triggerSelectionFeedback,
} from '@/features/feedback/feedback-controller';
import {
  RoutineTimingEditor,
} from '@/features/shift-settings/routine-timing-editor';
import { PayrollSettingsEditor } from '@/features/shift-settings/payroll-settings-editor';
import { formatPayrollSettingsSummary } from '@/features/shift-settings/payroll-settings-model';
import { SharedWakeSettingsEditor } from '@/features/shift-settings/shared-wake-settings-editor';
import {
  applySharedWakePatch,
  cloneWorkRoutineProfiles,
  createShiftDrafts,
  createShiftSettingsSnapshot,
  formatDraftWakeTimeSummary,
  formatShiftTimeSummary,
  getEditorSectionForDraftId,
  hasInvalidDraftForSection,
  isShiftDraftValid,
  shouldUseCompactShiftEditor,
  SUBSTITUTE_DAY_ID,
  SUBSTITUTE_NIGHT_ID,
  type EditorSection,
  type ShiftDraft,
} from '@/features/shift-settings/shift-settings-model';
import { ShiftTimingEditor } from '@/features/shift-settings/shift-timing-editor';
import { WorkPatternOverview } from '@/features/shift-settings/work-pattern-overview';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type {
  ShiftType,
  PayrollSettings,
  WorkRoutineProfiles,
  WorkRoutineTiming,
} from '@/models/app-data';
import { isValidWorkRoutineTiming } from '@/services/work-routine-settings';
import { useAppStore } from '@/store/app-store';
import { toDateKey } from '@/utils/date';
import {
  calculateShiftDuration,
  normalizeTimeInput,
  parseTimeInput,
} from '@/utils/shift-time';
import {
  getWorkPatternDisplayName,
  getWorkPatternKind,
} from '@/utils/work-pattern';

type SettingsPanel = 'pattern' | 'time' | 'routine' | 'payroll';

export default function ShiftSettingsScreen() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { showDialog } = useAppDialog();
  const styles = useThemedStyles(createStyles);
  const {
    createBackup,
    data,
    updateShiftSettings,
  } = useAppStore();
  const activeWorkShiftIds = (['day', 'evening', 'night'] as const).filter(
    (id) => data.pattern.shiftTypeIds.includes(id),
  );
  const navigation = useNavigation();
  const { fontScale, width } = useWindowDimensions();
  const allowNavigation = useRef(false);
  const [today] = useState(() => toDateKey(new Date()));
  const [drafts, setDrafts] = useState<ShiftDraft[]>(() =>
    createShiftDrafts(data.shiftTypes),
  );
  const [workRoutineProfiles, setWorkRoutineProfiles] =
    useState<WorkRoutineProfiles>(() =>
      cloneWorkRoutineProfiles(data.settings.workRoutineProfiles),
    );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    createShiftSettingsSnapshot(
      createShiftDrafts(data.shiftTypes),
      data.settings.workRoutineProfiles,
    ),
  );
  const [payrollDraft, setPayrollDraft] = useState<PayrollSettings>(() => ({
    ...data.payrollSettings,
  }));
  const [payrollDraftValid, setPayrollDraftValid] = useState(true);
  const [savedPayrollSnapshot, setSavedPayrollSnapshot] = useState(() =>
    JSON.stringify(data.payrollSettings),
  );
  const [substituteMode, setSubstituteMode] = useState<'day' | 'night'>('day');
  const [editorSection, setEditorSection] = useState<EditorSection>(
    activeWorkShiftIds[0] ?? 'day',
  );
  const [expandedRoutineKind, setExpandedRoutineKind] = useState<
    keyof WorkRoutineProfiles | null
  >(null);
  const sharedWakeShiftIds: readonly (keyof WorkRoutineProfiles)[] =
    activeWorkShiftIds;
  const focusedPanel: Extract<SettingsPanel, 'time' | 'routine'> | null =
    focus === 'wake' ? 'routine' : focus === 'time' ? 'time' : null;
  const [showAllSettings, setShowAllSettings] = useState(focusedPanel === null);
  const [activePanel, setActivePanel] = useState<SettingsPanel | null>(() =>
    focusedPanel,
  );
  const [saving, setSaving] = useState(false);
  const screenTitle = showAllSettings
    ? '근무표 설정'
    : focus === 'wake'
      ? '기상 시간'
      : focus === 'time'
        ? '근무 시간'
        : '근무표 설정';

  const weekdayFixed =
    getWorkPatternKind(data.pattern.shiftTypeIds) === 'weekday';
  const compactEditor = shouldUseCompactShiftEditor(width, fontScale);
  const shiftLabels = { day: '주간', evening: '오후', night: '야간' } as const;
  const editorSections: readonly {
    label: string;
    value: EditorSection;
  }[] = [
    ...activeWorkShiftIds.map((value) => ({ label: shiftLabels[value], value })),
    { label: '특근', value: 'substitute' as const },
  ];
  const selectedShift = data.shiftTypes.find(
    (shift) => shift.id === editorSection,
  );
  const selectedDraft = drafts.find(
    (draft) => draft.id === selectedShift?.id,
  );

  const inferredDayChanges = drafts.some((draft) => {
    const shift = data.shiftTypes.find((item) => item.id === draft.id);
    const startMinutes = parseTimeInput(draft.start);
    const endMinutes = parseTimeInput(draft.end);
    if (!shift || startMinutes === null || endMinutes === null) return false;
    const duration = calculateShiftDuration(startMinutes, endMinutes);
    return duration !== null && duration.endsNextDay !== shift.endsNextDay;
  });
  const invalidRoutineIssue = activeWorkShiftIds
    .map((kind) => {
      const profile = workRoutineProfiles[kind];
      const relevantDraftIds =
        kind === 'night'
          ? ['night']
          : kind === 'evening'
            ? ['evening']
            : ['day'];
      const relevantDrafts = drafts.filter((draft) =>
        relevantDraftIds.includes(draft.id),
      );
      const conflictingDraft = relevantDrafts.find(
        (draft) => draft.alarmMinutesBefore <= profile.departMinutesBefore,
      );
      if (isValidWorkRoutineTiming(profile) && !conflictingDraft) return null;

      const preferredDraft =
        conflictingDraft ??
        relevantDrafts.find((draft) =>
          weekdayFixed && kind === 'night'
            ? draft.id === SUBSTITUTE_NIGHT_ID
            : draft.id === kind,
        ) ??
        relevantDrafts[0];
      return {
        kind,
        draftId: preferredDraft?.id ?? kind,
      };
    })
    .find((issue) => issue !== null);
  const invalidRoutineSection = invalidRoutineIssue
    ? getEditorSectionForDraftId(invalidRoutineIssue.draftId)
    : undefined;
  const payrollSnapshot = JSON.stringify(payrollDraft);
  const hasPayrollChanges = payrollSnapshot !== savedPayrollSnapshot;
  const hasUnsavedChanges =
    createShiftSettingsSnapshot(drafts, workRoutineProfiles) !== savedSnapshot ||
    inferredDayChanges ||
    hasPayrollChanges;
  const hasInvalidDrafts =
    drafts.some((draft) => !isShiftDraftValid(draft)) ||
    invalidRoutineSection !== undefined ||
    !payrollDraftValid;
  const saveDisabled = saving || (!hasUnsavedChanges && !hasInvalidDrafts);
  const saveLabel = saving
    ? '저장 중'
    : hasInvalidDrafts
      ? '설정 확인'
      : hasUnsavedChanges
        ? '저장하기'
        : '변경 내용 없음';
  const substituteDay = data.shiftTypes.find(
    (shift) => shift.id === SUBSTITUTE_DAY_ID,
  );
  const substituteNight = data.shiftTypes.find(
    (shift) => shift.id === SUBSTITUTE_NIGHT_ID,
  );
  const activeSubstitute =
    substituteMode === 'night' ? substituteNight : substituteDay;
  const activeSubstituteDraft = drafts.find(
    (draft) => draft.id === activeSubstitute?.id,
  );

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
          '입력한 근무 시간과 근무 알람 설정이 사라집니다.',
          [
            {
              text: '계속 설정하기',
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

  const updateDraft = (id: string, patch: Partial<ShiftDraft>) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const updateRoutineProfile = (
    kind: keyof WorkRoutineProfiles,
    profile: WorkRoutineTiming,
  ) => {
    setWorkRoutineProfiles((current) => ({
      ...current,
      [kind]: profile,
    }));
  };

  const focusDraft = (
    draftId: string,
    targetPanel: Extract<SettingsPanel, 'time' | 'routine'> = 'time',
  ) => {
    const section = getEditorSectionForDraftId(draftId);
    setActivePanel(targetPanel);
    setEditorSection(section);
    if (targetPanel === 'routine' && section !== 'substitute') {
      setExpandedRoutineKind(section);
    }
    if (section === 'substitute') {
      setSubstituteMode(
        draftId === SUBSTITUTE_NIGHT_ID ? 'night' : 'day',
      );
    }
  };

  const saveAll = async () => {
    if (saving) return;
    const firstInvalidDraft = drafts.find(
      (draft) => !isShiftDraftValid(draft),
    );
    if (firstInvalidDraft) {
      const invalidShift = data.shiftTypes.find(
        (shift) => shift.id === firstInvalidDraft.id,
      );
      focusDraft(firstInvalidDraft.id);
      showDialog(
        '근무 시간 입력 오류',
        `${invalidShift?.name ?? '근무'} · 06:45 형식만 사용할 수 있습니다.`,
      );
      return;
    }
    if (invalidRoutineIssue) {
      focusDraft(invalidRoutineIssue.draftId, 'routine');
      showDialog(
        '출근 루틴 입력 오류',
        '기상 알람 → 출발 → 도착 → 교대 완료 순서로 5분 단위만 사용할 수 있습니다.',
      );
      return;
    }
    if (!payrollDraftValid) {
      setActivePanel('payroll');
      void AccessibilityInfo.announceForAccessibility(
        '급여일 입력 오류.',
      );
      showDialog(
        '급여일 입력 오류',
        '1부터 31 사이의 숫자만 사용할 수 있습니다.',
      );
      return;
    }

    const parsed: {
      draft: ShiftDraft;
      startMinutes: number;
      endMinutes: number;
      duration: NonNullable<ReturnType<typeof calculateShiftDuration>>;
    }[] = [];
    for (const draft of drafts) {
      const shift = data.shiftTypes.find((item) => item.id === draft.id);
      const startMinutes = parseTimeInput(draft.start);
      const endMinutes = parseTimeInput(draft.end);
      if (!shift || startMinutes === null || endMinutes === null) {
        focusDraft(draft.id);
        showDialog(
          '근무 시간 입력 오류',
          `${shift?.name ?? '근무'} · 06:45 형식만 사용할 수 있습니다.`,
        );
        return;
      }
      const duration = calculateShiftDuration(startMinutes, endMinutes);
      if (!duration) {
        focusDraft(draft.id);
        showDialog(
          `${shift.name} 시간 입력 오류`,
          '시작과 종료 시간은 달라야 합니다.',
        );
        return;
      }
      parsed.push({ draft, startMinutes, endMinutes, duration });
    }

    setSaving(true);
    try {
      try {
        await createBackup();
      } catch {
        showDialog(
          '안전 백업을 만들지 못했습니다',
          '기존 근무 설정을 보호하기 위해 변경 내용을 저장하지 않았습니다.',
        );
        return;
      }
      const shiftTypePatches: Record<string, Partial<ShiftType>> =
        Object.fromEntries(
          parsed.map((item) => {
            const timePatch = {
              startMinutes: item.startMinutes,
              endMinutes: item.endMinutes,
              endsNextDay: item.duration.endsNextDay,
            };
            return [
              item.draft.id,
              item.draft.id === SUBSTITUTE_DAY_ID ||
              item.draft.id === SUBSTITUTE_NIGHT_ID
                ? timePatch
                : {
                    ...timePatch,
                    alarmEnabled: item.draft.alarmEnabled,
                    alarmMinutesBefore: item.draft.alarmMinutesBefore,
                  },
            ];
          }),
        );
      const saved = await updateShiftSettings(
        shiftTypePatches,
        workRoutineProfiles,
        payrollDraft,
      );
      if (!saved) {
        showDialog(
          '근무 설정을 저장하지 못했습니다',
          '기존 설정을 유지했습니다. 저장 공간 확인 후 다시 저장합니다.',
        );
        return;
      }
      const normalizedDrafts = drafts.map((draft) => ({
        ...draft,
        start: normalizeTimeInput(draft.start),
        end: normalizeTimeInput(draft.end),
      }));
      setDrafts(normalizedDrafts);
      setSavedSnapshot(
        createShiftSettingsSnapshot(normalizedDrafts, workRoutineProfiles),
      );
      setSavedPayrollSnapshot(payrollSnapshot);
      void AccessibilityInfo.announceForAccessibility(
        '근무표 설정을 저장했습니다.',
      );
      void triggerNotificationFeedback('success');
    } finally {
      setSaving(false);
    }
  };

  const sectionOptions = editorSections.map((section) => ({
    value: section.value,
    label: `${section.label}${
      hasInvalidDraftForSection(drafts, section.value) ||
      invalidRoutineSection === section.value
        ? ' · 확인'
        : ''
    }`,
    accessibilityLabel: `${section.label} 근무 설정${
      hasInvalidDraftForSection(drafts, section.value) ||
      invalidRoutineSection === section.value
        ? '. 시간을 확인해야 합니다.'
        : ''
    }`,
  }));
  const patternSummary = getWorkPatternDisplayName(
    data.pattern.shiftTypeIds,
    data.pattern.name,
  );
  const timeSummary = formatShiftTimeSummary(
    data.shiftTypes,
    activeWorkShiftIds,
  );
  const routineSummary = formatDraftWakeTimeSummary(
    drafts,
    activeWorkShiftIds.includes('night'),
    activeWorkShiftIds.includes('evening'),
    activeWorkShiftIds.includes('day'),
  );
  const payrollSummary = payrollDraftValid
    ? formatPayrollSettingsSummary(payrollDraft)
    : '날짜 확인 필요';
  const togglePanel = (panel: SettingsPanel) => {
    void triggerSelectionFeedback();
    if (panel === 'routine' && editorSection === 'substitute') {
      setEditorSection(substituteMode);
    }
    setActivePanel((current) => (current === panel ? null : panel));
  };
  const openFirstInvalidSetting = () => {
    if (invalidRoutineIssue) {
      focusDraft(invalidRoutineIssue.draftId, 'routine');
      return;
    }
    const invalidDraft = drafts.find((draft) => !isShiftDraftValid(draft));
    if (invalidDraft) {
      focusDraft(invalidDraft.id, 'time');
      return;
    }
    if (!payrollDraftValid) {
      setActivePanel('payroll');
      void AccessibilityInfo.announceForAccessibility(
        '급여일 입력 오류.',
      );
    }
  };
  const timeEditor = (
    <View style={styles.editorBody}>
      <SegmentedControl
        label="근무 종류"
        onChange={(section) => {
          void triggerSelectionFeedback();
          setEditorSection(section);
        }}
        options={sectionOptions}
        value={editorSection}
      />

      {editorSection !== 'substitute' && selectedShift && selectedDraft ? (
        <ShiftTimingEditor
          compact={compactEditor}
          draft={selectedDraft}
          onChange={(patch) => updateDraft(selectedShift.id, patch)}
          shift={selectedShift}
          showHeader={showAllSettings}
          visibleSection="time"
        />
      ) : null}

      {editorSection === 'substitute' &&
      activeSubstitute &&
      activeSubstituteDraft ? (
        <ShiftTimingEditor
          compact={compactEditor}
          draft={activeSubstituteDraft}
          onChange={(patch) => updateDraft(activeSubstitute.id, patch)}
          onSubstituteModeChange={setSubstituteMode}
          shift={activeSubstitute}
          showHeader={showAllSettings}
          substituteDayHasError={
            substituteDay
              ? !isShiftDraftValid(
                  drafts.find((draft) => draft.id === substituteDay.id) ??
                    activeSubstituteDraft,
                )
              : false
          }
          substituteMode={substituteMode}
          substituteNightHasError={
            substituteNight
              ? !isShiftDraftValid(
                  drafts.find((draft) => draft.id === substituteNight.id) ??
                    activeSubstituteDraft,
                )
              : false
          }
          visibleSection="time"
        />
      ) : null}
    </View>
  );
  const routineEditor = (
    <View style={styles.editorBody}>
      <SharedWakeSettingsEditor
        compact={compactEditor}
        drafts={drafts}
        onChange={(draftIds, patch) =>
          setDrafts((current) =>
            applySharedWakePatch(current, draftIds, patch),
          )
        }
        shifts={sharedWakeShiftIds
          .map((id) => data.shiftTypes.find((shift) => shift.id === id))
          .filter((shift): shift is ShiftType => shift !== undefined)}
      />

      <View style={styles.routineDetails}>
        <View style={styles.routineDetailsCopy}>
          <AppText accessibilityRole="header" variant="label">
            출근 루틴 세부 설정
          </AppText>
          <AppText tone="secondary" variant="caption">
            출발·도착 시각은 필요한 근무만 열어 조정합니다.
          </AppText>
        </View>
        {activeWorkShiftIds.map((kind) => {
          const draft = drafts.find((item) => item.id === kind);
          if (!draft) return null;
          return (
          <RoutineTimingEditor
            alarmMinutesBefore={draft.alarmMinutesBefore}
            compact={compactEditor}
            expanded={expandedRoutineKind === kind}
            key={kind}
            kind={kind}
            onChange={(profile) =>
              updateRoutineProfile(kind, profile)
            }
            onExpandedChange={(expanded) =>
              setExpandedRoutineKind(expanded ? kind : null)
            }
            profile={workRoutineProfiles[kind]}
            startMinutes={parseTimeInput(draft.start)}
          />
          );
        })}
      </View>

      <AppText tone="secondary" variant="caption">
        주대와 야대는 각각 주간과 야간의 기상·출근 설정을 사용합니다.
      </AppText>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: screenTitle }} />
      <Screen
        contentStyle={styles.screen}
        safeAreaEdges={['left', 'right']}
        footer={
          <AppButton
            disabled={saveDisabled}
            icon="checkmark"
            label={saveLabel}
            loading={saving}
            onPress={() => void saveAll()}
          />
        }>
        <View style={styles.section}>
          {!showAllSettings && focusedPanel === 'time' ? timeEditor : null}
          {!showAllSettings && focusedPanel === 'routine' ? routineEditor : null}
          {!showAllSettings && focusedPanel ? (
            <AppButton
              accessibilityHint="근무 방식, 근무 시간, 기상·출근 루틴과 급여일 설정을 모두 표시합니다."
              icon="options-outline"
              label="전체 설정 보기"
              onPress={() => setShowAllSettings(true)}
              variant="ghost"
            />
          ) : null}

          {showAllSettings ? (
            <>
          <DisclosureRow
            expanded={activePanel === 'pattern'}
            icon="repeat-outline"
            onPress={() => togglePanel('pattern')}
            style={styles.disclosure}
            subtitle={patternSummary}
            title="근무 순서"
          />
          {activePanel === 'pattern' ? (
            <View style={styles.editorBody}>
              <WorkPatternOverview
                data={data}
                onBrowsePatterns={() => router.push('/pattern-library' as never)}
                onEdit={() => router.push('/pattern')}
                today={today}
              />
            </View>
          ) : null}

          <DisclosureRow
            expanded={activePanel === 'time'}
            icon="time-outline"
            onPress={() => togglePanel('time')}
            style={styles.disclosure}
            subtitle={timeSummary}
            title="근무 시간"
          />

          {activePanel === 'time' ? timeEditor : null}

          <DisclosureRow
            expanded={activePanel === 'routine'}
            icon="alarm-outline"
            onPress={() => togglePanel('routine')}
            style={styles.disclosure}
            subtitle={routineSummary}
            title="기상·출근 루틴"
          />
          {activePanel === 'routine' ? routineEditor : null}

          <DisclosureRow
            expanded={activePanel === 'payroll'}
            icon="calendar-outline"
            onPress={() => togglePanel('payroll')}
            style={styles.disclosure}
            subtitle={payrollSummary}
            title="급여일"
          />
          {activePanel === 'payroll' ? (
            <View style={styles.editorBody}>
              <PayrollSettingsEditor
                onChange={(next) => {
                  setPayrollDraftValid(next !== null);
                  if (next) setPayrollDraft(next);
                }}
                value={payrollDraft}
              />
            </View>
          ) : null}
            </>
          ) : null}

          {hasInvalidDrafts ? (
            <StatusBanner
              actionLabel="오류 보기"
              message="근무 시간·출근 루틴·급여일 중 오류가 있습니다."
              onAction={openFirstInvalidSetting}
              title="입력 오류"
              tone="danger"
            />
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
      paddingTop: spacing.small,
    },
    section: {
      gap: spacing.medium,
    },
    disclosure: {
      borderWidth: 1,
      borderColor: palette.line,
    },
    editorBody: {
      gap: spacing.medium,
      paddingHorizontal: spacing.small,
      paddingBottom: spacing.small,
    },
    routineDetails: {
      gap: spacing.small,
      paddingTop: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    routineDetailsCopy: { gap: spacing.tiny },
  });
}
