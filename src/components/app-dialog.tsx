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
  showDialog: ShowAppDialog;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);
const DIALOG_ENTER_DURATION = motionToken.standard;
const DIALOG_EXIT_DURATION = motionToken.fast;
export function AppDialogProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);
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

  const value = useMemo(() => ({ showDialog }), [showDialog]);

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <AppDialogHost request={request} dismiss={dismiss} choose={choose} />
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
  const wide = width >= 600;

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
            accessibilityRole="alert"
            style={[
              styles.dialog,
              wide && styles.dialogWide,
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
            {!compactHeight ? <View style={styles.handle} /> : null}
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              style={styles.contentScroll}>
              {!compactHeight ? (
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
      justifyContent: 'flex-end',
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
    dialogWide: {
      marginBottom: '12%',
    },
    dialogCompactHeight: {
      maxHeight: '94%',
      gap: space.md,
      padding: space.lg,
    },
    handle: {
      width: 38,
      height: 4,
      alignSelf: 'center',
      borderRadius: radius.full,
      backgroundColor: palette.line,
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
