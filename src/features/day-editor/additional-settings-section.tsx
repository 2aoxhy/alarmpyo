import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { DisclosureRow, space } from '@/design-system';

type AdditionalSettingsSectionProps = PropsWithChildren<{
  expanded: boolean;
  onToggle: () => void;
  summary: string;
}>;

export function AdditionalSettingsSection({
  children,
  expanded,
  onToggle,
  summary,
}: AdditionalSettingsSectionProps) {
  return (
    <View style={styles.container}>
      <DisclosureRow
        expanded={expanded}
        icon="options-outline"
        onPress={onToggle}
        subtitle={summary}
        title="특별 일정·시간·알람·메모"
      />
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: space.lg,
  },
  content: {
    width: '100%',
    gap: space.lg,
  },
});
