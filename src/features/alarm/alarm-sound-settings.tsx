import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  getAlarmSound,
  isAlarmSoundSelectionSupported,
  previewAlarmSound,
  resetAlarmSound,
  selectAlarmSound,
  stopAlarmSoundPreview,
  type AlarmSoundStatus,
} from '@/services/alarm-sound-service';
import {
  getAlarmSoundFallbackMessage,
  shouldStackAlarmSoundActions,
} from './alarm-sound-settings-model';

const PREVIEW_DURATION_MS = 10_000;
const PREVIEW_UI_TOLERANCE_MS = 100;

type BusyAction = 'preview' | 'reset' | 'select' | null;

export function AlarmSoundSettings() {
  const { showDialog } = useAppDialog();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackActions = shouldStackAlarmSoundActions(width, fontScale);
  const supported =
    Platform.OS === 'android' && isAlarmSoundSelectionSupported();
  const [status, setStatus] = useState<AlarmSoundStatus | null>(null);
  const [loading, setLoading] = useState(supported);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [previewing, setPreviewing] = useState(false);
  const activeRef = useRef(false);
  const requestRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }, []);

  const loadStatus = useCallback(async () => {
    if (!supported) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    try {
      const nextStatus = await getAlarmSound();
      if (!activeRef.current || request !== requestRef.current) return;
      setStatus(nextStatus);
      setLoadFailed(false);
      setPreviewing(false);
    } catch {
      if (!activeRef.current || request !== requestRef.current) return;
      setLoadFailed(true);
      setPreviewing(false);
    } finally {
      if (activeRef.current && request === requestRef.current) setLoading(false);
    }
  }, [supported]);

  useFocusEffect(
    useCallback(() => {
      if (!supported) return undefined;
      activeRef.current = true;
      void loadStatus();
      return () => {
        activeRef.current = false;
        requestRef.current += 1;
        clearPreviewTimer();
        void stopAlarmSoundPreview().catch(() => undefined);
      };
    }, [clearPreviewTimer, loadStatus, supported]),
  );

  const stopPreview = useCallback(async () => {
    clearPreviewTimer();
    try {
      await stopAlarmSoundPreview();
    } finally {
      if (activeRef.current) setPreviewing(false);
    }
  }, [clearPreviewTimer]);

  const chooseSound = async () => {
    if (busyAction) return;
    setBusyAction('select');
    try {
      await stopPreview();
      const nextStatus = await selectAlarmSound();
      if (!activeRef.current) return;
      setStatus(nextStatus);
      setLoadFailed(false);
    } catch {
      if (activeRef.current) {
        showDialog(
          '알람음을 선택하지 못했어요',
          '휴대폰의 알람음 선택 화면을 다시 열어 주세요.',
        );
      }
    } finally {
      if (activeRef.current) setBusyAction(null);
    }
  };

  const togglePreview = async () => {
    if (busyAction) return;
    setBusyAction('preview');
    try {
      if (previewing) {
        await stopPreview();
        return;
      }
      const started = await previewAlarmSound();
      if (!activeRef.current) return;
      if (!started) {
        showDialog(
          '알람음을 미리 듣지 못했어요',
          '휴대폰의 알람음 설정을 확인한 뒤 다시 시도해 주세요.',
        );
        return;
      }
      setPreviewing(true);
      clearPreviewTimer();
      previewTimerRef.current = setTimeout(() => {
        previewTimerRef.current = null;
        if (activeRef.current) setPreviewing(false);
      }, PREVIEW_DURATION_MS + PREVIEW_UI_TOLERANCE_MS);
    } catch {
      if (activeRef.current) {
        showDialog(
          '알람음을 미리 듣지 못했어요',
          '잠시 후 다시 시도해 주세요.',
        );
      }
    } finally {
      if (activeRef.current) setBusyAction(null);
    }
  };

  const restoreDefault = async () => {
    if (busyAction || !status?.selected) return;
    setBusyAction('reset');
    try {
      await stopPreview();
      const nextStatus = await resetAlarmSound();
      if (!activeRef.current) return;
      setStatus(nextStatus);
      setLoadFailed(false);
    } catch {
      if (activeRef.current) {
        showDialog(
          '기본 알람음으로 복원하지 못했어요',
          '잠시 후 다시 시도해 주세요.',
        );
      }
    } finally {
      if (activeRef.current) setBusyAction(null);
    }
  };

  if (!supported || (!loading && status?.supported === false)) return null;

  const fallbackMessage = status
    ? getAlarmSoundFallbackMessage(status)
    : null;
  const actionsDisabled = loading || busyAction !== null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <AppIcon
            accessible={false}
            color={palette.indigoDark}
            name="alarm-outline"
            size={22}
          />
        </View>
        <View style={styles.copy}>
          <AppText accessibilityRole="header" variant="heading">
            알람음
          </AppText>
          <AppText tone="secondary" variant="caption">
            모든 근무 알람과 시험 알람에 공통으로 적용해요.
          </AppText>
        </View>
      </View>

      {loading && !status ? (
        <View accessibilityLiveRegion="polite" style={styles.loadingRow}>
          <ActivityIndicator color={palette.indigoDark} size="small" />
          <AppText tone="secondary" variant="caption">
            현재 알람음을 확인하고 있어요.
          </AppText>
        </View>
      ) : loadFailed && !status ? (
        <View style={styles.errorBlock}>
          <AppText color={palette.danger} variant="caption">
            알람음 상태를 확인하지 못했어요.
          </AppText>
          <AppButton
            icon="refresh-outline"
            label="다시 확인하기"
            loading={loading}
            onPress={() => void loadStatus()}
            style={styles.fullWidthButton}
            variant="secondary"
          />
        </View>
      ) : status ? (
        <>
          <View style={styles.currentSound}>
            <AppText tone="secondary" variant="caption">
              현재 알람음
            </AppText>
            <AppText numberOfLines={2} variant="label">
              {status.label}
            </AppText>
            {fallbackMessage ? (
              <AppText color={palette.amber} variant="caption">
                {fallbackMessage}
              </AppText>
            ) : null}
          </View>

          <AppButton
            disabled={actionsDisabled}
            icon="settings-outline"
            label="시스템 알람음 선택하기"
            loading={busyAction === 'select'}
            onPress={() => void chooseSound()}
            style={styles.fullWidthButton}
            variant="secondary"
          />

          <View style={[styles.actionRow, stackActions && styles.actionRowStacked]}>
            <AppButton
              disabled={actionsDisabled && busyAction !== 'preview'}
              icon={previewing ? 'pause' : 'play'}
              label={previewing ? '미리 듣기 중지' : '10초 미리 듣기'}
              loading={busyAction === 'preview'}
              onPress={() => void togglePreview()}
              style={[styles.actionButton, stackActions && styles.fullWidthButton]}
              variant="secondary"
            />
            {status.selected ? (
              <AppButton
                disabled={actionsDisabled}
                icon="arrow-undo-outline"
                label="기본값 복원"
                loading={busyAction === 'reset'}
                onPress={() => void restoreDefault()}
                style={[styles.actionButton, stackActions && styles.fullWidthButton]}
                variant="ghost"
              />
            ) : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    card: { gap: spacing.medium },
    header: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.medium,
    },
    icon: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.medium,
      backgroundColor: palette.indigoSoft,
    },
    copy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    currentSound: {
      minHeight: 64,
      justifyContent: 'center',
      gap: spacing.tiny,
      padding: spacing.medium,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    loadingRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    errorBlock: { gap: spacing.small },
    actionRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.small,
    },
    actionRowStacked: { flexDirection: 'column' },
    actionButton: { minWidth: 0, flex: 1 },
    fullWidthButton: { width: '100%' },
  });
