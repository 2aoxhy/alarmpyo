import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type Text,
  useWindowDimensions,
  View,
} from 'react-native';

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
  adjustQuickTimerDuration,
  getQuickTimerDurationStepperPresentation,
  QUICK_TIMER_CUSTOM_INITIAL_DURATION,
  type QuickTimerDurationAdjustment,
} from './quick-timer-model';

const ADJUSTMENTS: readonly QuickTimerDurationAdjustment[] = [-10, -1, 1, 10];

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
  const { fontScale, width } = useWindowDimensions();
  const closeFocus = useWebFocusVisible();
  const valueRef = useRef<Text | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(
    getQuickTimerDurationStepperPresentation(initialDurationMinutes ?? 0)
      .durationMinutes,
  );
  const presentation = getQuickTimerDurationStepperPresentation(durationMinutes);
  const stackActions = width < 360 || fontScale >= 1.4;

  useEffect(() => {
    if (!visible) return;
    if (Platform.OS === 'web') return;
    const timeout = setTimeout(() => {
      const node = findNodeHandle(valueRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 180);
    return () => clearTimeout(timeout);
  }, [visible]);

  const adjust = (amount: QuickTimerDurationAdjustment) => {
    void triggerSelectionFeedback();
    setDurationMinutes((current) => adjustQuickTimerDuration(current, amount));
  };

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

        <ScrollView
          contentContainerStyle={styles.content}
          style={styles.contentScroll}>
          <View style={styles.intro}>
            <AppText tone="secondary" style={styles.centerText} variant="body">
              1분부터 60분까지
            </AppText>
            <View
              accessible
              accessibilityActions={[
                { label: '1분 늘리기', name: 'increment' },
                { label: '1분 줄이기', name: 'decrement' },
              ]}
              accessibilityLabel="타이머 시간"
              accessibilityRole="adjustable"
              accessibilityValue={{
                max: 60,
                min: 1,
                now: presentation.durationMinutes,
                text: presentation.accessibilityLabel,
              }}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'increment') adjust(1);
                if (event.nativeEvent.actionName === 'decrement') adjust(-1);
              }}
              style={[styles.valueSurface, { borderColor: colors.border }]}
              testID="quick-timer-duration-adjustable">
              <AppText
                ref={valueRef}
                maxFontSizeMultiplier={2}
                style={styles.value}
                variant="display">
                {presentation.durationMinutes}
              </AppText>
              <AppText maxFontSizeMultiplier={2} style={styles.unit} variant="title">
                분
              </AppText>
            </View>
          </View>

          <View style={styles.adjustmentGrid}>
            {ADJUSTMENTS.map((amount) => {
              const decrease = amount < 0;
              const disabled = busy ||
                (decrease ? !presentation.canDecrease : !presentation.canIncrease);
              const label = amount > 0 ? `+${amount}` : `${amount}`;
              return (
                <Button
                  accessibilityHint={`현재 시간에서 ${Math.abs(amount)}분 ${decrease ? '줄입니다.' : '늘립니다.'}`}
                  accessibilityLabel={`${Math.abs(amount)}분 ${decrease ? '줄이기' : '늘리기'}`}
                  disabled={disabled}
                  key={amount}
                  label={label}
                  onPress={() => adjust(amount)}
                  style={styles.adjustmentButton}
                  testID={`quick-timer-adjust-${amount}`}
                  variant="secondary"
                />
              );
            })}
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
            onPress={() => onSubmit(presentation.durationMinutes)}
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
  contentScroll: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: space.xxl,
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  intro: { alignItems: 'center', gap: space.lg },
  centerText: { textAlign: 'center' },
  valueSurface: {
    minWidth: 190,
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  value: {
    ...typeScale.display,
    fontSize: 64,
    lineHeight: 76,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  unit: { marginLeft: space.sm },
  adjustmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  adjustmentButton: { minHeight: 60, flexBasis: '47%', flexGrow: 1 },
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
