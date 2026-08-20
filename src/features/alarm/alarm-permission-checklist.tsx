import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { AppIcon } from "@/components/app-icon";
import { AppText } from "@/components/ui-kit";
import { radii, spacing, type AppPalette } from "@/constants/app-theme";
import { shouldReflowControl } from "@/design-system/responsive";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type {
  AlarmPyoAlarmStatus,
  AlarmPyoPermissionSettingsTarget,
} from "@/services/alarmpyo-alarm-service";

export function AlarmPermissionChecklist({
  disabled = false,
  onOpenSettings,
  status,
}: {
  disabled?: boolean;
  onOpenSettings: (target: AlarmPyoPermissionSettingsTarget) => void;
  status: AlarmPyoAlarmStatus | null;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale) || fontScale >= 1.3;

  if (!status) {
    return (
      <AppText tone="secondary" variant="caption">
        휴대폰의 알람 권한 상태를 확인하고 있습니다.
      </AppText>
    );
  }

  const items: {
    label: string;
    ready: boolean;
    readyCopy?: string;
    target: AlarmPyoPermissionSettingsTarget;
  }[] = [
    {
      label: "정확한 알람",
      ready: status.exactAlarmAllowed,
      target: "exact-alarm",
    },
    {
      label: "전체 화면 알람",
      ready: status.fullScreenAllowed,
      target: "full-screen",
    },
    {
      label: "알림",
      ready: status.notificationsAllowed,
      target: "alarm-notifications",
    },
    {
      label: "배터리 사용 제한",
      ready: status.batteryOptimizationIgnored,
      readyCopy: "제한되어 있지 않습니다",
      target: "battery-optimization",
    },
  ];

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const copy = item.ready
          ? (item.readyCopy ?? "허용되어 있습니다")
          : "확인이 필요합니다";
        const color = item.ready ? palette.mintDark : palette.danger;
        return (
          <Pressable
            accessible
            accessibilityHint={`${item.label}에 해당하는 휴대폰 설정 화면을 엽니다.`}
            accessibilityLabel={`${item.label}. ${copy}. 설정 열기`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            key={item.label}
            onPress={() => onOpenSettings(item.target)}
            style={({ pressed }) => [
              styles.row,
              reflow && styles.rowReflow,
              pressed && !disabled && styles.rowPressed,
            ]}
          >
            <View
              style={[
                styles.icon,
                {
                  backgroundColor: item.ready
                    ? palette.mintSoft
                    : palette.dangerSoft,
                },
              ]}
            >
              <AppIcon
                accessible={false}
                color={color}
                name={
                  item.ready
                    ? "checkmark-circle"
                    : "alert-circle-outline"
                }
                size={18}
              />
            </View>
            <View style={[styles.copy, reflow && styles.copyReflow]}>
              <AppText style={styles.label} variant="label">
                {item.label}
              </AppText>
              <AppText
                color={color}
                style={[styles.value, reflow && styles.valueReflow]}
                variant="caption">
                {copy}
              </AppText>
            </View>
            <AppIcon
              accessible={false}
              color={palette.inkMuted}
              name="chevron-forward"
              size={18}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    list: {
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
      overflow: "hidden",
    },
    row: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    rowPressed: {
      backgroundColor: palette.disabledSurface,
    },
    rowReflow: {
      alignItems: "flex-start",
    },
    icon: {
      width: 32,
      height: 32,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.small,
    },
    copy: {
      minWidth: 0,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.small,
    },
    copyReflow: {
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 2,
    },
    label: {
      minWidth: 0,
    },
    value: {
      flexShrink: 1,
    },
    valueReflow: {
      width: "100%",
    },
  });
}
