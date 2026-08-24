import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_APP_DIALOG_BUTTONS,
  DEFAULT_APP_DIALOG_OPTIONS,
  type AppDialogButton,
  type AppDialogOptions,
} from '@/components/app-dialog-contract';
import { updateAppDialogPriorityOwners } from '@/components/app-dialog-priority';
import { AppIcon } from '@/components/app-icon';
import {
  resolveAppDialogPresentation,
} from '@/components/app-dialog-tone';
import { AppButton, AppText } from '@/components/ui-kit';
import { colorWithAlpha, type AppPalette } from '@/constants/app-theme';
import { commonCopy } from '@/content/common-copy';
import {
  motion as motionToken,
  radius,
  size,
  space,
} from '@/design-system/tokens';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export type { AppDialogButton, AppDialogOptions } from '@/components/app-dialog-contract';

type AppDialogRequest = {
  title: string;
  message?: string;
  buttons: AppDialogButton[];
  options: AppDialogOptions;
};

type ShowAppDialog = {
  (
    title: string,
    message?: string,
    buttons?: undefined,
    options?: AppDialogOptions,
  ): void;
  (
    title: string,
    message: string | undefined,
    buttons: AppDialogButton[],
    options: AppDialogOptions,
  ): void;
};

type AppDialogContextValue = {
  setPriorityModalVisible: (owner: string, visible: boolean) => void;
  showDialog: ShowAppDialog;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);
const DIALOG_ENTER_DURATION = motionToken.standard;
const DIALOG_EXIT_DURATION = motionToken.fast;
export function AppDialogProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);
  const [priorityModalOwners, setPriorityModalOwners] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const requestRef = useRef<AppDialogRequest | null>(null);

  const showDialog = useCallback(
    (title, message, buttons, options) => {
      const nextRequest: AppDialogRequest = {
        title,
        message,
        buttons: buttons?.length
          ? buttons
          : [...DEFAULT_APP_DIALOG_BUTTONS],
        options: options ?? DEFAULT_APP_DIALOG_OPTIONS,
      };
      requestRef.current = nextRequest;
      setRequest(nextRequest);
    },
    [],
  ) as ShowAppDialog;

  const dismiss = useCallback((target: AppDialogRequest) => {
    if (requestRef.current !== target) return;
    requestRef.current = null;
    setRequest(null);
    target.options.onDismiss?.();
  }, []);

  const choose = useCallback((target: AppDialogRequest, button: AppDialogButton) => {
    if (requestRef.current !== target) return;
    requestRef.current = null;
    setRequest(null);
    button.onPress?.();
  }, []);

  const setPriorityModalVisible = useCallback(
    (owner: string, visible: boolean) => {
      setPriorityModalOwners((current) =>
        updateAppDialogPriorityOwners(current, owner, visible),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({ setPriorityModalVisible, showDialog }),
    [setPriorityModalVisible, showDialog],
  );
  const visibleRequest = priorityModalOwners.size > 0 ? null : request;

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <AppDialogHost request={visibleRequest} dismiss={dismiss} choose={choose} />
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const value = useContext(AppDialogContext);
  if (!value) throw new Error(commonCopy.providerUnavailable.text);
  return value;
}

function AppDialogHost({
  request,
  dismiss,
  choose,
}: {
  request: AppDialogRequest | null;
  dismiss: (target: AppDialogRequest) => void;
  choose: (target: AppDialogRequest, button: AppDialogButton) => void;
}) {
  const { fontScale, height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReduceMotion();
  const [motion] = useState(() => new Animated.Value(0));
  const closing = useRef(false);
  const titleRef = useRef<React.ElementRef<typeof AppText>>(null);
  const dialogRef = useRef<View>(null);
  const previousWebFocusRef = useRef<HTMLElement | null>(null);
  const useNativeDriver = Platform.OS !== 'web';
  const buttons = request?.buttons ?? [];
  const dialogTone = request?.options.tone ?? DEFAULT_APP_DIALOG_OPTIONS.tone;
  const presentation = resolveAppDialogPresentation(dialogTone);
  const tone = palette[presentation.paletteRole];
  const compactHeight = height < 500;
  const stackActions =
    buttons.length > 2 ||
    buttons.some((button) => button.text.length >= 9) ||
    width < 360 ||
    fontScale >= 1.25 ||
    compactHeight;

  useEffect(() => {
    closing.current = false;
    motion.stopAnimation();

    if (!request) {
      motion.setValue(0);
      return;
    }
    if (reduceMotion) {
      motion.setValue(1);
      return;
    }

    motion.setValue(0);
    const animation = Animated.timing(motion, {
      duration: DIALOG_ENTER_DURATION,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      toValue: 1,
      useNativeDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [motion, reduceMotion, request, useNativeDriver]);

  useEffect(() => {
    if (!request || Platform.OS === 'web') return;
    const timeout = setTimeout(() => {
      const node = findNodeHandle(titleRef.current);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    }, reduceMotion ? 0 : DIALOG_ENTER_DURATION);
    return () => clearTimeout(timeout);
  }, [reduceMotion, request]);

  const closeWithAnimation = useCallback(
    (complete: () => void) => {
      if (closing.current) return;
      closing.current = true;
      motion.stopAnimation();

      if (reduceMotion) {
        closing.current = false;
        complete();
        return;
      }

      Animated.timing(motion, {
        duration: DIALOG_EXIT_DURATION,
        easing: Easing.bezier(0.4, 0, 1, 1),
        toValue: 0,
        useNativeDriver,
      }).start(({ finished }) => {
        closing.current = false;
        if (finished) complete();
      });
    },
    [motion, reduceMotion, useNativeDriver],
  );

  useEffect(() => {
    if (!request || Platform.OS !== 'web') return;
    previousWebFocusRef.current = document.activeElement as HTMLElement | null;
    const titleNode = titleRef.current as unknown as HTMLElement | null;
    const focusTitle = setTimeout(() => {
      titleNode?.setAttribute?.('tabindex', '-1');
      titleNode?.focus?.();
    }, reduceMotion ? 0 : DIALOG_ENTER_DURATION);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && request.options.cancelable !== false) {
        event.preventDefault();
        closeWithAnimation(() => dismiss(request));
        return;
      }
      if (event.key !== 'Tab') return;
      const dialogNode = dialogRef.current as unknown as HTMLElement | null;
      const focusable = dialogNode
        ? Array.from(
            dialogNode.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
      if (focusable.length === 0) {
        event.preventDefault();
        titleNode?.focus?.();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === titleNode)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === titleNode)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTitle);
      document.removeEventListener('keydown', handleKeyDown);
      setTimeout(() => previousWebFocusRef.current?.focus?.(), 0);
    };
  }, [closeWithAnimation, dismiss, reduceMotion, request]);

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={() => {
        if (request && request.options.cancelable !== false) {
          closeWithAnimation(() => dismiss(request));
        }
      }}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={request !== null}>
      <Animated.View
        accessibilityViewIsModal
        importantForAccessibility="yes"
        style={[
          styles.overlay,
          {
            backgroundColor: colorWithAlpha(
              palette.shadowColor,
              isDark ? 0.56 : 0.48,
            ),
            opacity: motion,
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}>
        {request?.options.cancelable === false ? null : (
          <Pressable
            accessibilityElementsHidden
            accessibilityLabel={commonCopy.closeDialogLabel.text}
            accessibilityRole="button"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            onPress={() => {
              if (request) closeWithAnimation(() => dismiss(request));
            }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {request ? (
          <Animated.View
            ref={dialogRef}
            accessibilityRole={
              dialogTone === 'danger' || dialogTone === 'warning'
                ? 'alert'
                : undefined
            }
            style={[
              styles.dialog,
              compactHeight && styles.dialogCompactHeight,
              {
                opacity: motion.interpolate({
                  inputRange: [0, 0.35, 1],
                  outputRange: [0, 1, 1],
                }),
                transform: [
                  {
                    translateY: motion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [28, 0],
                    }),
                  },
                  {
                    scale: motion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.99, 1],
                    }),
                  },
                ],
              },
            ]}>
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              style={styles.contentScroll}>
              {!compactHeight && dialogTone !== 'neutral' ? (
                <View style={[styles.icon, { backgroundColor: `${tone}1A` }]}>
                  <AppIcon
                    accessible={false}
                    color={tone}
                    name={presentation.icon}
                    size={26}
                  />
                </View>
              ) : null}
              <View style={styles.copy}>
                <AppText
                  ref={titleRef}
                  accessibilityRole="header"
                  variant="heading"
                  style={styles.title}>
                  {request.title}
                </AppText>
                {request.message ? (
                  <AppText tone="secondary" style={styles.message}>
                    {request.message}
                  </AppText>
                ) : null}
              </View>
              <View style={[styles.actions, stackActions && styles.actionsStacked]}>
                {buttons.map((button, index) => (
                  <AppButton
                    key={`${button.text}-${index}`}
                    actionId={button.actionId}
                    icon={button.icon}
                    label={button.text}
                    onPress={() => closeWithAnimation(() => choose(request, button))}
                    style={stackActions ? styles.stackedAction : styles.action}
                    variant={
                      button.style === 'destructive'
                        ? 'destructive'
                        : button.style === 'cancel'
                          ? 'secondary'
                          : 'primary'
                    }
                  />
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
    },
    dialog: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '88%',
      gap: space.lg,
      padding: space.xl,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.surface,
      shadowColor: palette.shadowColor,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.3,
      shadowRadius: 28,
      elevation: 18,
    },
    dialogCompactHeight: {
      maxHeight: '94%',
      gap: space.md,
      padding: space.lg,
    },
    icon: {
      width: size.minimumTouchTarget,
      height: size.minimumTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    contentScroll: { width: '100%', minHeight: 0, flexShrink: 1 },
    content: { gap: space.lg },
    copy: { gap: space.sm },
    title: { fontSize: 22, lineHeight: 29 },
    message: { lineHeight: 24 },
    actions: {
      flexDirection: 'row',
      gap: space.sm,
    },
    actionsStacked: {
      flexDirection: 'column',
    },
    action: { flex: 1 },
    stackedAction: { width: '100%' },
  });
}
