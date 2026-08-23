import { router, Stack, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { DatePickerField } from '@/components/date-picker-field';
import { SelectionCard, SelectionPill } from '@/components/selection-controls';
import { AppButton, AppText, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner, Surface } from '@/design-system';
import { dataSettingsController } from '@/features/data-settings/data-settings-native-controller';
import { prepareQuickSetupAlarmReadiness } from '@/features/quick-setup/quick-setup-alarm-preparation';
import { quickSetupDraftController } from '@/features/quick-setup/quick-setup-draft-controller';
import {
  createQuickPreview,
  createQuickSetupDraft,
  formatQuickPositionLabel,
  formatQuickSequence,
  QUICK_SETUP_OPTIONS,
  resolveQuickSetupShiftTimeRows,
  type QuickSetupDraftV1,
} from '@/features/quick-setup/quick-setup-model';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { WorkSettingsSharePreview } from '@/services/work-settings-share-service';
import { useAppStoreActions, useAppStoreData } from '@/store/app-store';
import { formatCompactTime, toDateKey } from '@/utils/date';
import {
  createWorkPatternFromReference,
  getPatternPositionForDate,
  getWeekdayPatternPosition,
  getWorkPatternDisplayName,
  getWorkPatternPresetId,
  type BaseWorkShiftId,
} from '@/utils/work-pattern';

export default function QuickSetupScreen() {
  const { showDialog } = useAppDialog();
  const styles = useThemedStyles(createStyles);
  const { data } = useAppStoreData();
  const {
    applySharedWorkSettings,
    createBackup,
    enableAlarms,
    exportSharedWorkSettings,
    previewSharedWorkSettings,
    updatePatternDetailed,
  } = useAppStoreActions();
  const [today] = useState(() => toDateKey(new Date()));
  const [draftSession] = useState(() => quickSetupDraftController.createSession());
  const [draft, setDraft] = useState<QuickSetupDraftV1>(() =>
    createQuickSetupDraft(data, today),
  );
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showOtherDate, setShowOtherDate] = useState(false);

  useEffect(() => {
    let active = true;
    void draftSession
      .hydrate()
      .then((saved) => {
        if (!active || !saved) return;
        setDraft(saved);
        setShowOtherDate(saved.referenceDate !== today);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [draftSession, today]);

  useEffect(() => {
    if (!hydrated) return;
    void draftSession.write(draft).catch(() => undefined);
  }, [draft, draftSession, hydrated]);

  const preview = useMemo(
    () =>
      draft.position === null
        ? []
        : createQuickPreview(
            draft.sequence,
            draft.referenceDate,
            draft.position,
          ),
    [draft.position, draft.referenceDate, draft.sequence],
  );
  const shiftTimeRows = useMemo(
    () => resolveQuickSetupShiftTimeRows(draft, data.shiftTypes),
    [data.shiftTypes, draft],
  );

  const selectDirectOption = (presetId: QuickSetupDraftV1['presetId']) => {
    if (!hydrated || busy) return;
    const option = QUICK_SETUP_OPTIONS.find((candidate) => candidate.presetId === presetId);
    if (!option) return;
    setDraft((current) => ({
      ...current,
      source: 'direct',
      step: 'schedule-anchor',
      presetId,
      sequence: [...option.sequence],
      referenceDate: today,
      position:
        presetId === 'weekday' ? getWeekdayPatternPosition(today) : null,
      receivedPreview: null,
    }));
  };

  const receiveSettings = async () => {
    if (!hydrated || busy) return;
    setBusy(true);
    try {
      const picked = await dataSettingsController.pickWorkSettingsFile();
      if (!picked) return;
      const receivedPreview = previewSharedWorkSettings(picked.contents);
      const sequence = receivedPreview.document.workSettings.pattern.shiftTypeIds.filter(
        (id): id is BaseWorkShiftId =>
          id === 'day' || id === 'evening' || id === 'night' || id === 'off',
      );
      if (sequence.length === 0) throw new Error('받은 근무 순서를 확인할 수 없습니다.');
      const pattern = receivedPreview.document.workSettings.pattern;
      const presetId = getWorkPatternPresetId(sequence);
      const position =
        presetId === 'weekday'
          ? getWeekdayPatternPosition(today)
          : getPatternPositionForDate({
              date: today,
              referenceDate: pattern.anchorDate,
              referencePosition: 0,
              sequenceLength: sequence.length,
            });
      setDraft((current) => ({
        ...current,
        source: 'received-file',
        step: 'schedule-anchor',
        presetId,
        sequence: [...sequence],
        referenceDate: today,
        position,
        receivedPreview,
      }));
    } catch (error) {
      showDialog(
        '받은 근무표를 읽지 못했습니다',
        error instanceof Error
          ? error.message
          : '알람표에서 만든 근무 설정 파일인지 확인해야 합니다.',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  };

  const adjustedReceivedPreview = (
    source: WorkSettingsSharePreview,
  ): WorkSettingsSharePreview => {
    const position = draft.position ?? 0;
    const pattern = createWorkPatternFromReference({
      presetId: draft.presetId,
      shiftTypeIds: draft.sequence,
      position,
      referenceDate: draft.referenceDate,
      scheduleStartDate: draft.referenceDate,
      name: source.document.workSettings.pattern.name,
    });
    return {
      ...source,
      document: {
        ...source.document,
        workSettings: {
          ...source.document.workSettings,
          pattern,
        },
      },
      summary: {
        ...source.summary,
        patternName: pattern.name,
        anchorDate: pattern.anchorDate,
        scheduleStartDate: pattern.scheduleStartDate ?? pattern.anchorDate,
      },
    };
  };

  const applySchedule = async () => {
    if (!hydrated || busy || draft.position === null) return;
    setBusy(true);
    try {
      let success = false;
      if (draft.source === 'received-file' && draft.receivedPreview) {
        const result = await applySharedWorkSettings(
          adjustedReceivedPreview(draft.receivedPreview),
        );
        success = result.success;
      } else {
        await createBackup();
        const pattern = createWorkPatternFromReference({
          presetId: draft.presetId,
          shiftTypeIds: draft.sequence,
          position: draft.position,
          referenceDate: draft.referenceDate,
          scheduleStartDate: draft.referenceDate,
          name: getWorkPatternDisplayName(draft.sequence),
        });
        const result = await updatePatternDetailed(pattern, {});
        success = result.operationSucceeded;
      }
      if (!success) {
        showDialog(
          '근무표를 적용하지 못했습니다',
          '안전 백업이나 저장 상태를 확인한 뒤 다시 시도해야 합니다.',
          undefined,
          { tone: 'danger' },
        );
        return;
      }
      setDraft((current) => ({ ...current, step: 'alarm-readiness' }));
    } catch {
      showDialog(
        '근무표를 적용하지 못했습니다',
        '현재 자료는 유지했습니다. 저장 공간을 확인한 뒤 다시 시도해야 합니다.',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  };

  const prepareAlarms = async () => {
    if (!hydrated || busy) return;
    setBusy(true);
    try {
      const result = await prepareQuickSetupAlarmReadiness(
        data.settings.notificationsEnabled,
        enableAlarms,
      );
      if (result.status === 'ready') {
        router.push('/alarm-settings?focus=permissions' as Href);
        return;
      }
      showDialog(
        result.status === 'enable-failed'
          ? '알람을 켜지 못했습니다'
          : '알람을 준비하지 못했습니다',
        result.status === 'enable-failed'
          ? '근무표 또는 저장 상태를 확인해야 합니다. 알람 설정에서 현재 상태를 확인할 수 있습니다.'
          : '현재 자료는 유지했습니다. 잠시 후 다시 시도하거나 알람 설정에서 상태를 확인해야 합니다.',
        [
          { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
          {
            text: '알람 설정 보기',
            actionId: 'open-settings',
            icon: 'settings-outline',
            onPress: () => router.push('/alarm-settings' as Href),
          },
        ],
        { tone: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!hydrated || busy) return;
    try {
      await draftSession.complete();
    } catch {
      // 화면을 끝낸 세션은 이미 닫혔으므로 늦은 write가 초안을 되살리지 않습니다.
    } finally {
      router.replace('/(tabs)/settings' as Href);
    }
  };

  const shareWithTeam = async () => {
    if (!hydrated || busy) return;
    setBusy(true);
    try {
      const fileName = await dataSettingsController.shareWorkSettingsFile(
        exportSharedWorkSettings(),
      );
      showDialog(
        '근무표 공유 화면을 닫았습니다',
        `${fileName} 파일을 준비했습니다. 선택한 앱에서 전송 여부를 확인해야 합니다.`,
        undefined,
        { tone: 'success' },
      );
    } catch (error) {
      showDialog(
        '근무표를 보내지 못했습니다',
        error instanceof Error ? error.message : '잠시 후 다시 시도해야 합니다.',
        undefined,
        { tone: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmShareWithTeam = () => {
    if (!hydrated || busy) return;
    showDialog(
      '받는 사람의 앱 버전을 확인해야 합니다',
      'V17 이상에서 받으면 개인 알람·일정·메모를 유지합니다. V16 이하에서는 이전 공유 규칙으로 파일의 알람 값도 적용될 수 있으므로, 받는 사람이 V17 이상인지 확인한 뒤 보내야 합니다.',
      [
        { text: '취소', actionId: 'cancel', icon: 'close', style: 'cancel' },
        {
          text: '파일 보내기',
          actionId: 'confirm',
          icon: 'share-outline',
          onPress: () => void shareWithTeam(),
        },
      ],
      { tone: 'warning' },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: '간편 설정' }} />
      <Screen contentStyle={styles.screen} safeAreaEdges={['left', 'right']}>
        <AppText tone="secondary" variant="body">
          근무표와 알람을 필요한 순서대로 준비합니다.
        </AppText>
        {hydrated ? (
          <QuickSetupProgress step={draft.step} />
        ) : (
          <StatusBanner
            message="중단한 단계가 있는지 확인하고 있습니다."
            title="간편 설정 불러오는 중"
            tone="neutral"
          />
        )}

        {hydrated && draft.step === 'schedule-source' ? (
          <View style={styles.section}>
            <View style={styles.heading}>
              <AppText accessibilityRole="header" variant="heading">
                근무표 준비 방법
              </AppText>
              <AppText tone="secondary" variant="body">
                파트장에게 받은 파일을 쓰거나 회사의 실제 근무 순서를 직접 고릅니다.
              </AppText>
            </View>
            <AppButton
              icon="download-outline"
              label="받은 근무표 사용"
              loading={busy}
              onPress={() => void receiveSettings()}
            />
            <View accessibilityLabel="회사 근무 순서" accessibilityRole="radiogroup" style={styles.options}>
              {QUICK_SETUP_OPTIONS.map((option) => (
                <SelectionCard
                  accessibilityLabel={`${option.label}. ${option.detail}`}
                  key={option.presetId}
                  onPress={() => selectDirectOption(option.presetId)}
                  selected={
                    draft.source === 'direct' && draft.presetId === option.presetId
                  }>
                  <View style={styles.optionCopy}>
                    <AppText variant="label">{option.label}</AppText>
                    <AppText tone="secondary" variant="caption">{option.detail}</AppText>
                  </View>
                </SelectionCard>
              ))}
            </View>
            <AppButton
              icon="book-outline"
              label="직접 만들기·저장한 순서 보기"
              onPress={() => router.push('/pattern-library' as Href)}
              variant="ghost"
            />
          </View>
        ) : null}

        {hydrated && draft.step === 'schedule-anchor' ? (
          <View style={styles.section}>
            <Surface style={styles.summaryCard} tone="muted">
              <AppText variant="label">
                {draft.source === 'received-file' ? '받은 회사 근무 순서' : '선택한 회사 근무 순서'}
              </AppText>
              <AppText tone="secondary" variant="body">
                {formatQuickSequence(draft.sequence)}
              </AppText>
            </Surface>
            {draft.presetId === 'weekday' ? (
              <StatusBanner
                message="월요일부터 금요일은 주간, 토요일과 일요일은 휴무로 자동으로 맞춥니다."
                title="요일 기준으로 맞췄습니다"
                tone="neutral"
              />
            ) : (
              <>
                <View style={styles.heading}>
                  <AppText accessibilityRole="header" variant="heading">
                    {draft.referenceDate === today
                      ? '오늘의 실제 근무 일차'
                      : '선택한 날짜의 실제 근무 일차'}
                  </AppText>
                  <AppText tone="secondary" variant="body">
                    같은 근무가 이어지면 1일차와 2일차를 구분합니다.
                  </AppText>
                </View>
                <View accessibilityLabel="기준 날짜의 실제 근무" accessibilityRole="radiogroup" style={styles.positionOptions}>
                  {draft.sequence.map((_, index) => (
                    <SelectionPill
                      key={`${draft.sequence[index]}-${index}`}
                      label={formatQuickPositionLabel(draft.sequence, index)}
                      onPress={() => setDraft((current) => ({ ...current, position: index }))}
                      selected={draft.position === index}
                      style={styles.positionOption}
                    />
                  ))}
                </View>
              </>
            )}
            {showOtherDate ? (
              <Surface style={styles.dateCard} tone="muted">
                <AppText variant="label">일정을 맞출 날짜</AppText>
                <DatePickerField
                  accessibilityLabel="일정을 맞출 날짜"
                  onChange={(referenceDate) =>
                    setDraft((current) => ({
                      ...current,
                      referenceDate,
                      position:
                        current.presetId === 'weekday'
                          ? getWeekdayPatternPosition(referenceDate)
                          : null,
                    }))
                  }
                  placeholder={today}
                  today={today}
                  value={draft.referenceDate}
                />
              </Surface>
            ) : (
              <AppButton
                icon="calendar-outline"
                label="다른 날짜로 시작"
                onPress={() => setShowOtherDate(true)}
                variant="ghost"
              />
            )}
            {preview.length > 0 ? (
              <Surface style={styles.previewCard}>
                <AppText accessibilityRole="header" variant="heading">앞으로 7일</AppText>
                <View style={styles.previewList}>
                  {preview.map((item) => (
                    <View accessible accessibilityLabel={`${item.dateLabel}. ${item.shiftLabel}`} key={item.dateKey} style={styles.previewRow}>
                      <AppText tone="secondary" variant="caption">{item.dateLabel}</AppText>
                      <AppText variant="label">{item.shiftLabel}</AppText>
                    </View>
                  ))}
                </View>
              </Surface>
            ) : (
              <StatusBanner
                message="기준 날짜의 실제 근무를 선택하면 앞으로 7일을 바로 보여 줍니다."
                title="실제 근무를 선택해야 합니다"
                tone="neutral"
              />
            )}
            <Surface style={styles.timeCard} tone="muted">
              <AppText variant="label">
                {draft.source === 'received-file'
                  ? '받은 파일에 저장된 근무 시간'
                  : '사용할 근무 시간'}
              </AppText>
              {shiftTimeRows.map((shift) => (
                <AppText key={shift.id} tone="secondary" variant="caption">
                  {shift.name} · {formatCompactTime(shift.startMinutes ?? 0)}~{formatCompactTime(shift.endMinutes ?? 0)}
                </AppText>
              ))}
              {draft.source === 'received-file' ? (
                <AppText tone="secondary" variant="caption">
                  먼저 받은 근무표를 적용한 뒤 회사 시간이 다르면 수정할 수 있습니다.
                </AppText>
              ) : (
                <AppButton
                  icon="time-outline"
                  label="회사 시간이 다르면 수정"
                  onPress={() => router.push('/shift-settings?focus=time' as Href)}
                  size="compact"
                  variant="ghost"
                />
              )}
            </Surface>
            <View style={styles.actions}>
              <AppButton
                label="근무표 선택으로 돌아가기"
                onPress={() => setDraft((current) => ({ ...current, step: 'schedule-source' }))}
                variant="secondary"
              />
              <AppButton
                disabled={draft.position === null}
                icon="checkmark"
                label="이 근무표 사용"
                loading={busy}
                onPress={() => void applySchedule()}
              />
            </View>
          </View>
        ) : null}

        {hydrated && draft.step === 'alarm-readiness' ? (
          <View style={styles.section}>
            <StatusBanner
              icon="checkmark-circle"
              message="달력의 직접 수정, 메모와 개인 알람 시간은 그대로 유지했습니다."
              title="근무표를 적용했습니다"
              tone="success"
            />
            <Surface style={styles.alarmCard}>
              <AppText accessibilityRole="header" variant="heading">알람 준비</AppText>
              <AppText tone="secondary" variant="body">
                {data.settings.notificationsEnabled
                  ? '알람이 켜져 있습니다. 필수 권한 세 가지를 확인하면 됩니다.'
                  : '근무 알람을 사용하려면 알람을 켜고 필수 권한을 확인합니다.'}
              </AppText>
              <AppButton
                icon="alarm-outline"
                label={data.settings.notificationsEnabled ? '필수 권한 확인하기' : '알람 켜고 권한 준비'}
                loading={busy}
                onPress={() => void prepareAlarms()}
              />
            </Surface>
            {draft.source === 'received-file' ? (
              <AppButton
                icon="time-outline"
                label="적용한 근무 시간 수정"
                onPress={() => router.push('/shift-settings?focus=time' as Href)}
                variant="secondary"
              />
            ) : null}
            <AppButton
              icon="share-outline"
              label="팀에 근무표 보내기"
              loading={busy}
              onPress={confirmShareWithTeam}
              variant="secondary"
            />
            <AppButton
              icon="checkmark"
              label="간편 설정 완료"
              onPress={() => void finish()}
            />
          </View>
        ) : null}
      </Screen>
    </>
  );
}

function QuickSetupProgress({ step }: { step: QuickSetupDraftV1['step'] }) {
  const styles = useThemedStyles(createStyles);
  const active = step === 'schedule-source' ? 1 : step === 'schedule-anchor' ? 2 : 3;
  return (
    <View
      accessibilityLabel={`간편 설정 ${active}단계, 총 3단계`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: active }}
      style={styles.progress}>
      {['근무표 선택', '일정 맞추기', '알람 준비'].map((label, index) => (
        <View key={label} style={[styles.progressItem, index + 1 <= active && styles.progressItemActive]}>
          <AppText tone={index + 1 <= active ? 'primary' : 'tertiary'} variant="caption">
            {index + 1}. {label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: { gap: spacing.large, paddingTop: spacing.small },
    section: { gap: spacing.medium },
    heading: { gap: spacing.tiny },
    progress: { flexDirection: 'row', gap: spacing.small },
    progressItem: {
      minHeight: 48,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.small,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 12,
      backgroundColor: palette.surfaceSoft,
    },
    progressItemActive: {
      borderColor: palette.selectionBorder,
      backgroundColor: palette.selectionSurface,
    },
    options: { gap: spacing.small },
    optionCopy: { gap: spacing.tiny },
    summaryCard: { gap: spacing.tiny },
    positionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    positionOption: { minWidth: 112, flexGrow: 1 },
    dateCard: { gap: spacing.small },
    previewCard: { gap: spacing.medium },
    previewList: { gap: spacing.tiny },
    previewRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
      paddingVertical: spacing.small,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    timeCard: { gap: spacing.small },
    actions: { gap: spacing.small },
    alarmCard: { gap: spacing.medium },
  });
}
