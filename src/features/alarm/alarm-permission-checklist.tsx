import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner } from '@/design-system';
import { shouldReflowControl } from '@/design-system/responsive';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { targetMatchesFocusVisible } from '@/hooks/use-web-focus-visible';
import type {
  AlarmPyoAlarmStatus,
  AlarmPyoPermissionSettingsTarget,
} from '@/services/alarmpyo-alarm-service';

import {
  resolveAlarmPermissionReadinessViewModel,
  type AlarmPermissionLaunchNotice,
  type AlarmPermissionReadinessItem,
  type AlarmPermissionReadinessItemId,
} from './alarm-permission-readiness-model';

export type AlarmPermissionFocusRequest = {
  id: AlarmPermissionReadinessItemId;
  revision: number;
};

export function AlarmPermissionChecklist({
  disabled = false,
  focusRequest = null,
  launchNotice = null,
  onOpenSettings,
  presentation = 'all',
  status,
}: {
  disabled?: boolean;
  focusRequest?: AlarmPermissionFocusRequest | null;
  launchNotice?: AlarmPermissionLaunchNotice | null;
  onOpenSettings: (target: AlarmPyoPermissionSettingsTarget) => void;
  presentation?: 'all' | 'next-required';
  status: AlarmPyoAlarmStatus | null;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const reflow = shouldReflowControl(width, fontScale) || fontScale >= 1.3;
  const [focusedItemId, setFocusedItemId] =
    useState<AlarmPermissionReadinessItemId | null>(null);
  const itemRefs = useRef<
    Partial<Record<AlarmPermissionReadinessItemId, View | null>>
  >({});

  useEffect(() => {
    if (!focusRequest) return undefined;
    const timer = setTimeout(() => {
      const node = findNodeHandle(itemRefs.current[focusRequest.id] ?? null);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    }, 120);
    return () => clearTimeout(timer);
  }, [focusRequest]);

  if (!status) {
    return (
      <View style={styles.container} testID="alarm-readiness">
        <View style={styles.header}>
          <AppText accessibilityRole="header" variant="heading">
            {presentation === 'next-required' ? '다음 권한' : '알람 준비'}
          </AppText>
          <AppText tone="secondary" variant="caption">
            필수 권한 확인 중
          </AppText>
        </View>
        {launchNotice ? (
          <StatusBanner
            announceChanges
            message={launchNotice.message}
            title={launchNotice.title}
            tone={launchNotice.tone}
          />
        ) : null}
      </View>
    );
  }

  const model = resolveAlarmPermissionReadinessViewModel(status);

  const renderItem = (
    item: AlarmPermissionReadinessItem,
    recommended = false,
  ) => {
    const color = disabled
      ? palette.disabledInk
      : item.ready
        ? palette.mintDark
        : recommended
          ? palette.amber
          : palette.danger;
    const copy = (
      <>
        <View style={styles.icon}>
          <AppIcon
            accessible={false}
            color={color}
            name={item.ready ? 'checkmark-circle' : 'alert-circle-outline'}
            size={18}
          />
        </View>
        <View style={styles.copy}>
          <AppText style={styles.label} variant="label">
            {item.label}
          </AppText>
          <AppText color={color} style={styles.value} variant="caption">
            {item.description}
          </AppText>
        </View>
        {item.target ? (
          <AppIcon
            accessible={false}
            color={disabled ? palette.disabledInk : palette.inkMuted}
            name="chevron-forward"
            size={18}
          />
        ) : null}
      </>
    );

    if (!item.target) {
      return (
        <View
          accessible
          accessibilityLabel={`${item.label}. ${item.description}`}
          key={item.id}
          ref={(node) => {
            itemRefs.current[item.id] = node;
          }}
          style={[styles.row, reflow && styles.rowReflow]}>
          {copy}
        </View>
      );
    }

    return (
      <Pressable
        accessible
        accessibilityHint={`${item.label}에 해당하는 휴대폰 설정 화면을 엽니다.`}
        accessibilityLabel={`${item.label}. ${item.description}. 설정 열기`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        key={item.id}
        onBlur={() =>
          setFocusedItemId((current) => (current === item.id ? null : current))
        }
        onFocus={(event) => {
          if (
            Platform.OS === 'web' &&
            targetMatchesFocusVisible(event.currentTarget)
          ) {
            setFocusedItemId(item.id);
          }
        }}
        onPress={() => onOpenSettings(item.target!)}
        ref={(node) => {
          itemRefs.current[item.id] = node;
        }}
        style={({ pressed }) => [
          styles.row,
          reflow && styles.rowReflow,
          pressed && !disabled && styles.rowPressed,
          disabled && styles.rowDisabled,
          focusedItemId === item.id && !disabled && styles.webFocusVisible,
        ]}>
        {copy}
      </Pressable>
    );
  };

  if (presentation === 'next-required') {
    const requestedRequired = focusRequest
      ? model.required.find((item) => item.id === focusRequest.id)
      : null;
    const nextRequired =
      requestedRequired ??
      (model.nextRequiredTarget
        ? model.required.find((item) => item.id === model.nextRequiredTarget)
        : null);
    return (
      <View style={styles.compactContainer} testID="alarm-readiness-next">
        {launchNotice ? (
          <StatusBanner
            announceChanges
            icon={
              launchNotice.tone === 'warning'
                ? 'alert-circle-outline'
                : 'ellipse-outline'
            }
            message={launchNotice.message}
            title={launchNotice.title}
            tone={launchNotice.tone}
          />
        ) : null}
        {nextRequired ? (
          <View style={styles.section}>
            <AppText accessibilityRole="header" variant="label">
              {requestedRequired ? '선택한 권한' : '다음 필요한 권한'}
            </AppText>
            <View style={styles.list}>{renderItem(nextRequired)}</View>
          </View>
        ) : (
          <View
            accessible
            accessibilityLabel={model.summary}
            style={styles.readySummary}>
            <AppIcon
              accessible={false}
              color={palette.mintDark}
              name="checkmark-circle"
              size={20}
            />
            <AppText color={palette.mintDark} variant="label">
              필수 권한 완료
            </AppText>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="alarm-readiness">
      <View style={[styles.header, reflow && styles.headerReflow]}>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" variant="heading">
            권한
          </AppText>
          <AppText tone="secondary" variant="caption">
            필수 {model.readyRequiredCount}/{model.requiredTotal} · 권장 설정 별도
          </AppText>
        </View>
      </View>

      {launchNotice ? (
        <StatusBanner
          announceChanges
          icon={
            launchNotice.tone === 'warning'
              ? 'alert-circle-outline'
              : 'ellipse-outline'
          }
          message={launchNotice.message}
          title={launchNotice.title}
          tone={launchNotice.tone}
        />
      ) : null}

      <View style={styles.section}>
        <AppText accessibilityRole="header" variant="label">
          필수 권한
        </AppText>
        <View style={styles.list}>
          {model.required.map((item) => renderItem(item))}
        </View>
        {model.nextRequiredTarget && model.nextRequiredLabel ? (
          <AppButton
            accessibilityLabel={`다음 설정 열기. ${model.nextRequiredLabel}`}
            icon="settings-outline"
            label="다음 설정 열기"
            disabled={disabled}
            onPress={() => onOpenSettings(model.nextRequiredTarget!)}
            style={styles.fullWidthButton}
            variant="secondary"
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.recommendedHeading}>
          <AppText accessibilityRole="header" variant="label">
            권장 설정
          </AppText>
          <AppText tone="secondary" variant="caption">
            배터리 · 방해 금지 · 음량
          </AppText>
        </View>
        <View style={styles.list}>
          {model.recommended.map((item) => renderItem(item, true))}
        </View>
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    container: {
      gap: spacing.large,
    },
    compactContainer: {
      gap: spacing.medium,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    headerReflow: {
      flexDirection: 'column',
    },
    headerCopy: {
      minWidth: 0,
      flex: 1,
      gap: spacing.tiny,
    },
    section: {
      gap: spacing.small,
    },
    readySummary: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
    },
    recommendedHeading: {
      gap: spacing.tiny,
    },
    list: {
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
      // 웹 키보드 포커스의 2px 외곽선과 간격이 잘리지 않아야 합니다.
      overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
    },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    rowPressed: {
      backgroundColor: palette.disabledSurface,
    },
    rowDisabled: {
      backgroundColor: palette.disabledSurface,
    },
    webFocusVisible:
      Platform.OS === 'web'
        ? {
            outlineColor: palette.focus,
            outlineOffset: 2,
            outlineStyle: 'solid',
            outlineWidth: 2,
          }
        : {},
    rowReflow: {
      alignItems: 'flex-start',
    },
    icon: {
      width: 32,
      height: 32,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.small,
    },
    copy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    label: {
      minWidth: 0,
    },
    value: {
      width: '100%',
    },
    fullWidthButton: {
      width: '100%',
    },
  });
}
