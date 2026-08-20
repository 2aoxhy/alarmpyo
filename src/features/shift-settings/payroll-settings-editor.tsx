import { useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { AppField, SegmentedControl, StatusBanner } from '@/design-system';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PayrollAdjustment, PayrollSettings } from '@/models/app-data';

import {
  buildPayrollPreview,
  parsePayrollDay,
} from './payroll-settings-model';

type PayrollSettingsEditorProps = {
  onSave: (settings: PayrollSettings) => Promise<boolean>;
  value: PayrollSettings;
};

export function PayrollSettingsEditor({
  onSave,
  value,
}: PayrollSettingsEditorProps) {
  const styles = useThemedStyles(createStyles);
  const [dayText, setDayText] = useState(String(value.day));
  const [adjustment, setAdjustment] = useState<PayrollAdjustment>(
    value.adjustment,
  );
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const day = parsePayrollDay(dayText);
  const draft = useMemo<PayrollSettings | null>(
    () => (day === null ? null : { day, adjustment }),
    [adjustment, day],
  );
  const dirty = Boolean(
    draft &&
      (draft.day !== value.day || draft.adjustment !== value.adjustment),
  );
  const [previewDate] = useState(() => new Date());
  const preview = useMemo(
    () => (draft ? buildPayrollPreview(draft, previewDate) : []),
    [draft, previewDate],
  );

  const save = async () => {
    if (!draft || !dirty || busy) return;
    setBusy(true);
    setSaveError(false);
    try {
      const saved = await onSave(draft);
      setSaveError(!saved);
      if (saved) {
        void AccessibilityInfo.announceForAccessibility(
          '급여일 설정을 저장했습니다.',
        );
      }
    } catch {
      setSaveError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.intro}>
        <AppText accessibilityRole="header" variant="heading">
          급여일
        </AppText>
        <AppText tone="secondary" variant="caption">
          달력에 표시할 회사 지급일을 설정합니다. 해당 월에 없는 날짜는 말일을 사용합니다.
        </AppText>
      </View>

      <AppField
        accessibilityHint="1부터 31 사이의 숫자를 입력해야 합니다."
        errorText={day === null ? '1부터 31 사이의 날짜를 입력해야 합니다.' : undefined}
        inputMode="numeric"
        inputStyle={styles.dayInput}
        keyboardType="number-pad"
        label="매월 지급일"
        maxLength={2}
        onChangeText={(text) => {
          setDayText(text.replace(/[^0-9]/g, '').slice(0, 2));
          setSaveError(false);
        }}
        required
        selectTextOnFocus
        value={dayText}
      />

      <View style={styles.policy}>
        <AppText variant="label">휴일 조정</AppText>
        <SegmentedControl
          label="급여일 휴일 조정 방식"
          onChange={(next) => {
            setAdjustment(next);
            setSaveError(false);
          }}
          options={[
            { label: '지정일 그대로', value: 'fixed-date' },
            { label: '직전 영업일', value: 'previous-business-day' },
          ]}
          value={adjustment}
        />
        <AppText tone="secondary" variant="caption">
          직전 영업일을 선택하면 주말과 확인 가능한 공휴일을 피해 앞당깁니다.
        </AppText>
      </View>

      {preview.length > 0 ? (
        <View accessible accessibilityLabel={`앞으로 세 달 급여일. ${preview
          .map((item) => `${item.monthLabel} ${item.paydayLabel}`)
          .join(', ')}`} style={styles.preview}>
          <AppText accessibilityRole="header" variant="label">
            3개월 미리보기
          </AppText>
          {preview.map((item) => (
            <View key={item.monthLabel} style={styles.previewRow}>
              <AppText style={styles.previewMonth} variant="caption">
                {item.monthLabel}
              </AppText>
              <View style={styles.previewDate}>
                <AppText variant="label">{item.paydayLabel}</AppText>
                {item.adjusted ? (
                  <AppText tone="secondary" variant="caption">
                    {item.regularPaydayLabel}에서 앞당김
                  </AppText>
                ) : !item.confirmed ? (
                  <AppText tone="secondary" variant="caption">
                    예상일
                  </AppText>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {saveError ? (
        <StatusBanner
          actionLabel="다시 시도"
          message="저장 공간을 확인한 뒤 다시 시도해야 합니다."
          onAction={() => void save()}
          title="급여일 설정을 저장하지 못했습니다"
          tone="danger"
        />
      ) : null}

      <AppButton
        disabled={!draft || !dirty || busy}
        icon="checkmark"
        label={dirty ? '급여일 저장' : '변경 내용 없음'}
        loading={busy}
        onPress={() => void save()}
        size="compact"
      />
    </Card>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: { gap: spacing.large },
    intro: { gap: spacing.tiny },
    dayInput: {
      color: palette.ink,
      fontSize: 19,
      textAlign: 'center',
      backgroundColor: palette.surfaceSoft,
      ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
    },
    policy: { gap: spacing.small },
    preview: {
      gap: spacing.small,
      borderRadius: 16,
      backgroundColor: palette.surfaceSoft,
      padding: spacing.medium,
    },
    previewRow: {
      minHeight: 48,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
      paddingTop: spacing.small,
    },
    previewMonth: { minWidth: 92 },
    previewDate: { minWidth: 120, alignItems: 'flex-end', gap: 1 },
  });
}
