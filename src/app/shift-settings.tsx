import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { DisclosureRow, SegmentedControl, StatusBanner } from '@/design-system';
import {
  RoutineTimingEditor,
} from '@/features/shift-settings/routine-timing-editor';
import { PayrollSettingsEditor } from '@/features/shift-settings/payroll-settings-editor';
import { formatPayrollSettingsSummary } from '@/features/shift-settings/payroll-settings-model';
import {
  cloneWorkRoutineProfiles,
  createShiftDrafts,
  createShiftSettingsSnapshot,
  formatDraftWakeTimeSummary,
  formatShiftTimeSummary,
  getEditorSectionForDraftId,
  hasInvalidDraftForSection,
  isShiftDraftValid,
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
    updatePayrollSettings,
    updateShiftTypes,
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
  const [substituteMode, setSubstituteMode] = useState<'day' | 'night'>('day');
  const [editorSection, setEditorSection] = useState<EditorSection>(
    activeWorkShiftIds[0] ?? 'day',
  );
  const [activePanel, setActivePanel] = useState<SettingsPanel | null>(() =>
    focus === 'wake' ? 'routine' : focus === 'time' ? 'time' : null,
  );
  const [saving, setSaving] = useState(false);
  const screenTitle =
    focus === 'wake'
      ? '기상 시간'
      : focus === 'time'
        ? '근무 시간'
        : '근무표 설정';

  const weekdayFixed =
    getWorkPatternKind(data.pattern.shiftTypeIds) === 'weekday';
  const compactEditor = width < 380 || fontScale >= 1.25;
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
  const hasUnsavedChanges =
    createShiftSettingsSnapshot(drafts, workRoutineProfiles) !== savedSnapshot ||
    inferredDayChanges;
  const hasInvalidDrafts =
    drafts.some((draft) => !isShiftDraftValid(draft)) ||
    invalidRoutineSection !== undefined;
  const saveDisabled = saving || (!hasUnsavedChanges && !hasInvalidDrafts);
  const saveLabel = saving
    ? '저장 중'
    : hasInvalidDrafts
      ? '시간 확인하기'
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
        '시간을 확인해야 합니다',
        `${invalidShift?.name ?? '근무'} 시간을 06:45 형식으로 정확히 입력해야 합니다.`,
      );
      return;
    }
    if (invalidRoutineIssue) {
      focusDraft(invalidRoutineIssue.draftId, 'routine');
      showDialog(
        '출근 루틴을 확인해야 합니다',
        '기상 알람, 출발, 도착, 교대 완료 순서가 맞도록 5분 단위로 설정해야 합니다.',
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
          '시간을 확인해야 합니다',
          `${shift?.name ?? '근무'} 시간을 06:45 형식으로 정확히 입력해야 합니다.`,
        );
        return;
      }
      const duration = calculateShiftDuration(startMinutes, endMinutes);
      if (!duration) {
        focusDraft(draft.id);
        showDialog(
          `${shift.name} 시간을 확인해야 합니다`,
          '시작과 종료 시간을 다르게 입력해야 합니다.',
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
      const saved = await updateShiftTypes(
        shiftTypePatches,
        workRoutineProfiles,
      );
      if (!saved) {
        showDialog(
          '근무 설정을 저장하지 못했습니다',
          '휴대폰 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
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
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
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
  const payrollSummary = formatPayrollSettingsSummary(data.payrollSettings);
  const routineSectionOptions = sectionOptions.filter(
    (option) => option.value !== 'substitute',
  );
  const togglePanel = (panel: SettingsPanel) => {
    void Haptics.selectionAsync();
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
    if (invalidDraft) focusDraft(invalidDraft.id, 'time');
  };

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
        <View style={styles.intro}>
          <AppText tone="secondary" style={styles.centerText} variant="body">
            현재 설정을 확인하고 필요한 항목만 열어 수정해야 합니다.
          </AppText>
        </View>

        <View style={styles.section}>
          <DisclosureRow
            expanded={activePanel === 'pattern'}
            icon="repeat-outline"
            onPress={() => togglePanel('pattern')}
            subtitle={patternSummary}
            title="근무 방식"
          />
          {activePanel === 'pattern' ? (
            <View style={styles.editorBody}>
              <WorkPatternOverview
                data={data}
                onEdit={() => router.push('/pattern')}
                today={today}
              />
            </View>
          ) : null}

          <DisclosureRow
            expanded={activePanel === 'time'}
            icon="time-outline"
            onPress={() => togglePanel('time')}
            subtitle={timeSummary}
            title="근무 시간"
          />

          {activePanel === 'time' ? (
            <View style={styles.editorBody}>
              <SegmentedControl
                label="근무 종류"
                onChange={(section) => {
                  void Haptics.selectionAsync();
                  setEditorSection(section);
                }}
                options={sectionOptions}
                value={editorSection}
              />

              {editorSection !== 'substitute' &&
              selectedShift &&
              selectedDraft ? (
                <>
                  <ShiftTimingEditor
                    compact={compactEditor}
                    draft={selectedDraft}
                    onChange={(patch) => updateDraft(selectedShift.id, patch)}
                    shift={selectedShift}
                    visibleSection="time"
                  />
                </>
              ) : null}

              {editorSection === 'substitute' &&
              activeSubstitute &&
              activeSubstituteDraft ? (
                <>
                  <ShiftTimingEditor
                    compact={compactEditor}
                    draft={activeSubstituteDraft}
                    onChange={(patch) =>
                      updateDraft(activeSubstitute.id, patch)
                    }
                    onSubstituteModeChange={(mode) => {
                      setSubstituteMode(mode);
                    }}
                    shift={activeSubstitute}
                    substituteDayHasError={
                      substituteDay
                        ? !isShiftDraftValid(
                            drafts.find(
                              (draft) => draft.id === substituteDay.id,
                            ) ?? activeSubstituteDraft,
                          )
                        : false
                    }
                    substituteMode={substituteMode}
                    substituteNightHasError={
                      substituteNight
                        ? !isShiftDraftValid(
                            drafts.find(
                              (draft) => draft.id === substituteNight.id,
                            ) ?? activeSubstituteDraft,
                          )
                        : false
                    }
                    visibleSection="time"
                  />
                </>
              ) : null}
            </View>
          ) : null}

          <DisclosureRow
            expanded={activePanel === 'routine'}
            icon="alarm-outline"
            onPress={() => togglePanel('routine')}
            subtitle={routineSummary}
            title="기상·출근 루틴"
          />
          {activePanel === 'routine' ? (
            <View style={styles.editorBody}>
              <SegmentedControl
                label="근무 종류"
                onChange={(section) => {
                  void Haptics.selectionAsync();
                  setEditorSection(section);
                }}
                options={routineSectionOptions}
                value={editorSection}
              />

              {editorSection !== 'substitute' && selectedDraft ? (
                <>
                  {selectedShift ? (
                    <ShiftTimingEditor
                      compact={compactEditor}
                      draft={selectedDraft}
                      onChange={(patch) => updateDraft(selectedShift.id, patch)}
                      shift={selectedShift}
                      visibleSection="wake"
                    />
                  ) : null}
                  <RoutineTimingEditor
                    alarmMinutesBefore={selectedDraft.alarmMinutesBefore}
                    compact={compactEditor}
                    expanded
                    kind={editorSection}
                    onChange={(profile) =>
                      updateRoutineProfile(editorSection, profile)
                    }
                    onExpandedChange={() => undefined}
                    profile={workRoutineProfiles[editorSection]}
                    showDisclosure={false}
                    startMinutes={parseTimeInput(selectedDraft.start)}
                  />
                </>
              ) : null}

              <StatusBanner
                message="주대는 주간 기상 알람과 출근 루틴을, 야대는 야간 설정을 그대로 사용합니다."
                title="주대·야대 알람은 자동으로 이어받습니다"
                tone="info"
              />
            </View>
          ) : null}

          <DisclosureRow
            expanded={activePanel === 'payroll'}
            icon="calendar-outline"
            onPress={() => togglePanel('payroll')}
            subtitle={payrollSummary}
            title="급여일"
          />
          {activePanel === 'payroll' ? (
            <View style={styles.editorBody}>
              <PayrollSettingsEditor
                onSave={updatePayrollSettings}
                value={data.payrollSettings}
              />
            </View>
          ) : null}

          {hasInvalidDrafts ? (
            <StatusBanner
              actionLabel="확인하기"
              message="근무 시간 또는 출근 루틴을 확인해야 합니다."
              onAction={openFirstInvalidSetting}
              title="설정 확인 필요"
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
      gap: spacing.xlarge,
      paddingTop: spacing.small,
    },
    intro: {
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.small,
    },
    centerText: {
      textAlign: 'center',
    },
    section: {
      gap: spacing.small,
    },
    editorBody: {
      gap: spacing.medium,
      paddingTop: spacing.tiny,
    },
  });
}
