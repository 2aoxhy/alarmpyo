import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
  QUICK_TIMER_CUSTOM_INITIAL_DURATION,
  quickTimerDurationToOffset,
  quickTimerOffsetToDuration,
  resolveQuickTimerWheelLayout,
} from './quick-timer-model';

const QUICK_TIMER_DURATIONS = Array.from(
  { length: 60 },
  (_, index) => (index + 1) as QuickTimerDuration,
);
const SCROLL_SETTLE_DELAY_MS = 80;

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
  const wheelLayout = resolveQuickTimerWheelLayout(height, fontScale);
  const initialDuration = resolveInitialDuration(initialDurationMinutes);
  const initialOffset = quickTimerDurationToOffset(
    initialDuration,
    wheelLayout.itemHeight,
  );
  const listRef = useRef<FlatList<QuickTimerDuration>>(null);
  const adjustableRef = useRef<View | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisibleRef = useRef(false);
  const durationRef = useRef<QuickTimerDuration>(initialDuration);
  const committedDurationRef = useRef<QuickTimerDuration>(initialDuration);
  const offsetRef = useRef(initialOffset);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [reduceMotion, setReduceMotion] = useState(false);
  const presentation = getQuickTimerDurationStepperPresentation(durationMinutes);
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

  const clearSettleTimeout = useCallback(() => {
    if (settleTimeoutRef.current === null) return;
    clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = null;
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

  const commitOffset = useCallback((offset: number, withFeedback: boolean) => {
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
    listRef.current?.scrollToOffset({ animated: false, offset: snappedOffset });
    if (withFeedback) emitSelectionFeedback(nextDuration);
    return nextDuration;
  }, [emitSelectionFeedback, publishDuration, wheelLayout.itemHeight]);

  const selectDuration = useCallback((
    nextValue: number,
    animated = !reduceMotion,
  ) => {
    if (busy) return;
    const nextDuration = clampQuickTimerDuration(nextValue);
    const nextOffset = quickTimerDurationToOffset(
      nextDuration,
      wheelLayout.itemHeight,
    );
    clearSettleTimeout();
    offsetRef.current = nextOffset;
    publishDuration(nextDuration);
    emitSelectionFeedback(nextDuration);
    listRef.current?.scrollToOffset({ animated, offset: nextOffset });
  }, [
    busy,
    clearSettleTimeout,
    emitSelectionFeedback,
    publishDuration,
    reduceMotion,
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
      return;
    }
    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;
    const timeout = setTimeout(() => {
      const nextDuration = resolveInitialDuration(initialDurationMinutes);
      durationRef.current = nextDuration;
      committedDurationRef.current = nextDuration;
      setDurationMinutes(nextDuration);
      listRef.current?.scrollToIndex({
        animated: false,
        index: nextDuration - 1,
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialDurationMinutes, visible]);

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => {
      const nextOffset = quickTimerDurationToOffset(
        durationRef.current,
        wheelLayout.itemHeight,
      );
      offsetRef.current = nextOffset;
      listRef.current?.scrollToOffset({ animated: false, offset: nextOffset });
    }, 0);
    return () => clearTimeout(timeout);
  }, [visible, wheelLayout.itemHeight]);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    const timeout = setTimeout(() => {
      const node = findNodeHandle(adjustableRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 180);
    return () => clearTimeout(timeout);
  }, [visible]);

  useEffect(() => clearSettleTimeout, [clearSettleTimeout]);

  const observeScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    offsetRef.current = nextOffset;
    publishDuration(
      quickTimerOffsetToDuration(nextOffset, wheelLayout.itemHeight),
    );
  }, [publishDuration, wheelLayout.itemHeight]);

  const scheduleDragSettle = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    offsetRef.current = event.nativeEvent.contentOffset.y;
    clearSettleTimeout();
    settleTimeoutRef.current = setTimeout(() => {
      settleTimeoutRef.current = null;
      commitOffset(offsetRef.current, true);
    }, SCROLL_SETTLE_DELAY_MS);
  }, [clearSettleTimeout, commitOffset]);

  const handleMomentumEnd = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    clearSettleTimeout();
    commitOffset(event.nativeEvent.contentOffset.y, true);
  }, [clearSettleTimeout, commitOffset]);

  const handleSubmit = useCallback(() => {
    if (busy) return;
    clearSettleTimeout();
    const nextDuration = commitOffset(offsetRef.current, false);
    onSubmit(nextDuration);
  }, [busy, clearSettleTimeout, commitOffset, onSubmit]);

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onCancel}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      visible={visible}>
      <SafeAreaView
        accessibilityViewIsModal
        edges={['top', 'right', 'bottom', 'left']}
        style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerSide} />
          <AppText style={styles.headerTitle} variant="title">
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
            onPress={onCancel}
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

        <View style={styles.content}>
          <AppText tone="secondary" style={styles.centerText} variant="body">
            1분부터 60분까지
          </AppText>
          <View
            ref={adjustableRef}
            accessible
            accessibilityActions={[
              { label: '1분 늘리기', name: 'increment' },
              { label: '1분 줄이기', name: 'decrement' },
            ]}
            accessibilityLabel="타이머 시간"
            accessibilityRole="adjustable"
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
            }}
            style={[
              styles.wheel,
              {
                height: wheelLayout.viewportHeight,
                borderColor: colors.border,
              },
            ]}
            testID="quick-timer-duration-adjustable">
            <FlatList
              ref={listRef}
              accessible={false}
              accessibilityElementsHidden
              bounces={false}
              contentContainerStyle={{ paddingVertical: selectionTop }}
              contentOffset={{ x: 0, y: initialOffset }}
              data={QUICK_TIMER_DURATIONS}
              decelerationRate="fast"
              disableIntervalMomentum
              extraData={durationMinutes}
              getItemLayout={(_, index) => ({
                index,
                length: wheelLayout.itemHeight,
                offset: wheelLayout.itemHeight * index,
              })}
              importantForAccessibility="no-hide-descendants"
              keyExtractor={(item) => item.toString()}
              onMomentumScrollBegin={clearSettleTimeout}
              onMomentumScrollEnd={handleMomentumEnd}
              onScroll={observeScroll}
              onScrollBeginDrag={clearSettleTimeout}
              onScrollEndDrag={scheduleDragSettle}
              overScrollMode="never"
              renderItem={({ item }) => {
                const selected = item === durationMinutes;
                return (
                  <Pressable
                    accessible={false}
                    accessibilityElementsHidden
                    disabled={busy}
                    importantForAccessibility="no-hide-descendants"
                    onPress={() => selectDuration(item)}
                    style={[
                      styles.wheelRow,
                      { height: wheelLayout.itemHeight },
                    ]}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.wheelNumber,
                        {
                          color: selected ? colors.text : colors.textSoft,
                          fontSize: selectedFontSize,
                          lineHeight: wheelLayout.itemHeight - 8,
                        },
                        selected && styles.wheelNumberSelected,
                      ]}>
                      {item}
                      {selected ? (
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.wheelUnit,
                            {
                              color: colors.text,
                              fontSize: neighborFontSize * 0.72,
                            },
                          ]}>
                          {'\u00A0'}분
                        </Text>
                      ) : null}
                    </Text>
                  </Pressable>
                );
              }}
              scrollEnabled={!busy}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={wheelLayout.itemHeight}
              style={styles.wheelList}
              testID="quick-timer-duration-wheel"
            />
            <View
              pointerEvents="none"
              style={[
                styles.selectionFrame,
                {
                  top: selectionTop,
                  height: wheelLayout.itemHeight,
                  borderColor: colors.borderStrong,
                },
              ]}
            />
          </View>
        </View>

        <View
          style={[
            styles.actions,
            stackActions && styles.actionsStacked,
            { borderTopColor: colors.border },
          ]}>
          <Button
            disabled={busy}
            label="취소"
            onPress={onCancel}
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
            disabled={busy}
            icon="play"
            label={replacingTimer ? `${presentation.durationMinutes}분으로 변경` : '시작'}
            loading={busy}
            onPress={handleSubmit}
            style={styles.action}
            testID="quick-timer-stepper-start"
          />
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
    paddingVertical: space.sm,
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
    flex: 1,
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
  },
  wheelList: { flex: 1 },
  wheelRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelNumber: {
    ...typeScale.display,
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
    textAlignVertical: 'center',
  },
  selectionFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionsStacked: { flexDirection: 'column-reverse' },
  action: { flex: 1 },
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
