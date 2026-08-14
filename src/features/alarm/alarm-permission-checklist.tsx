import { StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/app-icon";
import { AppText } from "@/components/ui-kit";
import { radii, spacing, type AppPalette } from "@/constants/app-theme";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { AlarmPyoAlarmStatus } from "@/services/alarmpyo-alarm-service";

export function AlarmPermissionChecklist({
  status,
}: {
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

  const items = [
    { label: "정확한 알람", ready: status.exactAlarmAllowed },
    { label: "전체 화면 알람", ready: status.fullScreenAllowed },
    { label: "알림", ready: status.notificationsAllowed },
    {
      label: "배터리 사용 제한",
      ready: status.batteryOptimizationIgnored,
      readyCopy: "제한되어 있지 않아요",
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
          <View
            accessible
            accessibilityLabel={`${item.label}. ${copy}`}
            key={item.label}
            style={styles.row}
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
          </View>
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
      maxWidth: "46%",
      flexShrink: 1,
      textAlign: "right",
    },
  });
}
