import { Tabs } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarIcon, TabBarLabel } from '@/components/tab-bar-visuals';
import { type AppPalette } from '@/constants/app-theme';
import { shape } from '@/design-system/tokens';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  resolveFloatingTabBarGeometry,
  resolveFloatingTabBarHorizontalLayout,
  resolveFloatingTabBarLayout,
} from '@/utils/floating-tab-bar';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const horizontalLayout = resolveFloatingTabBarHorizontalLayout(windowWidth, 4);
  const tabBarGeometry = resolveFloatingTabBarGeometry(
    windowWidth,
    insets.left,
    insets.right,
    horizontalLayout.outerMargin,
  );
  const effectiveFontScale = Math.min(Math.max(fontScale, 1), 2);
  const tabBarLayout = resolveFloatingTabBarLayout(
    effectiveFontScale,
    insets.bottom,
    Platform.OS === 'web',
  );
  const tabBarItemPadding = effectiveFontScale >= 1.35 ? 4 : 2;
  return (
    <Tabs
      detachInactiveScreens
      // Geometry already accounts for all safe insets; do not apply them again inside each tab.
      safeAreaInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        lazy: true,
        sceneStyle: { backgroundColor: palette.canvas },
        tabBarActiveBackgroundColor: palette.transparent,
        tabBarActiveTintColor: palette.indigoDark,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: palette.inkSoft,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarLabelPosition: 'below-icon',
        tabBarItemStyle: [
          styles.tabBarItem,
          {
            marginHorizontal: horizontalLayout.itemMargin,
            paddingVertical: tabBarItemPadding,
          },
        ],
        tabBarLabel: TabBarLabel,
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: tabBarLayout.bottom,
            height: tabBarLayout.height,
            left: tabBarGeometry.inset,
            start: tabBarGeometry.inset,
            end: 'auto',
            paddingHorizontal: horizontalLayout.horizontalPadding,
            width: tabBarGeometry.width,
          },
        ],
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '오늘',
          tabBarAccessibilityLabel: '오늘',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              activeName="today"
              color={color}
              focused={focused}
              inactiveName="today-outline"
              indicatorColor={palette.focus}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: '달력',
          tabBarAccessibilityLabel: '달력',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              activeName="calendar"
              color={color}
              focused={focused}
              inactiveName="calendar-outline"
              indicatorColor={palette.focus}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="timer"
        options={{
          title: '타이머',
          tabBarAccessibilityLabel: '타이머',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              activeName="timer"
              color={color}
              focused={focused}
              inactiveName="timer-outline"
              indicatorColor={palette.focus}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarAccessibilityLabel: '설정',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              activeName="settings"
              color={color}
              focused={focused}
              inactiveName="settings-outline"
              indicatorColor={palette.focus}
            />
          ),
        }}
      />
    </Tabs>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    tabBar: {
      position: 'absolute',
      height: 68,
      paddingHorizontal: 5,
      paddingVertical: 5,
      borderRadius: shape.panel,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.surface,
    },
    tabBarItem: {
      marginHorizontal: 2,
      marginVertical: 1,
      borderRadius: shape.section,
      overflow: 'hidden',
    },
    tabBarIcon: { marginTop: 1 },
  });
}
