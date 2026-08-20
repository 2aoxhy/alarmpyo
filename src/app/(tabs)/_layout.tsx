import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import {
  colorWithAlpha,
  shadow,
  type AppPalette,
} from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
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
  const { isDark, palette } = useAppTheme();
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
  const floatingTabShadow: ViewStyle =
    Platform.OS === 'web'
      ? {
          boxShadow: `0 ${isDark ? 10 : 9}px ${isDark ? 32 : 28}px ${colorWithAlpha(
            palette.shadowColor,
            isDark ? 0.34 : 0.12,
          )}`,
        }
      : {
          ...shadow,
          shadowColor: palette.shadowColor,
          shadowOpacity: isDark ? 0.24 : shadow.shadowOpacity,
        };

  return (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        lazy: true,
        sceneStyle: { backgroundColor: palette.canvas },
        tabBarActiveBackgroundColor: palette.indigo,
        tabBarActiveTintColor: palette.white,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: palette.inkSoft,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarItemStyle: [
          styles.tabBarItem,
          {
            marginHorizontal: horizontalLayout.itemMargin,
            paddingVertical: tabBarItemPadding,
          },
        ],
        tabBarLabel: ({ children, color }) => (
          <Text
            maxFontSizeMultiplier={2}
            numberOfLines={1}
            style={[styles.tabBarLabel, { color }]}>
            {children}
          </Text>
        ),
        tabBarStyle: [
          styles.tabBar,
          floatingTabShadow,
          {
            bottom: tabBarLayout.bottom,
            height: tabBarLayout.height,
            left: tabBarGeometry.left,
            paddingHorizontal: horizontalLayout.horizontalPadding,
            // React Navigation의 웹 기본값(right: 0)을 남기면 width/left와
            // 과도하게 제약되어 RTL·일부 웹 레이아웃에서 한쪽으로 밀립니다.
            // 같은 inset을 양쪽에 명시해 화면 중심축을 기준으로 고정합니다.
            right: tabBarGeometry.right,
            width: tabBarGeometry.width,
          },
        ],
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '오늘',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon color={color} name={focused ? 'today' : 'today-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: '달력',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon color={color} name={focused ? 'calendar' : 'calendar-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="timer"
        options={{
          title: '타이머',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon color={color} name={focused ? 'timer' : 'timer-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon color={color} name={focused ? 'settings' : 'settings-outline'} size={22} />
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
      borderRadius: 22,
      borderTopWidth: 0,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.surface,
    },
    tabBarItem: {
      marginHorizontal: 2,
      marginVertical: 1,
      borderRadius: 16,
      overflow: 'hidden',
    },
    tabBarIcon: { marginTop: 1 },
    tabBarLabel: {
      marginTop: 0,
      marginBottom: 1,
      fontFamily: fontFamily.label,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
