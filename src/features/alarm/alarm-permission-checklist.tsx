import { Pressable, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/app-icon";
import { AppText } from "@/components/ui-kit";
import { radii, spacing, type AppPalette } from "@/constants/app-theme";
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

  if (!status) {
    return (
      <AppText tone="secondary" variant="caption">
        휴대폰의 알람 권한 상태를 확인하고 있어요.
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
      readyCopy: "제한되어 있지 않아요",
      target: "battery-optimization",
    },
  ];

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const copy = item.ready
          ? (item.readyCopy ?? "허용되어 있어요")
          : "확인이 필요해요";
        const color = item.ready ? palette.mintDark : palette.danger;
        return (
          <Pressable
            accessible
            accessibilityHint={`${item.label}에 해당하는 휴대폰 설정 화면을 열어요.`}
            accessibilityLabel={`${item.label}. ${copy}. 설정 열기`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            key={item.label}
            onPress={() => onOpenSettings(item.target)}
            style={({ pressed }) => [
              styles.row,
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
            <AppText style={styles.label} variant="label">
              {item.label}
            </AppText>
            <AppText color={color} style={styles.value} variant="caption">
              {copy}
            </AppText>
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
    icon: {
      width: 32,
      height: 32,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.small,
    },
    label: {
      minWidth: 0,
      flex: 1,
    },
    value: {
      maxWidth: "42%",
      flexShrink: 1,
      textAlign: "right",
    },
  });
}
