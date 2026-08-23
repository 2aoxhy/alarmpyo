import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { AppText } from '@/components/ui-kit';
import {
  interaction,
  radius,
  size,
  space,
  typeScale,
  useDesignSystemTheme,
} from '@/design-system';
import { triggerSelectionFeedback } from '@/features/feedback/feedback-controller';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';

import {
  appendQuickTimerKeypadDigits,
  deleteQuickTimerKeypadDigit,
  getQuickTimerKeypadPresentation,
  type QuickTimerKeypadToken,
} from './quick-timer-model';
import type { QuickTimerDuration } from './quick-timer-controller';

const KEYPAD_ROWS: readonly (readonly (QuickTimerKeypadToken | 'delete')[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['00', '0', 'delete'],
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function KeypadButton({
  buttonSize,
  disabled = false,
  keyValue,
  onPress,
  testID,
}: {
  buttonSize: number;
  disabled?: boolean;
  keyValue: QuickTimerKeypadToken | 'delete';
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useDesignSystemTheme();
  const focus = useWebFocusVisible();
  const isDelete = keyValue === 'delete';
  const accessibilityLabel = isDelete
    ? '마지막 숫자 지우기'
    : keyValue === '00'
      ? '숫자 0 두 개'
      : `숫자 ${keyValue}`;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={() => {
        void triggerSelectionFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.keypadButton,
        {
          width: buttonSize,
          height: buttonSize,
          backgroundColor: disabled
            ? colors.surfaceDisabled
            : pressed
              ? colors.surfaceSelected
              : colors.surfaceMuted,
        },
        focus.focusVisible &&
          !disabled && [styles.focusVisible, { outlineColor: colors.focus }],
      ]}
      testID={testID}>
      <AppText
        color={disabled ? colors.textDisabled : colors.text}
        maxFontSizeMultiplier={1.5}
        style={[styles.keypadLabel, isDelete && styles.deleteLabel]}
        variant={isDelete ? 'label' : 'title'}>
        {isDelete ? '지우기' : keyValue}
      </AppText>
    </Pressable>
  );
}

function RoundAction({
  accessibilityLabel,
  busy = false,
  disabled = false,
  icon,
  onPress,
  primary = false,
  testID,
}: {
  accessibilityLabel: string;
  busy?: boolean;
  disabled?: boolean;
  icon: 'close' | 'play';
  onPress: () => void;
  primary?: boolean;
  testID: string;
}) {
  const { colors } = useDesignSystemTheme();
  const focus = useWebFocusVisible();
  const blocked = disabled || busy;
  const foreground = blocked
    ? colors.textDisabled
    : primary
      ? colors.background
      : colors.text;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: blocked }}
      disabled={blocked}
      onBlur={focus.onBlur}
      onFocus={focus.onFocus}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roundAction,
        {
          backgroundColor: blocked
            ? colors.surfaceDisabled
            : primary
              ? colors.focus
              : colors.surfaceMuted,
          borderColor: primary && !blocked ? colors.focus : colors.border,
        },
        pressed && !blocked && styles.pressed,
        focus.focusVisible &&
          !blocked && [styles.focusVisible, { outlineColor: colors.focus }],
      ]}
      testID={testID}>
      {busy ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <AppIcon accessible={false} color={foreground} name={icon} size={26} />
      )}
    </Pressable>
  );
}

export function QuickTimerKeypad({
  busy,
  onCancel,
  onSubmit,
  replacingTimer,
  visible,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (durationMinutes: QuickTimerDuration) => void;
  replacingTimer: boolean;
  visible: boolean;
}) {
  const { colors } = useDesignSystemTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const closeFocus = useWebFocusVisible();
  const titleRef = useRef<Text | null>(null);
  const [digits, setDigits] = useState('');
  const presentation = useMemo(
    () => getQuickTimerKeypadPresentation(digits),
    [digits],
  );
  const compactHeight = height < 700;
  const keypadGap = compactHeight ? space.sm : space.md;
  const availableKeypadWidth = Math.min(360, Math.max(width - space.lg * 2, 0));
  const buttonSize = clamp(
    Math.floor((availableKeypadWidth - keypadGap * 2) / 3),
    72,
    compactHeight ? 78 : 104,
  );
  const keypadWidth = buttonSize * 3 + keypadGap * 2;
  const readoutNumberSize = clamp(
    Math.floor((Math.min(width, 420) - 76) / Math.max(5 * Math.min(fontScale, 1.5), 1)),
    30,
    58,
  );
  const cancel = () => {
    setDigits('');
    onCancel();
  };

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    const timeout = setTimeout(() => {
      const node = findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 180);
    return () => clearTimeout(timeout);
  }, [visible]);

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={cancel}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      visible={visible}>
      <SafeAreaView
        accessibilityViewIsModal
        style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerSide} />
          <AppText
            ref={titleRef}
            accessibilityLabel="타이머 직접 입력. 분을 입력한 다음 00을 눌러야 합니다."
            accessibilityRole="header"
            style={styles.headerTitle}
            variant="title">
            타이머 직접 입력
          </AppText>
          <Pressable
            accessibilityLabel="직접 입력 닫기"
            accessibilityRole="button"
            disabled={busy}
            hitSlop={8}
            onBlur={closeFocus.onBlur}
            onFocus={closeFocus.onFocus}
            onPress={cancel}
            style={({ pressed }) => [
              styles.headerClose,
              pressed && !busy && styles.pressed,
              closeFocus.focusVisible &&
                !busy && [
                  styles.focusVisible,
                  { outlineColor: colors.focus },
                ],
            ]}>
            <AppIcon
              accessible={false}
              color={busy ? colors.textDisabled : colors.text}
              name="close"
              size={26}
            />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            compactHeight && styles.contentCompact,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View
            accessible
            accessibilityLabel={presentation.accessibilityLabel}
            style={[styles.readout, compactHeight && styles.readoutCompact]}>
            {([
              [presentation.minutes, '분'],
              [presentation.seconds, '초'],
            ] as const).map(([value, unit]) => (
              <View key={unit} style={styles.readoutUnit}>
                <AppText
                  color={colors.text}
                  maxFontSizeMultiplier={2}
                  style={[styles.readoutNumber, { fontSize: readoutNumberSize }]}
                  variant="display">
                  {value}
                </AppText>
                <AppText
                  color={colors.textMuted}
                  maxFontSizeMultiplier={2}
                  style={styles.readoutSuffix}
                  variant="label">
                  {unit}
                </AppText>
              </View>
            ))}
          </View>

          <View
            accessibilityLiveRegion={presentation.errorText ? 'polite' : 'none'}
            style={[
              styles.helperContainer,
              compactHeight && styles.helperContainerCompact,
            ]}>
            <AppText
              color={presentation.errorText ? colors.danger : colors.textMuted}
              style={styles.helperText}
              variant="caption">
              {presentation.helperText}
            </AppText>
          </View>

          <View
            style={[
              styles.keypad,
              { gap: keypadGap, width: keypadWidth },
            ]}>
            {KEYPAD_ROWS.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={[styles.keypadRow, { gap: keypadGap }]}>
                {row.map((key) => (
                  <KeypadButton
                    buttonSize={buttonSize}
                    disabled={key === 'delete' && digits.length === 0}
                    key={key}
                    keyValue={key}
                    onPress={() =>
                      setDigits((current) =>
                        key === 'delete'
                          ? deleteQuickTimerKeypadDigit(current)
                          : appendQuickTimerKeypadDigits(current, key),
                      )
                    }
                    testID={`quick-timer-key-${key}`}
                  />
                ))}
              </View>
            ))}
          </View>

        </ScrollView>
        <View style={styles.actionsFooter}>
          <View
            style={[styles.actions, compactHeight && styles.actionsCompact]}>
            <RoundAction
              accessibilityLabel="직접 입력 취소"
              disabled={busy}
              icon="close"
              onPress={cancel}
              testID="quick-timer-keypad-cancel"
            />
            <RoundAction
              accessibilityLabel={
                presentation.durationMinutes === null
                  ? presentation.errorText
                    ? `타이머 시작 불가. ${presentation.errorText}`
                    : '타이머 시작, 시간을 먼저 입력해야 합니다'
                  : replacingTimer
                    ? `${presentation.durationMinutes}분으로 변경`
                    : `${presentation.durationMinutes}분 타이머 시작`
              }
              busy={busy}
              disabled={!presentation.canStart}
              icon="play"
              onPress={() => {
                if (presentation.durationMinutes !== null) {
                  setDigits('');
                  onSubmit(presentation.durationMinutes);
                }
              }}
              primary
              testID="quick-timer-keypad-start"
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: size.minimumTouchTarget },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerClose: {
    width: size.minimumTouchTarget,
    height: size.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  contentCompact: {
    justifyContent: 'flex-start',
    gap: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  readout: {
    minHeight: 92,
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  readoutCompact: { minHeight: 72 },
  readoutUnit: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  readoutNumber: {
    minWidth: 54,
    lineHeight: 68,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  readoutSuffix: { marginLeft: 2, marginRight: space.xs, fontSize: 17 },
  helperContainer: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperContainerCompact: { minHeight: 24 },
  helperText: {
    maxWidth: 360,
    textAlign: 'center',
  },
  keypad: {},
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  keypadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  keypadLabel: {
    ...typeScale.title,
    fontSize: 30,
    lineHeight: 38,
    textAlign: 'center',
  },
  deleteLabel: { fontSize: 14, lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
    paddingTop: space.xs,
  },
  actionsFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  actionsCompact: { paddingTop: 0 },
  roundAction: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  pressed: { transform: [{ scale: 0.96 }], opacity: interaction.pressedOpacity },
  focusVisible:
    Platform.OS === 'web'
      ? {
          outlineOffset: 2,
          outlineStyle: 'solid',
          outlineWidth: 2,
        }
      : {},
});
