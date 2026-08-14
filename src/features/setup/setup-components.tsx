import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  AnimatedShiftIcon,
  getShiftIconKind,
} from '@/components/animated-shift-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
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
  WORK_PATTERN_PRESETS,
  type BaseWorkShiftId,
  type WorkPatternPresetId,
} from '@/utils/work-pattern';

import {
  createSetupSequenceOptions,
  type SetupPreviewItem,
  type SetupScreenStep,
} from './setup-flow';

export function SetupHero({ step }: { step: SetupScreenStep }) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <LinearGradient
      colors={isDark ? [palette.indigoSoft, palette.indigo] : [palette.navy, palette.violet]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.logoMark}>
        <AppIcon accessible={false} color={palette.white} name="calendar" size={24} />
      </View>
      <View style={styles.heroCopy}>
        <AppText accessibilityRole="header" variant="title" color={palette.white}>
          처음 설정
        </AppText>
        <AppText variant="caption" color="rgba(255,255,255,0.82)">
          약 1분이면 내 근무표를 만들 수 있어요.
        </AppText>
      </View>
      <View style={styles.stepBadge}>
        <AppText variant="label" color={palette.white}>
          {step}/3
        </AppText>
      </View>
    </LinearGradient>
  );
}

export function SetupProgress({ step }: { step: SetupScreenStep }) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View
      accessibilityLabel={`첫 설정 ${step}단계, 총 3단계`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step }}
      style={styles.progress}>
      {(['근무 방식', '순서·시간', '첫 근무일'] as const).map((label, index) => {
        const value = (index + 1) as SetupScreenStep;
        const active = value <= step;
        return (
          <View key={label} style={styles.progressItem}>
            <View style={[styles.progressLine, active && styles.progressLineActive]} />
            <AppText
              variant="caption"
              color={value === step ? palette.indigoDark : palette.inkMuted}
              style={styles.progressLabel}>
              {label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

export function WorkModeStep({
  presetId,
  stackOptions,
  onSelect,
}: {
  presetId: WorkPatternPresetId | null;
  stackOptions: boolean;
  onSelect: (presetId: WorkPatternPresetId) => void;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.stepSection}>
      <View style={styles.sectionCopy}>
        <AppText accessibilityRole="header" variant="heading" style={styles.centerText}>
          근무 방식을 선택해요
        </AppText>
        <AppText variant="body" tone="secondary" style={styles.centerText}>
          회사에서 사용하는 반복 근무표를 선택해요.
        </AppText>
      </View>
      <View
        accessibilityRole="radiogroup"
        style={[styles.modeOptions, stackOptions && styles.modeOptionsStacked]}>
        {WORK_PATTERN_PRESETS.map((preset) => (
          <ModeOption
            description={preset.description}
            icon={preset.id === 'weekday' ? 'shift-day' : 'repeat'}
            iconColor={preset.id === 'weekday' ? palette.mintDark : palette.violet}
            iconBackground={preset.id === 'weekday' ? palette.mintSoft : palette.violetSoft}
            horizontal={stackOptions}
            key={preset.id}
            label={preset.name}
            onPress={() => onSelect(preset.id)}
            selected={presetId === preset.id}
            style={stackOptions ? styles.modeOptionStacked : undefined}
          />
        ))}
      </View>
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
    <Pressable
      accessibilityLabel={`${label}. ${description}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeOption,
        style,
        selected && styles.modeOptionSelected,
        pressed && styles.pressed,
      ]}>
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
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioCenter} /> : null}
      </View>
    </Pressable>
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
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            hitSlop={4}
            key={option.label}
            onPress={() => onSelect(index)}
            style={({ pressed }) => [
              styles.positionOption,
              compact && styles.positionOptionCompact,
              selected && {
                backgroundColor: appearance?.softColor ?? palette.mintSoft,
                borderColor: appearance?.accentColor ?? palette.mint,
              },
              pressed && styles.pressed,
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
              <AppText
                variant="label"
                color={selected ? appearance?.accentColor ?? palette.mintDark : palette.ink}>
                {option.shortName}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {option.detail}
              </AppText>
            </View>
          </Pressable>
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
  const rotate = (index: number) => {
    const current = sequence[index];
    const next = SEQUENCE_ORDER[(SEQUENCE_ORDER.indexOf(current) + 1) % SEQUENCE_ORDER.length];
    onChange(sequence.map((id, itemIndex) => (itemIndex === index ? next : id)));
  };

  return (
    <View style={styles.sequenceEditor}>
      <View accessibilityRole="list" style={styles.sequenceGrid}>
        {sequence.map((id, index) => {
          const shift = {
            id,
            isOff: id === 'off',
            color: palette.ink,
            softColor: palette.surfaceSoft,
          };
          const appearance = getShiftAppearance(shift, palette, isDark);
          return (
            <Pressable
              accessibilityHint="누르면 주간, 오후, 야간, 휴무 순서로 바뀌어요."
              accessibilityLabel={`${index + 1}일차 ${SEQUENCE_LABELS[id]}`}
              accessibilityRole="button"
              key={`${index}-${id}`}
              onPress={() => rotate(index)}
              style={({ pressed }) => [
                styles.sequenceItem,
                { borderColor: appearance.accentColor, backgroundColor: appearance.softColor },
                pressed && styles.pressed,
              ]}>
              <AppText variant="caption" tone="secondary">
                {index + 1}일
              </AppText>
              <AppText variant="label">{SEQUENCE_LABELS[id]}</AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sequenceActions}>
        <AppButton
          disabled={sequence.length <= CUSTOM_PATTERN_MIN_DAYS}
          label="마지막 날 빼기"
          onPress={() => onChange(sequence.slice(0, -1))}
          size="compact"
          variant="secondary"
        />
        <AppButton
          disabled={sequence.length >= CUSTOM_PATTERN_MAX_DAYS}
          label="날짜 추가하기"
          onPress={() => onChange([...sequence, 'off'])}
          size="compact"
          variant="secondary"
        />
      </View>
      <AppText variant="caption" tone="tertiary">
        각 날짜를 누르면 주간 → 오후 → 야간 → 휴무로 바뀌어요.
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
  showDay = true,
  showEvening = false,
  showNight = true,
}: {
  dayColor: string;
  dayDuration: ReturnType<typeof calculateShiftDuration>;
  dayEnd: string;
  dayStart: string;
  eveningColor: string;
  eveningDuration: ReturnType<typeof calculateShiftDuration>;
  eveningEnd: string;
  eveningStart: string;
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
  showDay?: boolean;
  showEvening?: boolean;
  showNight?: boolean;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.workTimes}>
      {showDay ? (
        <TimeInputRow
          color={dayColor}
          duration={dayDuration}
          end={dayEnd}
          label="주간"
          onChangeEnd={onChangeDayEnd}
          onChangeStart={onChangeDayStart}
          shiftId="day"
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
            label="오후"
            onChangeEnd={onChangeEveningEnd}
            onChangeStart={onChangeEveningStart}
            shiftId="evening"
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
            label="야간"
            onChangeEnd={onChangeNightEnd}
            onChangeStart={onChangeNightStart}
            shiftId="night"
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
  label,
  onChangeEnd,
  onChangeStart,
  shiftId,
  start,
}: {
  color: string;
  duration: ReturnType<typeof calculateShiftDuration>;
  end: string;
  label: string;
  onChangeEnd: (value: string) => void;
  onChangeStart: (value: string) => void;
  shiftId: 'day' | 'evening' | 'night';
  start: string;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [focusedField, setFocusedField] = useState<'start' | 'end' | null>(null);

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
          color={duration ? palette.inkMuted : palette.danger}
          style={styles.durationText}>
          {duration
            ? `${duration.endsNextDay ? '다음 날 종료 · ' : ''}${formatDuration(duration.durationMinutes)}`
            : '시간을 확인해 주세요.'}
        </AppText>
      </View>
      <View style={styles.timeControls}>
        <TextInput
          accessibilityLabel={`${label} 시작 시간`}
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          onBlur={() => {
            setFocusedField(null);
            onChangeStart(normalizeTimeInput(start));
          }}
          onChangeText={(value) => onChangeStart(formatTimeInputWhileTyping(value))}
          onFocus={() => setFocusedField('start')}
          placeholder="06:45"
          placeholderTextColor={palette.inkSoft}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[
            styles.timeInput,
            focusedField === 'start' && { borderColor: color },
            parseTimeInput(start) === null && styles.invalidInput,
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
            onChangeEnd(normalizeTimeInput(end));
          }}
          onChangeText={(value) => onChangeEnd(formatTimeInputWhileTyping(value))}
          onFocus={() => setFocusedField('end')}
          placeholder="17:45"
          placeholderTextColor={palette.inkSoft}
          selectTextOnFocus
          selectionColor={palette.indigo}
          style={[
            styles.timeInput,
            focusedField === 'end' && { borderColor: color },
            parseTimeInput(end) === null && styles.invalidInput,
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
    <Card density="compact" style={styles.previewCard}>
      <View style={styles.sectionCopy}>
        <AppText accessibilityRole="header" variant="label">
          미리 보기
        </AppText>
        <AppText variant="caption" tone="secondary">
          첫 근무일부터 이어지는 일정이에요.
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
    </Card>
  );
}

function createStyles(palette: AppPalette, isDark: boolean) {
  return StyleSheet.create({
    hero: {
      minHeight: 104,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      overflow: 'hidden',
      borderRadius: radii.large,
      padding: spacing.large,
    },
    heroGlow: {
      position: 'absolute',
      width: 150,
      height: 150,
      top: -76,
      right: -30,
      borderRadius: 75,
      backgroundColor: 'rgba(255,255,255,0.10)',
    },
    logoMark: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    heroCopy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    stepBadge: {
      minWidth: 48,
      minHeight: 36,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: spacing.small,
    },
    progress: { flexDirection: 'row', gap: spacing.small },
    progressItem: { flex: 1, gap: spacing.tiny },
    progressLine: {
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.surfaceSoft,
    },
    progressLineActive: { backgroundColor: palette.indigo },
    progressLabel: { textAlign: 'center' },
    stepSection: { gap: spacing.large },
    sectionCopy: { minWidth: 0, gap: spacing.tiny },
    centerText: { textAlign: 'center' },
    modeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    modeOptionsStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
    modeOption: {
      minWidth: 0,
      minHeight: 144,
      flexBasis: '46%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      borderRadius: radii.large,
      backgroundColor: palette.surface,
      padding: spacing.medium,
    },
    modeOptionStacked: {
      minHeight: 104,
      flexBasis: 'auto',
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },
    modeOptionSelected: {
      borderColor: palette.indigo,
      backgroundColor: palette.indigoSoft,
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
    radio: {
      width: 22,
      height: 22,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: palette.controlLine,
      borderRadius: 11,
    },
    radioSelected: { borderColor: palette.indigo },
    radioCenter: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: palette.indigo,
    },
    pressed: { opacity: 0.72 },
    positionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    positionOption: {
      minWidth: 96,
      minHeight: 72,
      flexBasis: '30%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surface,
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.small,
    },
    positionOptionCompact: { minWidth: 116, flexBasis: '44%' },
    positionCopy: { minWidth: 0, gap: 1 },
    sequenceEditor: { gap: spacing.small },
    sequenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    sequenceItem: {
      minWidth: 76,
      minHeight: 56,
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderWidth: 1.5,
      borderRadius: radii.medium,
      padding: spacing.small,
    },
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
