import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { SelectionCard, SelectionPill } from '@/components/selection-controls';
import {
  AnimatedShiftIcon,
  getShiftIconKind,
} from '@/components/animated-shift-icon';
import { AppButton, AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { Surface } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ShiftType } from '@/models/app-data';
import { formatDuration, formatKoreanDate } from '@/utils/date';
import {
  calculateShiftDuration,
  formatTimeInputWhileTyping,
  normalizeTimeInput,
  parseTimeInput,
} from '@/utils/shift-time';
import { getShiftAppearance } from '@/utils/shift-appearance';
import {
  CUSTOM_PATTERN_MAX_DAYS,
  CUSTOM_PATTERN_MIN_DAYS,
  WORK_PATTERN_CATEGORIES,
  getWorkPatternPreset,
  type BaseWorkShiftId,
  type WorkPatternCategoryId,
  type WorkPatternPresetId,
} from '@/utils/work-pattern';

import {
  createSetupSequenceOptions,
  type SetupPreviewItem,
  type SetupScreenStep,
} from './setup-flow';

export function SetupHero({ step }: { step: SetupScreenStep }) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.hero}>
      <View style={styles.logoMark}>
        <AppIcon accessible={false} color={palette.ink} name="calendar" size={22} />
      </View>
      <View style={styles.heroCopy}>
        <AppText accessibilityRole="header" variant="heading">
          처음 설정 · {step}/3
        </AppText>
        <AppText variant="caption" tone="secondary">
          회사 순서와 시간을 확인하여 내 근무표를 만듭니다.
        </AppText>
      </View>
    </View>
  );
}

export function SetupProgress({
  compact = false,
  step,
}: {
  compact?: boolean;
  step: SetupScreenStep;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View
      accessibilityLabel={`첫 설정 ${step}단계, 총 3단계`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step }}
      style={styles.progress}>
      {compact ? (
        <AppText variant="caption" tone="secondary" style={styles.compactProgressLabel}>
          {(['근무 방식', '순서·시간', '적용 시작일'] as const)[step - 1]} · {step}/3
        </AppText>
      ) : null}
      {(['근무 방식', '순서·시간', '적용 시작일'] as const).map((label, index) => {
        const value = (index + 1) as SetupScreenStep;
        const active = value <= step;
        return (
          <View key={label} style={styles.progressItem}>
            <View style={[styles.progressLine, active && styles.progressLineActive]} />
            {!compact ? (
              <AppText
                variant="caption"
                color={value === step ? palette.indigoDark : palette.inkMuted}
                style={styles.progressLabel}>
                {label}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function WorkModeStep({
  categoryId,
  presetId,
  stackOptions,
  onSelectCategory,
  onSelect,
}: {
  categoryId: WorkPatternCategoryId | null;
  presetId: WorkPatternPresetId | null;
  stackOptions: boolean;
  onSelectCategory: (categoryId: WorkPatternCategoryId) => void;
  onSelect: (presetId: WorkPatternPresetId) => void;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.stepSection}>
      <View style={styles.sectionCopy}>
        <AppText accessibilityRole="header" variant="heading" style={styles.centerText}>
          근무 방식을 선택합니다
        </AppText>
        <AppText variant="body" tone="secondary" style={styles.centerText}>
          회사에서 사용하는 반복 근무표를 선택합니다.
        </AppText>
      </View>
      <View
        accessibilityRole="radiogroup"
        style={[styles.modeOptions, stackOptions && styles.modeOptionsStacked]}>
        {WORK_PATTERN_CATEGORIES.map((category) => (
          <ModeOption
            description={category.description}
            icon={category.id === 'weekday' ? 'shift-day' : 'repeat'}
            iconColor={category.id === 'weekday' ? palette.mintDark : palette.inkMuted}
            iconBackground={category.id === 'weekday' ? palette.mintSoft : palette.surfaceSoft}
            horizontal
            key={category.id}
            label={category.name}
            onPress={() => onSelectCategory(category.id)}
            selected={categoryId === category.id}
            style={styles.modeOptionStacked}
          />
        ))}
      </View>
      {categoryId === 'two-shift' || categoryId === 'three-shift' ? (
        <View style={styles.teamChoiceSection}>
          <AppText variant="label">조 수를 선택합니다</AppText>
          <View accessibilityRole="radiogroup" style={styles.teamChoices}>
            {WORK_PATTERN_CATEGORIES.find((category) => category.id === categoryId)?.presetIds.map(
              (candidateId) => {
                const preset = getWorkPatternPreset(candidateId);
                return (
                  <SelectionPill
                    key={candidateId}
                    onPress={() => onSelect(candidateId)}
                    selected={presetId === candidateId}
                    label={preset.shortName.replace(/\s*\d교대$/, '')}
                    style={styles.teamChoice}
                  />
                );
              },
            )}
          </View>
          <AppText variant="caption" tone="secondary">
            선택 후 다음 화면에서 회사의 실제 순서와 시간을 확인합니다.
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function ModeOption({
  description,
  icon,
  iconBackground,
  iconColor,
  horizontal,
  label,
  onPress,
  selected,
  style,
}: {
  description: string;
  icon: 'repeat' | 'shift-day';
  iconBackground: string;
  iconColor: string;
  horizontal: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: object;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <SelectionCard
      accessibilityLabel={`${label}. ${description}`}
      onPress={onPress}
      selected={selected}
      contentStyle={styles.modeOptionContent}
      style={[styles.modeOption, style]}>
      <View style={[styles.modeIcon, { backgroundColor: iconBackground }]}>
        <AppIcon accessible={false} color={iconColor} name={icon} size={24} />
      </View>
      <View style={[styles.modeCopy, !horizontal && styles.modeCopyCentered]}>
        <AppText variant="label" style={!horizontal && styles.centerText}>
          {label}
        </AppText>
        <AppText
          variant="caption"
          tone="secondary"
          style={!horizontal && styles.centerText}>
          {description}
        </AppText>
      </View>
    </SelectionCard>
  );
}

export function RotationPositionPicker({
  compact,
  position,
  sequence,
  shiftTypes,
  onSelect,
}: {
  compact: boolean;
  position: number | null;
  sequence: readonly BaseWorkShiftId[];
  shiftTypes: ShiftType[];
  onSelect: (position: number) => void;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View accessibilityRole="radiogroup" style={styles.positionGrid}>
      {createSetupSequenceOptions(sequence).map((option, index) => {
        const selected = position === index;
        const shift = shiftTypes.find((item) => item.id === option.shiftTypeId);
        const appearance = shift ? getShiftAppearance(shift, palette, isDark) : null;
        return (
          <SelectionCard
            accessibilityLabel={option.label}
            key={option.label}
            onPress={() => onSelect(index)}
            selected={selected}
            semanticColor={appearance?.accentColor ?? palette.mint}
            contentStyle={styles.positionOptionContent}
            style={[
              styles.positionOption,
              compact && styles.positionOptionCompact,
            ]}>
            {shift ? (
              <AnimatedShiftIcon
                animated={selected}
                color={appearance?.accentColor ?? shift.color}
                kind={getShiftIconKind(shift.id, shift.isOff)}
                size={21}
              />
            ) : null}
            <View style={styles.positionCopy}>
              <AppText variant="label" color={palette.ink}>
                {option.shortName}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {option.detail}
              </AppText>
            </View>
          </SelectionCard>
        );
      })}
    </View>
  );
}

const SEQUENCE_ORDER: readonly BaseWorkShiftId[] = [
  'day',
  'evening',
  'night',
  'off',
];

const SEQUENCE_LABELS: Record<BaseWorkShiftId, string> = {
  day: '주간',
  evening: '오후',
  night: '야간',
  off: '휴무',
};

/** 대표 순서를 회사 순서에 맞게 1~42일 범위에서 바로 고쳐요. */
export function PatternSequenceEditor({
  sequence,
  onChange,
}: {
  sequence: readonly BaseWorkShiftId[];
  onChange: (sequence: BaseWorkShiftId[]) => void;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackOptions = width <= 320 || fontScale >= 1.5;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = Math.min(selectedIndex, sequence.length - 1);

  const changeSelectedDay = (next: BaseWorkShiftId) => {
    onChange(sequence.map((id, index) => (index === activeIndex ? next : id)));
  };

  const renderSequenceItem = ({ item: id, index }: { item: BaseWorkShiftId; index: number }) => {
    const shift = {
      id,
      isOff: id === 'off',
      color: palette.ink,
      softColor: palette.surfaceSoft,
    };
    const appearance = getShiftAppearance(shift, palette, isDark);
    return (
      <SelectionPill
        accessibilityLabel={`${index + 1}/${sequence.length}, ${SEQUENCE_LABELS[id]}`}
        accessibilityRole="radio"
        key={`sequence-slot-${index}`}
        label={`${index + 1}일 ${SEQUENCE_LABELS[id]}`}
        onPress={() => setSelectedIndex(index)}
        selected={activeIndex === index}
        semanticColor={appearance.accentColor}
        showCheck={false}
        style={styles.sequenceItem}
      />
    );
  };

  return (
    <View style={styles.sequenceEditor}>
      <FlatList
        accessibilityLabel={`${sequence.length}일 근무 순서`}
        accessibilityRole="radiogroup"
        contentContainerStyle={styles.sequenceListContent}
        data={sequence}
        horizontal
        initialNumToRender={8}
        keyExtractor={(_, index) => `sequence-slot-${index}`}
        maxToRenderPerBatch={8}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderSequenceItem}
        showsHorizontalScrollIndicator={false}
        style={styles.sequenceList}
        windowSize={3}
      />
      <View style={styles.selectedDayEditor}>
        <View style={styles.sectionCopy}>
          <AppText variant="label">{activeIndex + 1}/{sequence.length}일 근무</AppText>
          <AppText variant="caption" tone="secondary">
            선택한 날짜의 근무만 변경합니다.
          </AppText>
        </View>
        <View
          accessibilityLabel={`${activeIndex + 1}일 근무 종류`}
          accessibilityRole="radiogroup"
          style={[styles.selectedDayOptions, stackOptions && styles.selectedDayOptionsStacked]}>
          {SEQUENCE_ORDER.map((id) => (
            <SelectionPill
              accessibilityRole="radio"
              key={id}
              label={SEQUENCE_LABELS[id]}
              onPress={() => changeSelectedDay(id)}
              selected={sequence[activeIndex] === id}
              style={[styles.selectedDayOption, stackOptions && styles.selectedDayOptionStacked]}
            />
          ))}
        </View>
      </View>
      <View style={styles.sequenceActions}>
        <AppButton
          disabled={sequence.length <= CUSTOM_PATTERN_MIN_DAYS}
          label="마지막 날 빼기"
          onPress={() => {
            onChange(sequence.slice(0, -1));
            setSelectedIndex((current) => Math.min(current, sequence.length - 2));
          }}
          size="compact"
          variant="secondary"
        />
        <AppButton
          disabled={sequence.length >= CUSTOM_PATTERN_MAX_DAYS}
          label="날짜 추가하기"
          onPress={() => {
            onChange([...sequence, 'off']);
            setSelectedIndex(sequence.length);
          }}
          size="compact"
          variant="secondary"
        />
      </View>
      <AppText variant="caption" tone="tertiary">
        순서의 날짜를 선택한 뒤 아래에서 근무를 지정합니다.
      </AppText>
    </View>
  );
}

export function WorkTimeEditor({
  dayColor,
  dayDuration,
  dayEnd,
  dayStart,
  eveningColor,
  eveningDuration,
  eveningEnd,
  eveningStart,
  focusRequest = 0,
  focusShiftTypeId = null,
  nightColor,
  nightDuration,
  nightEnd,
  nightStart,
  onChangeDayEnd,
  onChangeDayStart,
  onChangeEveningEnd,
  onChangeEveningStart,
  onChangeNightEnd,
  onChangeNightStart,
  revealErrors = false,
  showDay = true,
  showEvening = false,
  showNight = true,
  stackTimeInputs = false,
}: {
  dayColor: string;
  dayDuration: ReturnType<typeof calculateShiftDuration>;
  dayEnd: string;
  dayStart: string;
  eveningColor: string;
  eveningDuration: ReturnType<typeof calculateShiftDuration>;
  eveningEnd: string;
  eveningStart: string;
  focusRequest?: number;
  focusShiftTypeId?: 'day' | 'evening' | 'night' | null;
  nightColor: string;
  nightDuration: ReturnType<typeof calculateShiftDuration>;
  nightEnd: string;
  nightStart: string;
  onChangeDayEnd: (value: string) => void;
  onChangeDayStart: (value: string) => void;
  onChangeEveningEnd: (value: string) => void;
  onChangeEveningStart: (value: string) => void;
  onChangeNightEnd: (value: string) => void;
  onChangeNightStart: (value: string) => void;
  revealErrors?: boolean;
  showDay?: boolean;
  showEvening?: boolean;
  showNight?: boolean;
  stackTimeInputs?: boolean;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.workTimes}>
      {showDay ? (
        <TimeInputRow
          color={dayColor}
          duration={dayDuration}
          end={dayEnd}
          focusRequest={focusRequest}
          label="주간"
          onChangeEnd={onChangeDayEnd}
          onChangeStart={onChangeDayStart}
          revealErrors={revealErrors}
          shiftId="day"
          shouldFocus={focusShiftTypeId === 'day'}
          stackInputs={stackTimeInputs}
          start={dayStart}
        />
      ) : null}
      {showEvening ? (
        <>
          {showDay ? <View style={styles.divider} /> : null}
          <TimeInputRow
            color={eveningColor}
            duration={eveningDuration}
            end={eveningEnd}
            focusRequest={focusRequest}
            label="오후"
            onChangeEnd={onChangeEveningEnd}
            onChangeStart={onChangeEveningStart}
            revealErrors={revealErrors}
            shiftId="evening"
            shouldFocus={focusShiftTypeId === 'evening'}
            stackInputs={stackTimeInputs}
            start={eveningStart}
          />
        </>
      ) : null}
      {showNight ? (
        <>
          {showDay || showEvening ? <View style={styles.divider} /> : null}
          <TimeInputRow
            color={nightColor}
            duration={nightDuration}
            end={nightEnd}
            focusRequest={focusRequest}
            label="야간"
            onChangeEnd={onChangeNightEnd}
            onChangeStart={onChangeNightStart}
            revealErrors={revealErrors}
            shiftId="night"
            shouldFocus={focusShiftTypeId === 'night'}
            stackInputs={stackTimeInputs}
            start={nightStart}
          />
        </>
      ) : null}
    </View>
  );
}

function TimeInputRow({
  color,
  duration,
  end,
  focusRequest,
  label,
  onChangeEnd,
  onChangeStart,
  revealErrors,
  shiftId,
  shouldFocus,
  stackInputs,
  start,
}: {
  color: string;
  duration: ReturnType<typeof calculateShiftDuration>;
  end: string;
  focusRequest: number;
  label: string;
  onChangeEnd: (value: string) => void;
  onChangeStart: (value: string) => void;
  revealErrors: boolean;
  shiftId: 'day' | 'evening' | 'night';
  shouldFocus: boolean;
  stackInputs: boolean;
  start: string;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [focusedField, setFocusedField] = useState<'start' | 'end' | null>(null);
  const [touchedFields, setTouchedFields] = useState<ReadonlySet<'start' | 'end'>>(
    () => new Set(),
  );
  const startInputRef = useRef<TextInput>(null);
  const endInputRef = useRef<TextInput>(null);
  const lastFocusRequestRef = useRef(0);
  const startInvalid = parseTimeInput(start) === null;
  const endInvalid = parseTimeInput(end) === null;
  const showStartError = startInvalid && (revealErrors || touchedFields.has('start'));
  const showEndError = endInvalid && (revealErrors || touchedFields.has('end'));
  const showDurationError = !duration && (revealErrors || touchedFields.size > 0);

  useEffect(() => {
    if (!shouldFocus || focusRequest <= 0 || lastFocusRequestRef.current === focusRequest) {
      return;
    }
    lastFocusRequestRef.current = focusRequest;
    const timeout = setTimeout(() => {
      const target =
        parseTimeInput(start) === null
          ? startInputRef
          : parseTimeInput(end) === null
            ? endInputRef
            : startInputRef;
      target.current?.focus();
    }, 0);
    return () => clearTimeout(timeout);
  }, [end, focusRequest, shouldFocus, start]);

  return (
    <View style={styles.timeRow}>
      <View style={styles.timeHeading}>
        <View style={styles.timeLabel}>
          <AnimatedShiftIcon
            active={focusedField !== null}
            color={color}
            kind={shiftId}
            size={20}
          />
          <AppText variant="label">{label}</AppText>
        </View>
        <AppText
          variant="caption"
          color={showDurationError ? palette.danger : palette.inkMuted}
          style={styles.durationText}>
          {duration
            ? `${duration.endsNextDay ? '다음 날 종료 · ' : ''}${formatDuration(duration.durationMinutes)}`
            : showDurationError
              ? '시간을 확인해야 합니다.'
              : '시작과 종료 시간을 입력합니다.'}
        </AppText>
      </View>
      <View style={[styles.timeControls, stackInputs && styles.timeControlsStacked]}>
        <TextInput
          accessibilityLabel={`${label} 시작 시간`}
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          onBlur={() => {
            setFocusedField(null);
            setTouchedFields((current) => new Set(current).add('start'));
            onChangeStart(normalizeTimeInput(start));
          }}
          onChangeText={(value) => onChangeStart(formatTimeInputWhileTyping(value))}
          onFocus={() => setFocusedField('start')}
          placeholder="06:45"
          placeholderTextColor={palette.inkSoft}
          ref={startInputRef}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[
            styles.timeInput,
            focusedField === 'start' && { borderColor: color },
            showStartError && styles.invalidInput,
          ]}
          value={start}
        />
        <AppText tone="tertiary">~</AppText>
        <TextInput
          accessibilityLabel={`${label} 종료 시간`}
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          onBlur={() => {
            setFocusedField(null);
            setTouchedFields((current) => new Set(current).add('end'));
            onChangeEnd(normalizeTimeInput(end));
          }}
          onChangeText={(value) => onChangeEnd(formatTimeInputWhileTyping(value))}
          onFocus={() => setFocusedField('end')}
          placeholder="17:45"
          placeholderTextColor={palette.inkSoft}
          ref={endInputRef}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[
            styles.timeInput,
            focusedField === 'end' && { borderColor: color },
            showEndError && styles.invalidInput,
          ]}
          value={end}
        />
      </View>
    </View>
  );
}

export function WeekdaySchedule({
  dayEnd,
  dayStart,
}: {
  dayEnd: string;
  dayStart: string;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.weekdaySchedule}>
      <ScheduleRow
        color={palette.mintDark}
        description={`${dayStart}~${dayEnd} 주간 근무`}
        kind="day"
        title="월요일~금요일"
      />
      <View style={styles.divider} />
      <ScheduleRow
        color={palette.inkMuted}
        description="고정 휴무"
        kind="off"
        title="토요일·일요일"
      />
    </View>
  );
}

function ScheduleRow({
  color,
  description,
  kind,
  title,
}: {
  color: string;
  description: string;
  kind: 'day' | 'off';
  title: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.scheduleRow}>
      <View style={styles.scheduleIcon}>
        <AnimatedShiftIcon animated={false} color={color} kind={kind} size={22} />
      </View>
      <View style={styles.scheduleCopy}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" tone="secondary">
          {description}
        </AppText>
      </View>
    </View>
  );
}

export function SetupPreview({
  items,
  shiftTypes,
  today,
}: {
  items: SetupPreviewItem[];
  shiftTypes: ShiftType[];
  today: string;
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  if (items.length === 0) return null;

  return (
    <Surface density="compact" style={styles.previewCard} tone="muted">
      <View style={styles.sectionCopy}>
        <AppText accessibilityRole="header" variant="label">
          미리 보기
        </AppText>
        <AppText variant="caption" tone="secondary">
          일정 적용 시작일부터 이어지는 일정입니다.
        </AppText>
      </View>
      <View style={styles.previewGrid}>
        {items.map((item) => {
          const shift = shiftTypes.find((candidate) => candidate.id === item.shiftTypeId);
          const appearance = shift ? getShiftAppearance(shift, palette, isDark) : null;
          return (
            <View key={item.dateKey} style={styles.previewItem}>
              <AppText variant="caption" tone="secondary" style={styles.centerText}>
                {item.dateKey === today
                  ? '오늘'
                  : formatKoreanDate(item.dateKey).replace('요일', '')}
              </AppText>
              <View
                style={[
                  styles.previewChip,
                  { backgroundColor: appearance?.softColor ?? palette.surfaceSoft },
                ]}>
                {shift ? (
                  <AnimatedShiftIcon
                    animated={false}
                    color={appearance?.accentColor ?? shift.color}
                    kind={getShiftIconKind(shift.id, shift.isOff)}
                    size={17}
                  />
                ) : null}
                <AppText
                  variant="label"
                  color={appearance?.accentColor ?? palette.ink}>
                  {item.shortName}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

function createStyles(palette: AppPalette, isDark: boolean) {
  return StyleSheet.create({
    hero: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      borderRadius: radii.large,
      backgroundColor: palette.surface,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
    },
    logoMark: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: palette.surfaceSoft,
    },
    heroCopy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    progress: { position: 'relative', flexDirection: 'row', gap: spacing.small },
    progressItem: { flex: 1, gap: spacing.tiny },
    progressLine: {
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.surfaceSoft,
    },
    progressLineActive: { backgroundColor: palette.indigo },
    progressLabel: { textAlign: 'center' },
    compactProgressLabel: { position: 'absolute', right: 0, top: -24 },
    stepSection: { gap: spacing.large },
    sectionCopy: { minWidth: 0, gap: spacing.tiny },
    centerText: { textAlign: 'center' },
    modeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    modeOptionsStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
    modeOption: {
      minWidth: 0,
      minHeight: 72,
      flexBasis: '46%',
      flexGrow: 1,
    },
    modeOptionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      padding: spacing.medium,
    },
    modeOptionStacked: {
      minHeight: 72,
      flexBasis: 'auto',
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },
    modeIcon: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
    },
    modeCopy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    modeCopyCentered: { alignItems: 'center' },
    teamChoiceSection: {
      gap: spacing.small,
      borderRadius: radii.medium,
      backgroundColor: palette.surface,
      padding: spacing.medium,
    },
    teamChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    teamChoice: {
      minWidth: 88,
      minHeight: 48,
      flexGrow: 1,
    },
    pressed: { opacity: 0.72 },
    positionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    positionOption: {
      minWidth: 96,
      minHeight: 72,
      flexBasis: '30%',
      flexGrow: 1,
    },
    positionOptionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.small,
    },
    positionOptionCompact: { minWidth: 116, flexBasis: '44%' },
    positionCopy: { minWidth: 0, gap: 1 },
    sequenceEditor: { gap: spacing.small },
    sequenceList: { marginHorizontal: -spacing.tiny },
    sequenceListContent: { gap: spacing.small, paddingHorizontal: spacing.tiny },
    sequenceItem: {
      minWidth: 76,
      minHeight: 56,
      flexGrow: 1,
    },
    selectedDayEditor: {
      gap: spacing.medium,
      paddingVertical: spacing.medium,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
    },
    selectedDayOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    selectedDayOptionsStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
    selectedDayOption: { minWidth: 72, flex: 1 },
    selectedDayOptionStacked: { width: '100%' },
    sequenceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    workTimes: { gap: spacing.medium },
    timeRow: { gap: spacing.small },
    timeHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    timeLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
    durationText: { flexShrink: 1, textAlign: 'right' },
    timeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
    timeControlsStacked: { flexDirection: 'column', alignItems: 'stretch' },
    timeInput: {
      minWidth: 84,
      minHeight: 52,
      flex: 1,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: isDark ? palette.surfaceSoft : palette.canvas,
      color: palette.ink,
      fontFamily: fontFamily.label,
      fontSize: 17,
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.small,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
    },
    invalidInput: { borderColor: palette.danger },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line },
    weekdaySchedule: { gap: spacing.small },
    scheduleRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      paddingVertical: spacing.tiny,
    },
    scheduleIcon: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: palette.surfaceSoft,
    },
    scheduleCopy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    previewCard: { gap: spacing.medium, paddingHorizontal: spacing.medium },
    previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    previewItem: {
      minWidth: 84,
      flexBasis: '29%',
      flexGrow: 1,
      alignItems: 'center',
      gap: spacing.tiny,
      paddingVertical: spacing.tiny,
    },
    previewChip: {
      minWidth: 64,
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.tiny,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.small,
    },
  });
}
