import { Tabs } from 'expo-router';
import {
  type ColorValue,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
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
      safeAreaInsets={{ bottom: 0 }}
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
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              activeName="today"
              color={color}
              focused={focused}
              inactiveName="today-outline"
              palette={palette}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: '달력',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              activeName="calendar"
              color={color}
              focused={focused}
              inactiveName="calendar-outline"
              palette={palette}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="timer"
        options={{
          title: '타이머',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              activeName="timer"
              color={color}
              focused={focused}
              inactiveName="timer-outline"
              palette={palette}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              activeName="settings"
              color={color}
              focused={focused}
              inactiveName="settings-outline"
              palette={palette}
            />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  activeName,
  color,
  focused,
  inactiveName,
  palette,
}: {
  activeName: AppIconName;
  color: ColorValue;
  focused: boolean;
  inactiveName: AppIconName;
  palette: AppPalette;
}) {
  return (
    <View style={tabIconStyles.container}>
      {focused ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[tabIconStyles.indicator, { backgroundColor: palette.focus }]}
        />
      ) : null}
      <AppIcon color={color} name={focused ? activeName : inactiveName} size={22} />
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  container: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 3,
  },
});

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
    tabBarLabel: {
      marginTop: 0,
      marginBottom: 1,
      fontFamily: fontFamily.label,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
