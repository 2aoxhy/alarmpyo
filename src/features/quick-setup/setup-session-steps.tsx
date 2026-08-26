import type { RefObject } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AppSheet } from '@/components/app-sheet';
import { SelectionCard, SelectionPill } from '@/components/selection-controls';
import { AppButton, AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner, Surface, ToggleRow } from '@/design-system';
import {
  PatternSequenceEditor,
  WorkTimeEditor,
} from '@/features/setup/setup-components';
import type {
  EditableWorkShiftId,
  WorkPatternDraftValidation,
} from '@/features/setup/work-pattern-draft';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  getWorkPatternCategoryId,
  getWorkPatternPreset,
  type BaseWorkShiftId,
  type WorkPatternPresetId,
} from '@/utils/work-pattern';

import {
  formatQuickSequence,
  QUICK_SETUP_GROUPS,
  QUICK_SETUP_OPTIONS,
  type QuickSetupGroupId,
} from './quick-setup-model';
import type { SetupSessionDraftV2 } from './setup-session-model';

type StepHeadingRef = RefObject<Text | null>;
type PreviewItem = {
  dateKey: string;
  dateLabel: string;
  shiftTypeId: string;
  shiftLabel: string;
};

const SHIFT_NAMES: Record<Exclude<BaseWorkShiftId, 'off'>, string> = {
  day: '주간',
  evening: '오후',
  night: '야간',
};

const ALL_SHIFT_NAMES: Record<BaseWorkShiftId, string> = {
  ...SHIFT_NAMES,
  off: '휴무',
};

export function SetupSourceStep({
  busy,
  currentSequenceLabel,
  expandedGroup,
  headingRef,
  onChangeCustomSequence,
  onReceive,
  onSelectGroup,
  onSelectRecommendation,
  onUseCurrent,
  session,
  showCustomEditor,
}: {
  busy: boolean;
  currentSequenceLabel: string;
  expandedGroup: QuickSetupGroupId | null;
  headingRef: StepHeadingRef;
  onChangeCustomSequence: (sequence: BaseWorkShiftId[]) => void;
  onReceive: () => void;
  onSelectGroup: (groupId: QuickSetupGroupId) => void;
  onSelectRecommendation: (presetId: WorkPatternPresetId) => void;
  onUseCurrent: () => void;
  session: SetupSessionDraftV2;
  showCustomEditor: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const selectedGroup =
    session.source === 'custom'
      ? 'custom'
      : session.source === 'recommended'
        ? getWorkPatternCategoryId(session.presetId)
        : null;
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <AppText accessibilityLabel="근무 순서 선택" accessibilityRole="header" ref={headingRef} variant="heading">
          근무 방식
        </AppText>
        <AppText tone="secondary" variant="caption">
          회사 근무 방식 선택
        </AppText>
      </View>
      {session.mode === 'reconfigure' ? (
        <SelectionCard
          accessibilityLabel={`현재 근무표 사용. ${currentSequenceLabel}`}
          onPress={onUseCurrent}
          selected={session.source === 'current'}>
          <View style={styles.optionCopy}>
            <AppText variant="label">현재 순서 그대로</AppText>
            <AppText tone="secondary" variant="caption">
              {currentSequenceLabel}
            </AppText>
          </View>
        </SelectionCard>
      ) : null}
      <Surface density="compact" style={styles.choiceSurface}>
        {QUICK_SETUP_GROUPS.map((group) => {
          const groupOptions = QUICK_SETUP_OPTIONS.filter(
            (option) => option.groupId === group.id,
          );
          const expanded = expandedGroup === group.id;
          const selected = selectedGroup === group.id;
          return (
            <View key={group.id}>
              <SelectionCard
                accessibilityHint={
                  groupOptions.length > 1
                    ? '세부 근무 방식을 표시합니다.'
                    : undefined
                }
                accessibilityLabel={`${group.label}. ${group.detail}`}
                accessibilityRole="button"
                contentStyle={styles.choiceRowContent}
                onPress={() => onSelectGroup(group.id)}
                selected={selected}
                style={styles.choiceRow}>
                <View style={styles.optionCopy}>
                  <AppText variant="label">{group.label}</AppText>
                  <AppText tone="secondary" variant="caption">
                    {group.detail}
                  </AppText>
                </View>
                {groupOptions.length > 1 ? (
                  <AppText tone="secondary" variant="caption">
                    {expanded ? '닫기' : '선택'}
                  </AppText>
                ) : null}
              </SelectionCard>
              {expanded && groupOptions.length > 1 ? (
                <View
                  accessibilityLabel={`${group.label} 유형`}
                  accessibilityRole="radiogroup"
                  style={styles.nestedOptions}>
                  {groupOptions.map((option) => (
                    <SelectionCard
                      accessibilityLabel={`${option.label}. ${option.detail}`}
                      contentStyle={styles.choiceRowContent}
                      key={option.presetId}
                      onPress={() => onSelectRecommendation(option.presetId)}
                      selected={
                        session.source === 'recommended' &&
                        session.presetId === option.presetId
                      }
                      style={styles.nestedChoiceRow}>
                      <View style={styles.optionCopy}>
                        <AppText variant="label">{option.label}</AppText>
                        <AppText tone="secondary" variant="caption">
                          {option.detail}
                        </AppText>
                      </View>
                    </SelectionCard>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Surface>
      {showCustomEditor ? (
        <Surface style={styles.editorCard}>
          <AppText accessibilityRole="header" variant="label">
            반복 근무 순서
          </AppText>
          <PatternSequenceEditor
            onChange={onChangeCustomSequence}
            sequence={session.sequence}
          />
        </Surface>
      ) : null}
      <AppButton
        icon="download-outline"
        label="파일 불러오기"
        loading={busy}
        onPress={onReceive}
        variant="ghost"
      />
    </View>
  );
}

export function SetupAnchorStep({
  activeShiftIds,
  focusRequest,
  focusShiftTypeId,
  headingRef,
  onChangeTime,
  onSelectPosition,
  onToggleTimeEditor,
  preview,
  revealValidation,
  session,
  shiftColors,
  showTimeEditor,
  stackContent,
  stackTimeInputs,
  today,
  validation,
}: {
  activeShiftIds: EditableWorkShiftId[];
  focusRequest: number;
  focusShiftTypeId: EditableWorkShiftId | null;
  headingRef: StepHeadingRef;
  onChangeTime: (
    shiftTypeId: EditableWorkShiftId,
    field: 'start' | 'end',
    value: string,
  ) => void;
  onSelectPosition: (position: number) => void;
  onToggleTimeEditor: () => void;
  preview: PreviewItem[];
  revealValidation: boolean;
  session: SetupSessionDraftV2;
  shiftColors: Record<EditableWorkShiftId, string>;
  showTimeEditor: boolean;
  stackContent: boolean;
  stackTimeInputs: boolean;
  today: string;
  validation: WorkPatternDraftValidation;
}) {
  const styles = useThemedStyles(createStyles);
  const shiftRoles = session.sequence.filter(
    (id, index) => session.sequence.indexOf(id) === index,
  );
  const selectedRole =
    session.position === null ? null : session.sequence[session.position] ?? null;
  const occurrencePositions = selectedRole === null
    ? []
    : session.sequence.flatMap((id, index) => id === selectedRole ? [index] : []);
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <AppText accessibilityLabel="오늘 근무와 시간" accessibilityRole="header" ref={headingRef} variant="heading">
          오늘 근무
        </AppText>
        <AppText tone="secondary" variant="caption">
          같은 근무가 이어지면 1·2일차 선택
        </AppText>
      </View>
      <View style={styles.inlineSummary}>
        <AppText variant="label">근무 순서</AppText>
        <AppText tone="secondary" variant="body">
          {formatQuickSequence(session.sequence)}
        </AppText>
      </View>
      {session.source === 'current' ? (
        <StatusBanner
          message="기존 순서·기준일을 변경하지 않습니다."
          title="현재 근무표 기준"
          tone="neutral"
        />
      ) : session.presetId === 'weekday' ? (
        <StatusBanner
          message="월~금 주간 · 토~일 휴무"
          title="요일 기준"
          tone="neutral"
        />
      ) : (
        <View style={styles.roleSelection}>
          <View
            accessibilityLabel="오늘 근무"
            accessibilityRole="radiogroup"
            style={styles.positionOptions}>
            {shiftRoles.map((id) => {
              const firstPosition = session.sequence.indexOf(id);
              return (
                <SelectionPill
                  key={id}
                  label={ALL_SHIFT_NAMES[id]}
                  onPress={() => onSelectPosition(firstPosition)}
                  selected={selectedRole === id}
                  style={styles.positionOption}
                />
              );
            })}
          </View>
          {occurrencePositions.length > 1 ? (
            <View
              accessibilityLabel={`${ALL_SHIFT_NAMES[selectedRole!]} 일차`}
              accessibilityRole="radiogroup"
              style={styles.positionOptions}>
              {occurrencePositions.map((position, index) => (
                <SelectionPill
                  key={position}
                  label={`${index + 1}일차`}
                  onPress={() => onSelectPosition(position)}
                  selected={session.position === position}
                  style={styles.positionOption}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}
      {preview.length > 0 ? (
        <Surface style={styles.previewCard}>
          <AppText accessibilityRole="header" variant="label">
            근무 예시
          </AppText>
          <View style={styles.previewList}>
            {preview.map((item) => (
              <View
                accessible
                accessibilityLabel={`${item.dateLabel}. ${item.shiftLabel}`}
                key={item.dateKey}
                style={[styles.previewRow, stackContent && styles.previewRowStacked]}>
                <AppText tone="secondary" variant="caption">
                  {item.dateKey === today ? `오늘 · ${item.dateLabel}` : item.dateLabel}
                </AppText>
                <AppText variant="label">{item.shiftLabel}</AppText>
              </View>
            ))}
          </View>
        </Surface>
      ) : (
        <StatusBanner
          message="오늘 근무를 선택하면 7일 예시를 표시합니다."
          title="오늘 근무 미선택"
          tone="neutral"
        />
      )}
      <Surface style={styles.timeCard}>
        <View style={styles.timeHeading}>
          <View style={styles.optionCopy}>
            <AppText accessibilityRole="header" variant="label">
              근무 시간
            </AppText>
            <AppText tone="secondary" variant="caption">
              {activeShiftIds
                .map(
                  (id) =>
                    `${SHIFT_NAMES[id]} ${session.times[id].start}~${session.times[id].end}`,
                )
                .join(' · ')}
            </AppText>
          </View>
          <AppButton
            label="수정"
            onPress={onToggleTimeEditor}
            size="compact"
            variant="secondary"
          />
        </View>
      </Surface>
      <AppSheet
        onClose={onToggleTimeEditor}
        title="근무 시간"
        visible={showTimeEditor}>
        <WorkTimeEditor
          dayColor={shiftColors.day}
          dayDuration={validation.shifts.day.duration}
          dayEnd={session.times.day.end}
          dayStart={session.times.day.start}
          eveningColor={shiftColors.evening}
          eveningDuration={validation.shifts.evening.duration}
          eveningEnd={session.times.evening.end}
          eveningStart={session.times.evening.start}
          focusRequest={focusRequest}
          focusShiftTypeId={focusShiftTypeId}
          nightColor={shiftColors.night}
          nightDuration={validation.shifts.night.duration}
          nightEnd={session.times.night.end}
          nightStart={session.times.night.start}
          onChangeDayEnd={(value) => onChangeTime('day', 'end', value)}
          onChangeDayStart={(value) => onChangeTime('day', 'start', value)}
          onChangeEveningEnd={(value) => onChangeTime('evening', 'end', value)}
          onChangeEveningStart={(value) => onChangeTime('evening', 'start', value)}
          onChangeNightEnd={(value) => onChangeTime('night', 'end', value)}
          onChangeNightStart={(value) => onChangeTime('night', 'start', value)}
          revealErrors={revealValidation}
          showDay={activeShiftIds.includes('day')}
          showEvening={activeShiftIds.includes('evening')}
          showNight={activeShiftIds.includes('night')}
          stackTimeInputs={stackTimeInputs}
        />
      </AppSheet>
      {!validation.safety.canSave ? (
        <StatusBanner
          message="이전 근무 종료 전 다음 근무 시작 · 시간 수정 필요"
          title="근무 시간 겹침"
          tone="danger"
        />
      ) : !validation.safety.canEnableAlarms ? (
        <StatusBanner
          message="시간 수정 또는 알람 끄기 선택"
          title="알람 시간 겹침"
          tone="warning"
        />
      ) : null}
    </View>
  );
}

export function SetupAlarmStep({
  headingRef,
  onAlarmEnabledChange,
  onAdjustTime,
  preview,
  session,
  validation,
}: {
  headingRef: StepHeadingRef;
  onAlarmEnabledChange: (enabled: boolean) => void;
  onAdjustTime: () => void;
  preview: PreviewItem[];
  session: SetupSessionDraftV2;
  validation: WorkPatternDraftValidation;
}) {
  const styles = useThemedStyles(createStyles);
  const alarmSupported = Platform.OS === 'android';
  const alarmEnabled = alarmSupported && session.alarmChoice === 'prepare';
  const patternLabel =
    session.source === 'custom'
      ? '직접 설정'
      : session.presetId
        ? getWorkPatternPreset(session.presetId).shortName
        : '미선택';
  const timeSummary = validation.activeShiftIds
    .map(
      (id) =>
        `${SHIFT_NAMES[id]} ${session.times[id].start}~${session.times[id].end}`,
    )
    .join(' · ');
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <AppText accessibilityLabel="알람 준비" accessibilityRole="header" ref={headingRef} variant="heading">
          알람
        </AppText>
      </View>
      <Surface density="compact" style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <AppText tone="secondary" variant="caption">근무 방식</AppText>
          <AppText variant="label">{patternLabel}</AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText tone="secondary" variant="caption">오늘 근무</AppText>
          <AppText variant="label">{preview[0]?.shiftLabel ?? '미선택'}</AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText tone="secondary" variant="caption">근무 시간</AppText>
          <AppText style={styles.summaryValue} variant="label">
            {timeSummary || '근무 없음'}
          </AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText tone="secondary" variant="caption">근무 알람</AppText>
          <AppText variant="label">{alarmEnabled ? '켜짐' : '꺼짐'}</AppText>
        </View>
      </Surface>
      <ToggleRow
        disabled={!alarmSupported || !validation.safety.canEnableAlarms}
        icon="alarm-outline"
        onValueChange={onAlarmEnabledChange}
        subtitle={
          !alarmSupported
            ? '안드로이드에서 지원합니다.'
            : validation.safety.canEnableAlarms
              ? '근무에 맞춰 알람을 준비합니다.'
              : '근무 시간 수정 필요'
        }
        title="근무 알람"
        value={alarmEnabled}
      />
      {!validation.safety.canEnableAlarms ? (
        <StatusBanner
          actionLabel="시간 수정"
          message="다음 알람이 이전 근무 중 울릴 수 있습니다."
          onAction={onAdjustTime}
          title="알람 시간 겹침"
          tone="warning"
        />
      ) : session.alarmChoice === 'schedule-only' ? (
        <StatusBanner
          message="근무표는 저장하고 알람은 사용하지 않습니다."
          title="알람 꺼짐"
          tone="neutral"
        />
      ) : null}
      <View style={styles.storageCard}>
        <AppText tone="secondary" variant="caption">
          설정은 이 기기에 저장됩니다.
        </AppText>
      </View>
    </View>
  );
}

export function SetupSessionProgress({ compact, step }: { compact: boolean; step: number }) {
  const styles = useThemedStyles(createStyles);
  const labels = ['근무 방식', '오늘 근무·시간', '알람'] as const;
  return (
    <View
      accessibilityLabel={`근무표 설정 ${step}단계, 총 3단계`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step }}
      style={[styles.progress, compact && styles.progressCompact]}>
      <AppText variant="caption" tone="secondary">
        {step}/3 · {labels[step - 1]}
      </AppText>
      <View accessibilityElementsHidden importantForAccessibility="no" style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    section: { gap: spacing.medium },
    heading: { gap: spacing.tiny },
    exampleCard: { gap: spacing.tiny },
    options: { gap: spacing.small },
    optionCopy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    choiceSurface: {
      overflow: 'hidden',
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    choiceRow: {
      borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
      borderRadius: 0,
    },
    choiceRowContent: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
    },
    nestedOptions: {
      paddingLeft: spacing.medium,
      backgroundColor: palette.surfaceSoft,
    },
    nestedChoiceRow: {
      borderWidth: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
      borderRadius: 0,
    },
    editorCard: { gap: spacing.medium },
    inlineSummary: {
      gap: spacing.tiny,
      borderLeftWidth: 3,
      borderLeftColor: palette.focus,
      paddingLeft: spacing.medium,
      paddingVertical: spacing.tiny,
    },
    roleSelection: { gap: spacing.small },
    positionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    positionOption: { minWidth: 112, flexGrow: 1 },
    previewCard: { gap: spacing.medium },
    previewList: { gap: spacing.tiny },
    previewRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
      paddingVertical: spacing.small,
    },
    previewRowStacked: { alignItems: 'flex-start', flexDirection: 'column' },
    timeCard: { gap: spacing.medium },
    timeHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    summaryCard: {
      gap: 0,
      paddingHorizontal: spacing.medium,
      paddingVertical: 0,
    },
    summaryRow: {
      minHeight: 48,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
      paddingVertical: spacing.small,
    },
    summaryValue: { minWidth: 0, flexShrink: 1, textAlign: 'right' },
    storageCard: {
      gap: spacing.tiny,
      paddingTop: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    progress: { gap: spacing.small },
    progressCompact: {
      gap: spacing.tiny,
    },
    progressTrack: {
      height: 3,
      overflow: 'hidden',
      borderRadius: 2,
      backgroundColor: palette.surfaceSoft,
    },
    progressFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: palette.focus,
    },
  });
}
