import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { AppText } from '@/components/ui-kit';
import {
  Button,
  interaction,
  radius,
  size,
  space,
  typeScale,
  useDesignSystemTheme,
} from '@/design-system';
import { triggerSelectionFeedback } from '@/features/feedback/feedback-controller';
import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';

import type { QuickTimerDuration } from './quick-timer-controller';
import {
  clampQuickTimerDuration,
  getQuickTimerDurationStepperPresentation,
  parseQuickTimerDurationInput,
  QUICK_TIMER_CUSTOM_INITIAL_DURATION,
  quickTimerDurationToOffset,
  quickTimerOffsetToDuration,
  resolveQuickTimerWheelLayout,
  shouldAcceptQuickTimerWheelEvent,
} from './quick-timer-model';

const QUICK_TIMER_DURATIONS = Array.from(
  { length: 60 },
  (_, index) => (index + 1) as QuickTimerDuration,
);
const SCROLL_FALLBACK_SETTLE_DELAY_MS = 220;

type TimerEntryMode = 'wheel' | 'numeric';

type ProgrammaticWheelScroll = {
  revision: number;
  targetOffset: number;
};

function resolveInitialDuration(
  durationMinutes: QuickTimerDuration | null | undefined,
): QuickTimerDuration {
  return durationMinutes ?? QUICK_TIMER_CUSTOM_INITIAL_DURATION;
}

export function QuickTimerDurationStepper({
  busy,
  initialDurationMinutes = QUICK_TIMER_CUSTOM_INITIAL_DURATION,
  onCancel,
  onSubmit,
  replacingTimer,
  visible,
}: {
  busy: boolean;
  initialDurationMinutes?: QuickTimerDuration | null;
  onCancel: () => void;
  onSubmit: (durationMinutes: QuickTimerDuration) => void;
  replacingTimer: boolean;
  visible: boolean;
}) {
  const { colors } = useDesignSystemTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const closeFocus = useWebFocusVisible();
  const initialDuration = resolveInitialDuration(initialDurationMinutes);
  const [entryMode, setEntryMode] = useState<TimerEntryMode>('wheel');
  const wheelLayout = resolveQuickTimerWheelLayout(
    height,
    fontScale,
    entryMode === 'numeric',
  );
  const initialOffset = quickTimerDurationToOffset(
    initialDuration,
    wheelLayout.itemHeight,
  );
  const listRef = useRef<ScrollView>(null);
  const adjustableRef = useRef<View | null>(null);
  const numericInputRef = useRef<TextInput | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionRevisionRef = useRef(0);
  const dragRevisionRef = useRef<number | null>(null);
  const momentumRevisionRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef<ProgrammaticWheelScroll | null>(null);
  const focusRevisionRef = useRef(0);
  const restoreAdjustableFocusRef = useRef(false);
  const visibleRef = useRef(visible);
  const entryModeRef = useRef<TimerEntryMode>('wheel');
  const wasVisibleRef = useRef(false);
  const durationRef = useRef<QuickTimerDuration>(initialDuration);
  const committedDurationRef = useRef<QuickTimerDuration>(initialDuration);
  const offsetRef = useRef(initialOffset);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [numericInput, setNumericInput] = useState(String(initialDuration));
  const [numericInputError, setNumericInputError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const numericInputResult = parseQuickTimerDurationInput(numericInput);
  const presentedDuration =
    entryMode === 'numeric' && numericInputResult.valid
      ? numericInputResult.durationMinutes
      : durationMinutes;
  const presentation = getQuickTimerDurationStepperPresentation(presentedDuration);
  const stackActions = width < 360 || fontScale >= 1.4;
  const selectionTop =
    (wheelLayout.viewportHeight - wheelLayout.itemHeight) / 2;
  const selectedFontSize =
    wheelLayout.itemHeight === 104
      ? 54
      : wheelLayout.itemHeight === 80
        ? 46
        : 40;
  const neighborFontSize =
    wheelLayout.itemHeight === 104
      ? 32
      : wheelLayout.itemHeight === 80
        ? 28
        : 24;

  useLayoutEffect(() => {
    visibleRef.current = visible;
    entryModeRef.current = entryMode;
  }, [entryMode, visible]);

  const clearSettleTimeout = useCallback(() => {
    if (settleTimeoutRef.current === null) return;
    clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = null;
  }, []);

  const clearFocusTimeout = useCallback(() => {
    if (focusTimeoutRef.current === null) return;
    clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = null;
  }, []);

  const scheduleAdjustableFocus = useCallback((delay: number) => {
    clearFocusTimeout();
    const revision = ++focusRevisionRef.current;
    focusTimeoutRef.current = setTimeout(() => {
      focusTimeoutRef.current = null;
      if (
        revision !== focusRevisionRef.current ||
        !visibleRef.current ||
        entryModeRef.current !== 'wheel'
      ) {
        return;
      }
      if (Platform.OS === 'web') {
        (
          adjustableRef.current as
            | (View & { focus?: () => void })
            | null
        )?.focus?.();
        return;
      }
      const node = findNodeHandle(adjustableRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, delay);
  }, [clearFocusTimeout]);

  const startProgrammaticScroll = useCallback((
    offset: number,
    animated: boolean,
    revision: number,
  ) => {
    programmaticScrollRef.current = animated
      ? { revision, targetOffset: offset }
      : null;
    momentumRevisionRef.current = animated ? revision : null;
    listRef.current?.scrollTo({ animated, y: offset });
  }, []);

  const publishDuration = useCallback((nextDuration: QuickTimerDuration) => {
    durationRef.current = nextDuration;
    setDurationMinutes((current) =>
      current === nextDuration ? current : nextDuration,
    );
  }, []);

  const emitSelectionFeedback = useCallback((nextDuration: QuickTimerDuration) => {
    if (committedDurationRef.current === nextDuration) return;
    committedDurationRef.current = nextDuration;
    void triggerSelectionFeedback();
  }, []);

  const settleOffset = useCallback((
    offset: number,
    withFeedback: boolean,
    revision: number,
  ) => {
    if (!shouldAcceptQuickTimerWheelEvent({
      actualOffset: offset,
      currentRevision: interactionRevisionRef.current,
      eventRevision: revision,
      visible: visibleRef.current,
      wheelActive: entryModeRef.current === 'wheel',
    })) {
      return durationRef.current;
    }
    const nextDuration = quickTimerOffsetToDuration(
      offset,
      wheelLayout.itemHeight,
    );
    const snappedOffset = quickTimerDurationToOffset(
      nextDuration,
      wheelLayout.itemHeight,
    );
    offsetRef.current = snappedOffset;
    publishDuration(nextDuration);
    if (Math.abs(offset - snappedOffset) > 0.5) {
      startProgrammaticScroll(snappedOffset, !reduceMotion, revision);
    } else {
      programmaticScrollRef.current = null;
      momentumRevisionRef.current = null;
    }
    if (dragRevisionRef.current === revision) dragRevisionRef.current = null;
    if (withFeedback) emitSelectionFeedback(nextDuration);
    return nextDuration;
  }, [
    emitSelectionFeedback,
    publishDuration,
    reduceMotion,
    startProgrammaticScroll,
    wheelLayout.itemHeight,
  ]);

  const selectDuration = useCallback((
    nextValue: number,
    animated = !reduceMotion,
  ) => {
    if (
      busy ||
      !visibleRef.current ||
      entryModeRef.current !== 'wheel'
    ) {
      return;
    }
    const revision = ++interactionRevisionRef.current;
    dragRevisionRef.current = null;
    const nextDuration = clampQuickTimerDuration(nextValue);
    const nextOffset = quickTimerDurationToOffset(
      nextDuration,
      wheelLayout.itemHeight,
    );
    clearSettleTimeout();
    offsetRef.current = nextOffset;
    publishDuration(nextDuration);
    emitSelectionFeedback(nextDuration);
    startProgrammaticScroll(nextOffset, animated, revision);
  }, [
    busy,
    clearSettleTimeout,
    emitSelectionFeedback,
    publishDuration,
    reduceMotion,
    startProgrammaticScroll,
    wheelLayout.itemHeight,
  ]);

  const beginNumericEntry = useCallback(() => {
    if (busy || !visibleRef.current || entryModeRef.current !== 'wheel') return;
    interactionRevisionRef.current += 1;
    dragRevisionRef.current = null;
    programmaticScrollRef.current = null;
    clearSettleTimeout();
    clearFocusTimeout();
    focusRevisionRef.current += 1;
    setNumericInput(String(durationRef.current));
    setNumericInputError(null);
    entryModeRef.current = 'numeric';
    setEntryMode('numeric');
  }, [busy, clearFocusTimeout, clearSettleTimeout, setEntryMode]);

  const commitNumericEntry = useCallback(() => {
    const result = parseQuickTimerDurationInput(numericInput);
    if (!result.valid) {
      setNumericInputError(result.error);
      return null;
    }

    const revision = ++interactionRevisionRef.current;
    dragRevisionRef.current = null;
    clearSettleTimeout();
    const nextOffset = quickTimerDurationToOffset(
      result.durationMinutes,
      wheelLayout.itemHeight,
    );
    offsetRef.current = nextOffset;
    publishDuration(result.durationMinutes);
    emitSelectionFeedback(result.durationMinutes);
    startProgrammaticScroll(nextOffset, !reduceMotion, revision);
    setNumericInputError(null);
    restoreAdjustableFocusRef.current = true;
    entryModeRef.current = 'wheel';
    setEntryMode('wheel');
    return result.durationMinutes;
  }, [
    clearSettleTimeout,
    emitSelectionFeedback,
    numericInput,
    publishDuration,
    reduceMotion,
    setEntryMode,
    startProgrammaticScroll,
    wheelLayout.itemHeight,
  ]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      interactionRevisionRef.current += 1;
      dragRevisionRef.current = null;
      programmaticScrollRef.current = null;
      momentumRevisionRef.current = null;
      clearSettleTimeout();
      clearFocusTimeout();
      focusRevisionRef.current += 1;
      return;
    }
    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;
    let initialized = false;
    const timeout = setTimeout(() => {
      initialized = true;
      const nextDuration = resolveInitialDuration(initialDurationMinutes);
      durationRef.current = nextDuration;
      committedDurationRef.current = nextDuration;
      setDurationMinutes(nextDuration);
      setNumericInput(String(nextDuration));
      setNumericInputError(null);
      entryModeRef.current = 'wheel';
      setEntryMode('wheel');
      listRef.current?.scrollTo({
        animated: false,
        y: quickTimerDurationToOffset(nextDuration, wheelLayout.itemHeight),
      });
    }, 0);
    return () => {
      clearTimeout(timeout);
      if (!initialized) wasVisibleRef.current = false;
    };
  }, [
    clearFocusTimeout,
    clearSettleTimeout,
    initialDurationMinutes,
    visible,
    wheelLayout.itemHeight,
  ]);

  useEffect(() => {
    if (!visible) return;
    interactionRevisionRef.current += 1;
    dragRevisionRef.current = null;
    programmaticScrollRef.current = null;
    momentumRevisionRef.current = null;
    clearSettleTimeout();
    const timeout = setTimeout(() => {
      if (!visibleRef.current) return;
      const nextOffset = quickTimerDurationToOffset(
        durationRef.current,
        wheelLayout.itemHeight,
      );
      offsetRef.current = nextOffset;
      listRef.current?.scrollTo({ animated: false, y: nextOffset });
    }, 0);
    return () => clearTimeout(timeout);
  }, [clearSettleTimeout, visible, wheelLayout.itemHeight]);

  useEffect(() => {
    if (!visible) return;
    if (entryMode === 'numeric') {
      clearFocusTimeout();
      const revision = ++focusRevisionRef.current;
      focusTimeoutRef.current = setTimeout(() => {
        focusTimeoutRef.current = null;
        if (
          revision === focusRevisionRef.current &&
          visibleRef.current &&
          entryModeRef.current === 'numeric'
        ) {
          numericInputRef.current?.focus();
        }
      }, 0);
      return clearFocusTimeout;
    }
    if (restoreAdjustableFocusRef.current) {
      restoreAdjustableFocusRef.current = false;
      scheduleAdjustableFocus(Platform.OS === 'web' ? 0 : 80);
      return clearFocusTimeout;
    }
  }, [
    clearFocusTimeout,
    entryMode,
    scheduleAdjustableFocus,
    visible,
  ]);

  useEffect(() => {
    if (!visible) return;
    scheduleAdjustableFocus(Platform.OS === 'web' ? 0 : 180);
    return clearFocusTimeout;
  }, [clearFocusTimeout, scheduleAdjustableFocus, visible]);

  useEffect(() => () => {
    clearFocusTimeout();
    clearSettleTimeout();
  }, [clearFocusTimeout, clearSettleTimeout]);

  const observeScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    if (
      programmaticScrollRef.current !== null ||
      !shouldAcceptQuickTimerWheelEvent({
        actualOffset: nextOffset,
        currentRevision: interactionRevisionRef.current,
        eventRevision: dragRevisionRef.current,
        visible: visibleRef.current,
        wheelActive: entryModeRef.current === 'wheel',
      })
    ) {
      return;
    }
    offsetRef.current = nextOffset;
    publishDuration(
      quickTimerOffsetToDuration(nextOffset, wheelLayout.itemHeight),
    );
  }, [publishDuration, wheelLayout.itemHeight]);

  const scheduleDragSettle = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    const revision = dragRevisionRef.current;
    if (!shouldAcceptQuickTimerWheelEvent({
      actualOffset: nextOffset,
      currentRevision: interactionRevisionRef.current,
      eventRevision: revision,
      visible: visibleRef.current,
      wheelActive: entryModeRef.current === 'wheel',
    })) {
      return;
    }
    offsetRef.current = nextOffset;
    clearSettleTimeout();
    settleTimeoutRef.current = setTimeout(() => {
      settleTimeoutRef.current = null;
      if (revision !== null) settleOffset(offsetRef.current, true, revision);
    }, SCROLL_FALLBACK_SETTLE_DELAY_MS);
  }, [clearSettleTimeout, settleOffset]);

  const handleMomentumBegin = useCallback(() => {
    if (!visibleRef.current || entryModeRef.current !== 'wheel') return;
    const programmatic = programmaticScrollRef.current;
    momentumRevisionRef.current =
      programmatic?.revision ?? dragRevisionRef.current;
    clearSettleTimeout();
  }, [clearSettleTimeout]);

  const handleMomentumEnd = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    const revision = momentumRevisionRef.current;
    const programmatic = programmaticScrollRef.current;
    const expectedOffset =
      programmatic?.revision === revision
        ? programmatic.targetOffset
        : null;
    if (!shouldAcceptQuickTimerWheelEvent({
      actualOffset: nextOffset,
      currentRevision: interactionRevisionRef.current,
      eventRevision: revision,
      expectedOffset,
      visible: visibleRef.current,
      wheelActive: entryModeRef.current === 'wheel',
    })) {
      return;
    }

    clearSettleTimeout();
    if (programmatic?.revision === revision) {
      offsetRef.current = programmatic.targetOffset;
      programmaticScrollRef.current = null;
      momentumRevisionRef.current = null;
      return;
    }
    if (revision !== null) settleOffset(nextOffset, true, revision);
  }, [clearSettleTimeout, settleOffset]);

  const beginWheelDrag = useCallback(() => {
    if (!visibleRef.current || entryModeRef.current !== 'wheel') return;
    const revision = ++interactionRevisionRef.current;
    dragRevisionRef.current = revision;
    programmaticScrollRef.current = null;
    clearSettleTimeout();
  }, [clearSettleTimeout]);

  const handleCancel = useCallback(() => {
    interactionRevisionRef.current += 1;
    dragRevisionRef.current = null;
    programmaticScrollRef.current = null;
    momentumRevisionRef.current = null;
    clearSettleTimeout();
    clearFocusTimeout();
    focusRevisionRef.current += 1;
    restoreAdjustableFocusRef.current = false;
    setNumericInputError(null);
    entryModeRef.current = 'wheel';
    setEntryMode('wheel');
    onCancel();
  }, [clearFocusTimeout, clearSettleTimeout, onCancel, setEntryMode]);

  const handleSubmit = useCallback(() => {
    if (busy) return;
    if (entryMode === 'numeric') {
      const result = parseQuickTimerDurationInput(numericInput);
      if (!result.valid) {
        setNumericInputError(result.error);
        return;
      }
      interactionRevisionRef.current += 1;
      dragRevisionRef.current = null;
      programmaticScrollRef.current = null;
      momentumRevisionRef.current = null;
      clearSettleTimeout();
      clearFocusTimeout();
      focusRevisionRef.current += 1;
      restoreAdjustableFocusRef.current = false;
      publishDuration(result.durationMinutes);
      emitSelectionFeedback(result.durationMinutes);
      onSubmit(result.durationMinutes);
      return;
    }

    interactionRevisionRef.current += 1;
    dragRevisionRef.current = null;
    programmaticScrollRef.current = null;
    momentumRevisionRef.current = null;
    clearSettleTimeout();
    clearFocusTimeout();
    focusRevisionRef.current += 1;
    const nextDuration = quickTimerOffsetToDuration(
      offsetRef.current,
      wheelLayout.itemHeight,
    );
    publishDuration(nextDuration);
    emitSelectionFeedback(nextDuration);
    onSubmit(nextDuration);
  }, [
    busy,
    clearFocusTimeout,
    clearSettleTimeout,
    emitSelectionFeedback,
    entryMode,
    numericInput,
    onSubmit,
    publishDuration,
    wheelLayout.itemHeight,
  ]);

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={handleCancel}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      visible={visible}>
      <SafeAreaView
        accessibilityViewIsModal
        edges={['top', 'right', 'bottom', 'left']}
        style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerSide} />
          <AppText accessibilityRole="header" aria-level={1} style={styles.headerTitle} variant="title">
            타이머 직접 입력
          </AppText>
          <Pressable
            accessibilityLabel="직접 입력 닫기"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={8}
            onBlur={closeFocus.onBlur}
            onFocus={closeFocus.onFocus}
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.headerClose,
              pressed && !busy && styles.pressed,
              closeFocus.focusVisible &&
                !busy && [styles.focusVisible, { outlineColor: colors.focus }],
            ]}>
            <AppIcon
              accessible={false}
              color={busy ? colors.textDisabled : colors.text}
              name="close"
              size={26}
            />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.body}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.body}>
        <View style={styles.content}>
          <View testID="quick-timer-duration-range">
            <AppText tone="secondary" style={styles.centerText} variant="body">
              1분부터 60분까지
            </AppText>
          </View>
          <View
            ref={adjustableRef}
            accessible={entryMode === 'wheel'}
            accessibilityActions={[
              { label: '1분 늘리기', name: 'increment' },
              { label: '1분 줄이기', name: 'decrement' },
              { label: '숫자로 입력', name: 'activate' },
            ]}
            accessibilityHint="위아래로 조절하거나 두 번 눌러 숫자로 입력합니다."
            accessibilityLabel="타이머 시간"
            accessibilityRole={entryMode === 'wheel' ? 'adjustable' : undefined}
            accessibilityState={{ disabled: busy }}
            accessibilityValue={{ text: presentation.accessibilityLabel }}
            collapsable={false}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') {
                selectDuration(durationRef.current + 1, false);
              }
              if (event.nativeEvent.actionName === 'decrement') {
                selectDuration(durationRef.current - 1, false);
              }
              if (event.nativeEvent.actionName === 'activate') {
                beginNumericEntry();
              }
            }}
            onAccessibilityTap={beginNumericEntry}
            style={[
              styles.wheel,
              {
                height: wheelLayout.viewportHeight,
                borderColor: colors.border,
              },
            ]}
            testID="quick-timer-duration-adjustable">
            <ScrollView
              ref={listRef}
              accessible={false}
              accessibilityElementsHidden
              bounces={false}
              contentContainerStyle={{ paddingVertical: selectionTop }}
              contentOffset={{ x: 0, y: initialOffset }}
              decelerationRate="normal"
              importantForAccessibility="no-hide-descendants"
              nestedScrollEnabled
              onMomentumScrollBegin={handleMomentumBegin}
              onMomentumScrollEnd={handleMomentumEnd}
              onScroll={observeScroll}
              onScrollBeginDrag={beginWheelDrag}
              onScrollEndDrag={scheduleDragSettle}
              overScrollMode="never"
              pointerEvents={entryMode === 'numeric' ? 'none' : 'auto'}
              scrollEnabled={!busy && entryMode === 'wheel'}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={wheelLayout.itemHeight}
              style={styles.wheelList}
              testID="quick-timer-duration-wheel">
              {QUICK_TIMER_DURATIONS.map((item) => {
                const selected = item === durationMinutes;
                return (
                  <Pressable
                    accessible={false}
                    accessibilityElementsHidden
                    disabled={busy || entryMode === 'numeric'}
                    importantForAccessibility="no-hide-descendants"
                    key={item}
                    onPress={() => {
                      if (selected) {
                        beginNumericEntry();
                        return;
                      }
                      selectDuration(item);
                    }}
                    style={[
                      styles.wheelRow,
                      { height: wheelLayout.itemHeight },
                    ]}>
                    {selected ? (
                      <View style={styles.selectedValueRow}>
                        <View style={styles.selectedValueSide} />
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.wheelNumber,
                            styles.wheelNumberSelected,
                            {
                              color: colors.text,
                              fontSize: selectedFontSize,
                              lineHeight: wheelLayout.itemHeight - 8,
                            },
                          ]}>
                          {item}
                        </Text>
                        <View style={styles.selectedValueSide}>
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.wheelUnit,
                              {
                                color: colors.text,
                                fontSize: neighborFontSize * 0.72,
                                lineHeight: neighborFontSize,
                              },
                            ]}>
                            분
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.wheelNeighborNumber,
                          {
                            color: colors.textSoft,
                            fontSize: neighborFontSize,
                            lineHeight: wheelLayout.itemHeight - 8,
                          },
                        ]}>
                        {item}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            {entryMode === 'numeric' ? (
              <View
                style={[
                  styles.numericOverlay,
                  {
                    top: selectionTop,
                    height: wheelLayout.itemHeight,
                    backgroundColor: colors.background,
                  },
                ]}>
                <View style={styles.selectedValueSide} />
                <TextInput
                  ref={numericInputRef}
                  accessibilityHint="1분부터 60분까지 입력합니다."
                  accessibilityLabel="타이머 분 직접 입력"
                  allowFontScaling={false}
                  aria-invalid={!numericInputResult.valid}
                  autoCorrect={false}
                  editable={!busy}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={(value) => {
                    setNumericInput(value);
                    const result = parseQuickTimerDurationInput(value);
                    setNumericInputError(result.valid ? null : result.error);
                  }}
                  onSubmitEditing={commitNumericEntry}
                  returnKeyType="done"
                  selectTextOnFocus
                  selectionColor={colors.accent}
                  style={[
                    styles.numericInput,
                    {
                      color: colors.text,
                      fontSize: selectedFontSize,
                      lineHeight: wheelLayout.itemHeight - 8,
                    },
                  ]}
                  testID="quick-timer-duration-input"
                  value={numericInput}
                />
                <View style={styles.selectedValueSide}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.wheelUnit,
                      {
                        color: colors.text,
                        fontSize: neighborFontSize * 0.72,
                        lineHeight: neighborFontSize,
                      },
                    ]}>
                    분
                  </Text>
                </View>
              </View>
            ) : null}
            <View
              pointerEvents="none"
              style={[
                styles.selectionFrame,
                {
                  top: selectionTop,
                  height: wheelLayout.itemHeight,
                  borderColor: numericInputError
                    ? colors.danger
                    : entryMode === 'numeric'
                      ? colors.focus
                      : colors.borderStrong,
                  borderTopWidth: entryMode === 'numeric' ? 2 : 1,
                  borderBottomWidth: entryMode === 'numeric' ? 2 : 1,
                },
              ]}
            />
          </View>
          <View
            accessibilityLiveRegion={numericInputError ? 'assertive' : 'none'}
            style={styles.inputHintContainer}
            testID="quick-timer-duration-help">
            <AppText
              color={numericInputError ? colors.danger : colors.textMuted}
              style={styles.inputHint}
              variant="caption">
              {numericInputError ?? (
                entryMode === 'numeric'
                  ? '입력한 시간으로 타이머를 시작합니다.'
                  : '가운데 숫자를 누르면 직접 입력할 수 있습니다.'
              )}
            </AppText>
          </View>
        </View>
        </ScrollView>

        <View
          style={[
            styles.actions,
            stackActions && styles.actionsStacked,
            { borderTopColor: colors.border },
          ]}>
          <Button
            disabled={busy}
            label="취소"
            onPress={handleCancel}
            style={styles.action}
            testID="quick-timer-stepper-cancel"
            variant="secondary"
          />
          <Button
            accessibilityLabel={
              replacingTimer
                ? `${presentation.durationMinutes}분으로 변경`
                : `${presentation.durationMinutes}분 타이머 시작`
            }
            disabled={busy || (entryMode === 'numeric' && !numericInputResult.valid)}
            icon="play"
            label={replacingTimer ? `${presentation.durationMinutes}분으로 변경` : '시작'}
            loading={busy}
            onPress={handleSubmit}
            style={styles.action}
            testID="quick-timer-stepper-start"
          />
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  body: { flex: 1 },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
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
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  centerText: { textAlign: 'center' },
  wheel: {
    width: '72%',
    minWidth: 208,
    maxWidth: 288,
    position: 'relative',
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  wheelList: { flex: 1 },
  wheelRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedValueRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedValueSide: {
    width: 52,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelNumber: {
    ...typeScale.display,
    flex: 1,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  wheelNeighborNumber: {
    ...typeScale.heading,
    width: '100%',
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  wheelNumberSelected: { opacity: 1 },
  wheelUnit: {
    ...typeScale.heading,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  numericOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numericInput: {
    ...typeScale.display,
    flex: 1,
    height: '100%',
    padding: 0,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  inputHint: {
    minHeight: typeScale.caption.lineHeight,
    textAlign: 'center',
  },
  inputHintContainer: {
    width: '100%',
    minHeight: typeScale.caption.lineHeight,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  selectionFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  actions: {
    flexShrink: 0,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionsStacked: { flexDirection: 'column-reverse' },
  action: { flex: 1 },
  pressed: { opacity: interaction.pressedOpacity },
  focusVisible:
    Platform.OS === 'web'
      ? {
          outlineOffset: 2,
          outlineStyle: 'solid',
          outlineWidth: 2,
        }
      : {},
});
