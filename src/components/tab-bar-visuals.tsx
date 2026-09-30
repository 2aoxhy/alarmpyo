import { type ColorValue, StyleSheet, Text, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { fontFamily } from '../constants/typography';

/** The navigation button owns the accessible label and selected state. */
export function TabBarLabel({ children, color }: { children: string; color: ColorValue }) {
  return (
    <Text
      accessible={false}
      adjustsFontSizeToFit
      maxFontSizeMultiplier={2}
      minimumFontScale={0.8}
      numberOfLines={1}
      style={[styles.label, { color }]}>
      {children}
    </Text>
  );
}

export function TabBarIcon({
  activeName,
  color,
  focused,
  inactiveName,
  indicatorColor,
}: {
  activeName: AppIconName;
  color: ColorValue;
  focused: boolean;
  inactiveName: AppIconName;
  indicatorColor: ColorValue;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.iconContainer}>
      {focused ? <View style={[styles.indicator, { backgroundColor: indicatorColor }]} /> : null}
      <AppIcon accessible={false} color={color} name={focused ? activeName : inactiveName} size={22} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    // Measure against the whole button, never against the icon's intrinsic width.
    alignSelf: 'stretch',
    width: '100%',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 1,
    fontFamily: fontFamily.label,
    fontSize: 12,
    lineHeight: 17,
  },
  iconContainer: {
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
