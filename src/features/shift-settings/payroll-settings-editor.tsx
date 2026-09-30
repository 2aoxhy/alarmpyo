import { useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { AppField, SegmentedControl } from '@/design-system';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PayrollAdjustment, PayrollSettings } from '@/models/app-data';

import {
  buildPayrollPreview,
  parsePayrollDay,
} from './payroll-settings-model';

type PayrollSettingsEditorProps = {
  onChange: (settings: PayrollSettings | null) => void;
  value: PayrollSettings;
};

export function PayrollSettingsEditor({
  onChange,
  value,
}: PayrollSettingsEditorProps) {
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.4;
  const [dayText, setDayText] = useState(String(value.day));
  const [adjustment, setAdjustment] = useState<PayrollAdjustment>(
    value.adjustment,
  );
  const day = parsePayrollDay(dayText);
  const draft = useMemo<PayrollSettings | null>(
    () => (day === null ? null : { day, adjustment }),
    [adjustment, day],
  );
  const [previewDate] = useState(() => new Date());
  const preview = useMemo(
    () => (draft ? buildPayrollPreview(draft, previewDate) : []),
    [draft, previewDate],
  );

  return (
    <View style={styles.card}>
      <AppText tone="secondary" variant="caption">
        달력에 표시할 지급일을 설정합니다. 해당 월에 없는 날짜는 말일을 사용합니다.
      </AppText>

      <AppField
        accessibilityHint="1부터 31 사이의 숫자를 입력해야 합니다."
        errorText={day === null ? '1부터 31 사이의 날짜를 입력해야 합니다.' : undefined}
        inputMode="numeric"
        inputStyle={styles.dayInput}
        keyboardType="number-pad"
        label="매월 지급일"
        maxLength={2}
        onChangeText={(text) => {
          const nextText = text.replace(/[^0-9]/g, '').slice(0, 2);
          setDayText(nextText);
          const nextDay = parsePayrollDay(nextText);
          onChange(
            nextDay === null ? null : { day: nextDay, adjustment },
          );
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
            onChange(day === null ? null : { day, adjustment: next });
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
            <View
              key={item.monthLabel}
              style={[
                styles.previewRow,
                stacked && styles.previewRowStacked,
              ]}>
              <AppText style={styles.previewMonth} variant="caption">
                {item.monthLabel}
              </AppText>
              <View
                style={[
                  styles.previewDate,
                  stacked && styles.previewDateStacked,
                ]}>
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

    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: {
      gap: spacing.large,
      paddingVertical: spacing.small,
      paddingLeft: spacing.medium,
      borderLeftWidth: 2,
      borderLeftColor: palette.controlLine,
    },
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
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
      paddingVertical: spacing.medium,
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
    previewRowStacked: {
      alignItems: 'flex-start',
      flexDirection: 'column',
    },
    previewMonth: { minWidth: 92 },
    previewDate: { minWidth: 120, alignItems: 'flex-end', gap: 1 },
    previewDateStacked: { width: '100%', alignItems: 'flex-start' },
  });
}
