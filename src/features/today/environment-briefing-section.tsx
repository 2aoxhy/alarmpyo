import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { Sheet } from '@/design-system';
import {
  AirQualityIcon,
  resolveAirQualityVisual,
} from '@/features/environment/air-quality-visual';
import {
  buildEnvironmentBriefingViewModel,
  type EnvironmentBriefingTarget,
  useEnvironmentBriefingController,
} from '@/features/environment';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';

import {
  MANUAL_ENVIRONMENT_REGIONS,
  resolveEnvironmentBriefingLayout,
} from './environment-briefing-model';

type EnvironmentBriefingSectionProps = Readonly<{
  enabled: boolean;
  now: Date;
  target: EnvironmentBriefingTarget;
}>;

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFailureCopy(failure: ReturnType<typeof useEnvironmentBriefingController>['failure']) {
  switch (failure) {
    case 'location-outside-korea':
      return '현재 위치는 국내 기상 격자로 확인할 수 없습니다. 지역을 직접 선택할 수 있습니다.';
    case 'location-permission-denied':
      return '위치 권한 없이도 지역을 직접 선택해 날씨와 공기를 확인할 수 있습니다.';
    case 'location-unavailable':
      return '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도하거나 지역을 선택할 수 있습니다.';
    case 'not-configured':
      return '환경 정보 서버 연결을 준비하고 있습니다.';
    case 'provider-unavailable':
      return '기상청 또는 에어코리아 정보를 잠시 불러오지 못했습니다.';
    case 'storage':
      return '기기에서 환경 설정을 저장하지 못했습니다.';
    case 'network':
      return '네트워크 연결을 확인한 뒤 다시 시도해야 합니다.';
    default:
      return '현재 환경 정보를 불러올 수 없습니다.';
  }
}

function getRecoveryAction(
  controller: ReturnType<typeof useEnvironmentBriefingController>,
): {
  label: string;
  onPress: () => Promise<void>;
} | null {
  if (controller.failure === 'location-permission-denied') {
    return {
      label: '현재 위치 다시 사용',
      onPress: () => controller.requestAutomaticLocation(),
    };
  }
  if (controller.failure === 'location-unavailable') {
    return {
      label: '현재 위치 다시 확인',
      onPress: () => controller.requestAutomaticLocation(),
    };
  }
  if (controller.failure === 'not-configured') {
    return null;
  }
  return {
    label: '다시 확인',
    onPress: () => controller.refresh(),
  };
}

export function EnvironmentBriefingSection({
  enabled,
  now,
  target,
}: EnvironmentBriefingSectionProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const { stackActions, regionColumns } = resolveEnvironmentBriefingLayout(
    width,
    fontScale,
  );
  const [regionSheetVisible, setRegionSheetVisible] = useState(false);
  const controller = useEnvironmentBriefingController({ enabled });
  const presentation = useMemo(
    () =>
      controller.payload
        ? buildEnvironmentBriefingViewModel(controller.payload, { now, target })
        : null,
    [controller.payload, now, target],
  );
  const updatedAt = formatUpdatedAt(controller.updatedAt);
  const firstUse =
    !controller.enabled &&
    controller.payload === null &&
    controller.status === 'permission-required' &&
    controller.failure === null;
  const recoveryAction = getRecoveryAction(controller);
  const airVisual = presentation?.airQuality
    ? resolveAirQualityVisual(presentation.airQuality.grade)
    : null;
  const airColor =
    airVisual?.tone === 'info'
      ? palette.blue
      : airVisual?.tone === 'success'
        ? palette.mint
        : airVisual?.tone === 'warning'
          ? palette.amber
          : airVisual?.tone === 'danger'
            ? palette.danger
            : palette.inkSoft;

  return (
    <>
      <Card style={styles.card} testID="environment-briefing-card">
        <View style={styles.header}>
          <Pressable
            accessibilityHint="위치 사용 방식이나 지역을 변경합니다."
            accessibilityLabel={`날씨·공기 지역 설정. ${controller.regionName ?? '설정 안 됨'}`}
            accessibilityRole="button"
            onPress={() => setRegionSheetVisible(true)}
            style={({ pressed }) => [
              styles.titleGroup,
              pressed && styles.pressed,
            ]}>
            <View style={styles.weatherIcon}>
              <AppIcon
                accessible={false}
                color={palette.blue}
                name="shift-day"
                size={22}
              />
            </View>
            <View style={styles.titleCopy}>
              <AppText accessibilityRole="header" variant="label">
                출퇴근 날씨·공기
              </AppText>
              <AppText tone="tertiary" variant="caption">
                {controller.regionName ?? '내 지역'}
              </AppText>
            </View>
          </Pressable>
          {controller.enabled ? (
            <Pressable
              accessibilityLabel="환경 정보 새로고침"
              accessibilityRole="button"
              accessibilityState={{
                busy: controller.isRefreshing,
                disabled: !controller.canRefresh || controller.isRefreshing,
              }}
              disabled={!controller.canRefresh || controller.isRefreshing}
              hitSlop={8}
              onPress={() => void controller.refresh()}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.pressed,
                (!controller.canRefresh || controller.isRefreshing) &&
                  styles.iconButtonDisabled,
              ]}>
              {controller.isRefreshing ? (
                <ActivityIndicator color={palette.blue} size="small" />
              ) : (
                <AppIcon
                  accessible={false}
                  color={palette.blue}
                  name="refresh-outline"
                  size={20}
                />
              )}
            </Pressable>
          ) : null}
        </View>

        {firstUse ? (
          <View style={styles.content}>
            <AppText style={styles.lead} variant="heading">
              출근 전에 날씨와 공기를 미리 확인할 수 있습니다.
            </AppText>
            <AppText tone="secondary">
              현재 위치는 기기에서 5km 기상 격자로 바꾸고 서버에는 격자만
              보냅니다. 원 좌표와 근무표는 저장하거나 전송하지 않습니다.
            </AppText>
            <View style={[styles.actions, stackActions && styles.actionsStacked]}>
              <AppButton
                label="현재 위치 사용"
                loading={controller.isRefreshing}
                onPress={() => void controller.requestAutomaticLocation()}
                style={styles.action}
              />
              <AppButton
                label="지역 직접 선택"
                onPress={() => setRegionSheetVisible(true)}
                style={styles.action}
                variant="secondary"
              />
            </View>
          </View>
        ) : presentation?.weather || presentation?.airQuality ? (
          <View
            accessibilityLabel={[
              presentation.weather?.line,
              presentation.airQuality?.line,
              presentation.airQuality?.detailLine,
              presentation.airQuality
                ? `${presentation.airQuality.stationName} 측정소`
                : null,
              controller.status === 'stale' ? '저장된 정보' : null,
            ]
              .filter(Boolean)
              .join('. ')}
            accessible
            style={styles.content}>
            {presentation.weather ? (
              <AppText style={styles.weatherLine} variant="heading">
                {presentation.weather.line}
              </AppText>
            ) : (
              <AppText tone="secondary">날씨 정보가 잠시 제공되지 않습니다.</AppText>
            )}
            {presentation.airQuality ? (
              <View style={styles.airRow}>
                <View
                  style={[
                    styles.airIcon,
                    { borderColor: airColor, backgroundColor: `${airColor}1F` },
                  ]}>
                  <AirQualityIcon
                    color={airColor}
                    grade={presentation.airQuality.grade}
                    size={25}
                  />
                </View>
                <View style={styles.airCopy}>
                  <AppText color={airColor} variant="label">
                    {presentation.airQuality.line}
                  </AppText>
                  <AppText tone="tertiary" variant="caption">
                    {presentation.airQuality.detailLine
                      ? `${presentation.airQuality.detailLine} · `
                      : ''}
                    {presentation.airQuality.stationName} 측정소
                  </AppText>
                </View>
              </View>
            ) : (
              <AppText tone="secondary">공기질 실측 정보가 잠시 제공되지 않습니다.</AppText>
            )}
            {controller.status === 'stale' || controller.failure ? (
              <AppText color={palette.amber} variant="caption">
                {controller.status === 'stale'
                  ? controller.failure
                    ? `저장된 정보입니다. ${getFailureCopy(controller.failure)}`
                    : '저장된 정보이며 새 정보를 확인하고 있습니다.'
                  : getFailureCopy(controller.failure)}
              </AppText>
            ) : null}
            {controller.failure === 'location-permission-denied' ? (
              <View style={[styles.actions, stackActions && styles.actionsStacked]}>
                <AppButton
                  label="현재 위치 다시 사용"
                  loading={controller.isRefreshing}
                  onPress={() => void controller.requestAutomaticLocation()}
                  style={styles.action}
                />
                <AppButton
                  label="지역 변경"
                  onPress={() => setRegionSheetVisible(true)}
                  style={styles.action}
                  variant="secondary"
                />
              </View>
            ) : null}
            <AppText tone="tertiary" variant="caption">
              {presentation.attribution}
              {updatedAt ? ` · ${updatedAt} 업데이트` : ''}
            </AppText>
          </View>
        ) : controller.status === 'loading' || controller.isRefreshing ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.blue} size="small" />
            <AppText tone="secondary">날씨와 공기를 확인하고 있습니다.</AppText>
          </View>
        ) : (
          <View style={styles.content}>
            <AppText tone="secondary">{getFailureCopy(controller.failure)}</AppText>
            <View style={[styles.actions, stackActions && styles.actionsStacked]}>
              {recoveryAction ? (
                <AppButton
                  disabled={controller.failure === 'not-configured'}
                  label={recoveryAction.label}
                  onPress={() => void recoveryAction.onPress()}
                  style={styles.action}
                />
              ) : null}
              <AppButton
                label={
                  controller.failure === 'location-permission-denied'
                    ? '지역 직접 선택'
                    : '지역 선택'
                }
                onPress={() => setRegionSheetVisible(true)}
                style={styles.action}
                variant="secondary"
              />
            </View>
          </View>
        )}
      </Card>

      <Sheet
        onClose={() => setRegionSheetVisible(false)}
        title="날씨·공기 지역 설정"
        visible={regionSheetVisible}>
        <AppText tone="secondary">
          위치 권한 없이 선택한 대표 지역의 기상청 날씨와 에어코리아 실측값을
          사용합니다.
        </AppText>
        <View style={[styles.actions, stackActions && styles.actionsStacked]}>
          <AppButton
            label="현재 위치 자동 설정"
            loading={controller.isRefreshing}
            onPress={() => {
              setRegionSheetVisible(false);
              void controller.requestAutomaticLocation();
            }}
            style={styles.action}
          />
          {controller.enabled ? (
            <AppButton
              label="환경 브리핑 끄기"
              onPress={() => {
                setRegionSheetVisible(false);
                void controller.disable();
              }}
              style={styles.action}
              variant="danger"
            />
          ) : null}
        </View>
        <View
          style={[
            styles.regionList,
            regionColumns === 2 && styles.regionListTwoColumns,
          ]}>
          {MANUAL_ENVIRONMENT_REGIONS.map((region) => {
            const selected =
              controller.mode === 'manual' &&
              controller.regionName === region.regionName;
            return (
              <Pressable
                key={region.regionName}
                accessibilityLabel={region.regionName}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setRegionSheetVisible(false);
                  void controller.selectManualRegion(region);
                }}
                style={({ pressed }) => [
                  styles.regionRow,
                  regionColumns === 2 && styles.regionRowTwoColumns,
                  selected && styles.regionRowSelected,
                  pressed && styles.pressed,
                ]}>
                <AppText variant="label">{region.regionName}</AppText>
                {selected ? (
                  <AppIcon
                    accessible={false}
                    color={palette.mint}
                    name="checkmark"
                    size={20}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    card: {
      gap: spacing.large,
      borderRadius: 22,
    },
    header: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    titleGroup: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    titleCopy: { minWidth: 0, flex: 1, gap: 2 },
    weatherIcon: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: palette.blueSoft,
    },
    iconButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: palette.surfaceSoft,
    },
    iconButtonDisabled: { backgroundColor: palette.disabledSurface },
    content: { gap: spacing.medium },
    lead: { fontSize: 20, lineHeight: 27 },
    weatherLine: { fontSize: 21, lineHeight: 29 },
    airRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    airIcon: {
      width: 42,
      height: 42,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 14,
    },
    airCopy: { minWidth: 0, flex: 1, gap: 2 },
    actions: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.small,
    },
    actionsStacked: { flexDirection: 'column' },
    action: { flex: 1 },
    loadingRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    regionList: { gap: spacing.small },
    regionListTwoColumns: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    regionRow: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
      paddingHorizontal: spacing.large,
      paddingVertical: spacing.medium,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 16,
      backgroundColor: palette.surfaceSoft,
    },
    regionRowTwoColumns: { width: '48%' },
    regionRowSelected: {
      borderColor: palette.mint,
      backgroundColor: palette.mintSoft,
    },
    pressed: { transform: [{ scale: 0.985 }] },
  });
