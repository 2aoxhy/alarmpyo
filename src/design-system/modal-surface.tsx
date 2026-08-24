import type { PropsWithChildren, RefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWebFocusVisible } from '@/hooks/use-web-focus-visible';

import { Heading } from './heading';
import { radius, space } from './tokens';
import { useDesignSystemTheme } from './theme';

type FocusTarget = React.ElementRef<typeof Pressable>;

const WEB_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const webModalStack: symbol[] = [];

export type ModalSurfaceProps = PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  returnFocusRef?: RefObject<FocusTarget | null>;
  cancelable?: boolean;
  alert?: boolean;
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/** 중앙 팝업의 포커스·뒤로가기·배경 숨김 계약을 한곳에서 관리합니다. */
export function ModalSurface({
  visible,
  title,
  onClose,
  returnFocusRef,
  cancelable = true,
  alert = false,
  footer,
  children,
  contentStyle,
  testID,
}: ModalSurfaceProps) {
  const { colors } = useDesignSystemTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const surfaceRef = useRef<View>(null);
  const titleRef = useRef<FocusTarget>(null);
  const previousWebFocusRef = useRef<HTMLElement | null>(null);
  const modalTokenRef = useRef(Symbol('modal-surface'));
  const onCloseRef = useRef(onClose);
  const cancelableRef = useRef(cancelable);
  const titleFocus = useWebFocusVisible();
  const horizontalGuard = Math.max(insets.left, insets.right, space.lg);
  const verticalGuard = Math.max(insets.top, insets.bottom, space.lg);

  useEffect(() => {
    onCloseRef.current = onClose;
    cancelableRef.current = cancelable;
  }, [cancelable, onClose]);

  useEffect(() => {
    if (!visible) return;
    const returnFocusTarget = returnFocusRef?.current ?? null;

    if (Platform.OS === 'web') {
      const modalToken = modalTokenRef.current;
      webModalStack.push(modalToken);
      const isTopModal = () =>
        webModalStack[webModalStack.length - 1] === modalToken;
      previousWebFocusRef.current = document.activeElement as HTMLElement | null;
      let titleNode: HTMLElement | null = null;
      const focusTitle = setTimeout(() => {
        if (!isTopModal()) return;
        titleNode = titleRef.current as unknown as HTMLElement | null;
        titleNode?.setAttribute?.('tabindex', '-1');
        titleNode?.focus?.();
      }, 0);
      const handleKeyDown = (event: KeyboardEvent) => {
        if (!isTopModal()) return;
        if (event.key === 'Escape' && cancelableRef.current) {
          event.preventDefault();
          onCloseRef.current();
          return;
        }
        if (event.key !== 'Tab') return;
        const surfaceNode = surfaceRef.current as unknown as HTMLElement | null;
        const focusable = surfaceNode
          ? Array.from(surfaceNode.querySelectorAll<HTMLElement>(WEB_FOCUSABLE_SELECTOR))
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
        const wasTopModal = isTopModal();
        const stackIndex = webModalStack.lastIndexOf(modalToken);
        if (stackIndex >= 0) webModalStack.splice(stackIndex, 1);
        clearTimeout(focusTitle);
        document.removeEventListener('keydown', handleKeyDown);
        if (wasTopModal) {
          setTimeout(() => previousWebFocusRef.current?.focus?.(), 0);
        }
      };
    }

    const focusTitle = setTimeout(() => {
      const node = findNodeHandle(titleRef.current);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    }, 80);
    return () => {
      clearTimeout(focusTitle);
      setTimeout(() => {
        const node = findNodeHandle(returnFocusTarget);
        if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
      }, 0);
    };
  }, [returnFocusRef, visible]);

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={() => {
        if (cancelable) onClose();
      }}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.overlay,
          {
            paddingBottom: verticalGuard,
            paddingHorizontal: horizontalGuard,
            paddingTop: verticalGuard,
          },
        ]}>
        {cancelable ? (
          <Pressable
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          ref={surfaceRef}
          accessibilityRole={alert ? 'alert' : undefined}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[
            styles.surface,
            {
              maxHeight: Math.max(160, height - verticalGuard * 2),
              width: Math.min(520, Math.max(0, width - horizontalGuard * 2)),
            },
          ]}
          testID={testID}>
          <ScrollView
            bounces={false}
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={height < 560}>
            <Pressable
              ref={titleRef}
              accessibilityRole="header"
              onBlur={titleFocus.onBlur}
              onFocus={titleFocus.onFocus}
              style={[
                styles.titleTarget,
                titleFocus.focusVisible && styles.focusVisible,
              ]}>
              <Heading align="center" level={2}>
                {title}
              </Heading>
            </Pressable>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useDesignSystemTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
      zIndex: 10_000,
      elevation: 48,
    },
    surface: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.42,
      shadowRadius: 34,
      elevation: 48,
    },
    content: {
      gap: space.lg,
      padding: space.xl,
    },
    titleTarget: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    focusVisible:
      Platform.OS === 'web'
        ? {
            outlineColor: colors.focus,
            outlineOffset: 2,
            outlineStyle: 'solid',
            outlineWidth: 2,
          }
        : {},
    footer: {
      gap: space.sm,
      paddingHorizontal: space.xl,
      paddingBottom: space.xl,
    },
  });
}
