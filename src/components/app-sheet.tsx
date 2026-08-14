import type { PropsWithChildren, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
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

import { AppButton, AppText } from '@/components/ui-kit';
import { colorWithAlpha, type AppPalette } from '@/constants/app-theme';
import { radius, space } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';

type FocusTarget = React.ElementRef<typeof Pressable>;

type AppSheetProps = PropsWithChildren<{
  onClose: () => void;
  returnFocusRef?: RefObject<FocusTarget | null>;
  title: string;
  visible: boolean;
}>;

const WEB_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 화면 높이를 바꾸지 않는 공통 하단 시트예요.
 * 웹에서는 Tab 포커스를 시트 안에 가두고, 닫은 뒤 열었던 조작으로 돌려보내요.
 */
export function AppSheet({
  children,
  onClose,
  returnFocusRef,
  title,
  visible,
}: AppSheetProps) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const sheetRef = useRef<View>(null);
  const titleRef = useRef<React.ElementRef<typeof AppText>>(null);
  const previousWebFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const wide = width >= 600;
  const compactHeight = height < 520;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const returnFocusTarget = returnFocusRef?.current ?? null;

    if (Platform.OS === 'web') {
      previousWebFocusRef.current = document.activeElement as HTMLElement | null;
      let titleNode: HTMLElement | null = null;
      const focusTitle = setTimeout(() => {
        // React Native Web의 ref는 실제 DOM 노드를 가리켜요. findNodeHandle은
        // 웹에서 지원되지 않아 시트를 여는 즉시 오류가 나므로 직접 사용해요.
        titleNode = titleRef.current as unknown as HTMLElement | null;
        titleNode?.setAttribute?.('tabindex', '-1');
        titleNode?.focus?.();
      }, 0);
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCloseRef.current();
          return;
        }
        if (event.key !== 'Tab') return;

        const sheetNode = sheetRef.current as unknown as HTMLElement | null;
        const focusable = sheetNode
          ? Array.from(sheetNode.querySelectorAll<HTMLElement>(WEB_FOCUSABLE_SELECTOR))
          : [];
        if (focusable.length === 0) {
          event.preventDefault();
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
    }

    const focusTitle = setTimeout(() => {
      const node = findNodeHandle(titleRef.current);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    }, 0);
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
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}>
      <View
        accessibilityViewIsModal
        style={[
          styles.overlay,
          {
            backgroundColor: colorWithAlpha(
              palette.shadowColor,
              isDark ? 0.62 : 0.5,
            ),
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}>
        <Pressable
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          ref={sheetRef}
          style={[
            styles.sheet,
            wide && styles.sheetWide,
            compactHeight && styles.sheetCompact,
          ]}>
          <View style={styles.handle} />
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator>
            <AppText
              ref={titleRef}
              accessibilityRole="header"
              style={styles.title}
              variant="heading">
              {title}
            </AppText>
            {children}
          </ScrollView>
          <AppButton label="닫기" onPress={onClose} variant="secondary" />
        </View>
      </View>
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
    sheet: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '86%',
      gap: space.md,
      padding: space.lg,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radius.xl,
      backgroundColor: palette.surface,
      shadowColor: palette.shadowColor,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.3,
      shadowRadius: 28,
      elevation: 18,
    },
    sheetWide: { marginBottom: '10%' },
    sheetCompact: { maxHeight: '94%' },
    handle: {
      width: 38,
      height: 4,
      alignSelf: 'center',
      borderRadius: radius.full,
      backgroundColor: palette.line,
    },
    content: { gap: space.md, paddingBottom: space.sm },
    title: { textAlign: 'center' },
  });
}
