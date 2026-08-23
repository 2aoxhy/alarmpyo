import type { RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { DatePickerField } from '@/components/date-picker-field';
import { SelectionCard, SelectionPill } from '@/components/selection-controls';
import { AppButton, AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner, Surface } from '@/design-system';
import {
  PatternSequenceEditor,
  WorkTimeEditor,
} from '@/features/setup/setup-components';
import type {
  EditableWorkShiftId,
  WorkPatternDraftValidation,
} from '@/features/setup/work-pattern-draft';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { formatKoreanDate } from '@/utils/date';
import type { BaseWorkShiftId, WorkPatternPresetId } from '@/utils/work-pattern';

import {
  formatQuickPositionLabel,
  formatQuickSequence,
  QUICK_SETUP_OPTIONS,
  type QuickSetupOption,
} from './quick-setup-model';
import type {
  SetupSessionAlarmChoice,
  SetupSessionDraftV2,
} from './setup-session-model';

type StepHeadingRef = RefObject<View | null>;
type PreviewItem = ReturnType<
  typeof import('./quick-setup-model').createQuickPreview
>[number];

const SHIFT_NAMES: Record<Exclude<BaseWorkShiftId, 'off'>, string> = {
  day: '주간',
  evening: '오후',
  night: '야간',
};

export function SetupSourceStep({
  busy,
  headingRef,
  onBeginCustom,
  onChangeCustomSequence,
  onReceive,
  onSelectRecommendation,
  onToggleRecommendations,
  session,
  showCustomEditor,
  showRecommendations,
}: {
  busy: boolean;
  headingRef: StepHeadingRef;
  onBeginCustom: () => void;
  onChangeCustomSequence: (sequence: BaseWorkShiftId[]) => void;
  onReceive: () => void;
  onSelectRecommendation: (presetId: WorkPatternPresetId) => void;
  onToggleRecommendations: () => void;
  session: SetupSessionDraftV2;
  showCustomEditor: boolean;
  showRecommendations: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <View
        accessible
        accessibilityLabel="시작 방법"
        collapsable={false}
        ref={headingRef}
        style={styles.heading}>
        <AppText accessibilityRole="header" variant="heading">
          시작 방법
        </AppText>
      </View>
      <Surface style={styles.exampleCard} tone="muted">
        <AppText variant="caption" tone="secondary">기본 예시</AppText>
        <AppText variant="label">주간 · 주간 · 야간 · 야간 · 휴무 · 휴무</AppText>
        <AppText variant="caption" tone="tertiary">기기 저장 · 서버 전송 없음</AppText>
      </Surface>
      <AppButton
        icon="download-outline"
        label="근무표 불러오기"
        loading={busy}
        onPress={onReceive}
      />
      <AppButton
        icon="repeat"
        label="추천 근무 순서에서 선택"
        onPress={onToggleRecommendations}
        variant="secondary"
      />
      {showRecommendations ? (
        <View
          accessibilityLabel="추천 근무 순서"
          accessibilityRole="radiogroup"
          style={styles.options}>
          {QUICK_SETUP_OPTIONS.map((option: QuickSetupOption) => (
            <SelectionCard
              accessibilityLabel={option.label}
              key={option.presetId}
              onPress={() => onSelectRecommendation(option.presetId)}
              selected={
                session.source === 'recommended' &&
                session.presetId === option.presetId
              }>
              <View style={styles.optionCopy}>
                <AppText variant="label">{option.label}</AppText>
              </View>
            </SelectionCard>
          ))}
        </View>
      ) : null}
      <AppButton
        icon="add"
        label="내 근무 순서 직접 만들기"
        onPress={onBeginCustom}
        variant="secondary"
      />
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
    </View>
  );
}

export function SetupAnchorStep({
  activeShiftIds,
  focusRequest,
  focusShiftTypeId,
  headingRef,
  onChangeDate,
  onChangeTime,
  onSelectPosition,
  onShowOtherDate,
  onToggleTimeEditor,
  preview,
  revealValidation,
  session,
  shiftColors,
  showOtherDate,
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
  onChangeDate: (date: string) => void;
  onChangeTime: (
    shiftTypeId: EditableWorkShiftId,
    field: 'start' | 'end',
    value: string,
  ) => void;
  onSelectPosition: (position: number) => void;
  onShowOtherDate: () => void;
  onToggleTimeEditor: () => void;
  preview: PreviewItem[];
  revealValidation: boolean;
  session: SetupSessionDraftV2;
  shiftColors: Record<EditableWorkShiftId, string>;
  showOtherDate: boolean;
  showTimeEditor: boolean;
  stackContent: boolean;
  stackTimeInputs: boolean;
  today: string;
  validation: WorkPatternDraftValidation;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <View
        accessible
        accessibilityLabel="오늘 근무와 시간"
        collapsable={false}
        ref={headingRef}
        style={styles.heading}>
        <AppText accessibilityRole="header" variant="heading">
          {session.referenceDate === today ? '오늘 근무 선택' : '선택 날짜 근무'}
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
      {session.presetId === 'weekday' ? (
        <StatusBanner
          message="월~금 주간 · 토~일 휴무"
          title="요일 기준"
          tone="neutral"
        />
      ) : (
        <View
          accessibilityLabel="기준 날짜의 근무"
          accessibilityRole="radiogroup"
          style={styles.positionOptions}>
          {session.sequence.map((id, index) => (
            <SelectionPill
              key={`${id}-${index}`}
              label={formatQuickPositionLabel(session.sequence, index)}
              onPress={() => onSelectPosition(index)}
              selected={session.position === index}
              style={styles.positionOption}
            />
          ))}
        </View>
      )}
      {showOtherDate ? (
        <Surface style={styles.dateCard} tone="muted">
          <AppText variant="label">근무표 표시 시작일</AppText>
          <DatePickerField
            accessibilityLabel="근무표 표시 시작 날짜"
            onChange={onChangeDate}
            placeholder={today}
            today={today}
            value={session.referenceDate}
          />
        </Surface>
      ) : (
        <AppButton
          icon="calendar-outline"
          label="다른 날짜부터 표시"
          onPress={onShowOtherDate}
          variant="ghost"
        />
      )}
      {preview.length > 0 ? (
        <Surface style={styles.previewCard}>
          <AppText accessibilityRole="header" variant="label">
            앞으로 7일
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
          message="오늘 근무 선택 시 7일 일정 표시"
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
            label={showTimeEditor ? '시간 접기' : '시간 수정'}
            onPress={onToggleTimeEditor}
            size="compact"
            variant="secondary"
          />
        </View>
        {showTimeEditor ? (
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
        ) : null}
      </Surface>
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
  onAdjustTime,
  onSelectAlarmChoice,
  preview,
  session,
  validation,
}: {
  headingRef: StepHeadingRef;
  onAdjustTime: () => void;
  onSelectAlarmChoice: (choice: Exclude<SetupSessionAlarmChoice, null>) => void;
  preview: PreviewItem[];
  session: SetupSessionDraftV2;
  validation: WorkPatternDraftValidation;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <View
        accessible
        accessibilityLabel="알람 준비"
        collapsable={false}
        ref={headingRef}
        style={styles.heading}>
        <AppText accessibilityRole="header" variant="heading">
          근무 알람 준비
        </AppText>
      </View>
      <View style={styles.inlineSummary}>
        <AppText variant="label">적용할 근무표</AppText>
        <AppText tone="secondary" variant="body">
          {formatQuickSequence(session.sequence)}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {formatKoreanDate(session.referenceDate)}부터 · 기준 근무 {preview[0]?.shiftLabel ?? '미선택'}
        </AppText>
      </View>
      {validation.safety.canEnableAlarms ? (
        <View
          accessibilityLabel="알람 준비 방법"
          accessibilityRole="radiogroup"
          style={styles.options}>
          {Platform.OS === 'android' ? (
            <SelectionCard
              accessibilityLabel="알람 준비. 필요한 권한 확인."
              onPress={() => onSelectAlarmChoice('prepare')}
              selected={session.alarmChoice === 'prepare'}>
              <View style={styles.optionCopy}>
                <AppText variant="label">알람 준비</AppText>
                <AppText tone="secondary" variant="caption">필수 권한 확인</AppText>
              </View>
            </SelectionCard>
          ) : null}
          <SelectionCard
            accessibilityLabel="근무표만 저장. 알람 끄기."
            onPress={() => onSelectAlarmChoice('schedule-only')}
            selected={session.alarmChoice === 'schedule-only'}>
            <View style={styles.optionCopy}>
              <AppText variant="label">근무표만 저장</AppText>
              <AppText tone="secondary" variant="caption">근무 알람 끄기</AppText>
            </View>
          </SelectionCard>
        </View>
      ) : (
        <Surface style={styles.warningCard}>
          <StatusBanner
            message="다음 알람이 이전 근무 중 울릴 수 있습니다."
            title="알람 시간 겹침"
            tone="warning"
          />
          <AppButton
            icon="time-outline"
            label="알람 시간 조정"
            onPress={onAdjustTime}
          />
          <AppButton
            icon="checkmark"
            label="근무표만 저장하고 알람 끄기"
            onPress={() => onSelectAlarmChoice('schedule-only')}
            variant="secondary"
          />
        </Surface>
      )}
      {session.alarmChoice === 'schedule-only' ? (
        <StatusBanner
          message="근무표 저장 후 근무 알람 끄기"
          title="알람 없이 저장"
          tone="neutral"
        />
      ) : null}
      <View style={styles.storageCard}>
        <AppText accessibilityRole="header" variant="label">
          기기 저장
        </AppText>
        <AppText tone="secondary" variant="caption">
          서버 전송 없음 · 앱 삭제 시 근무표·메모·설정 삭제 · 데이터 메뉴에서 외부 백업 가능
        </AppText>
      </View>
    </View>
  );
}

export function SetupSessionProgress({ compact, step }: { compact: boolean; step: number }) {
  const styles = useThemedStyles(createStyles);
  const labels = ['시작 방법', '오늘 근무·시간', '알람 준비'] as const;
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
    editorCard: { gap: spacing.medium },
    inlineSummary: {
      gap: spacing.tiny,
      borderLeftWidth: 3,
      borderLeftColor: palette.focus,
      paddingLeft: spacing.medium,
      paddingVertical: spacing.tiny,
    },
    positionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    positionOption: { minWidth: 112, flexGrow: 1 },
    dateCard: { gap: spacing.small },
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
    warningCard: { gap: spacing.small },
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
