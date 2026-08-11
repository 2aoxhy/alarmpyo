import { useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';

import { AppText, MenuGroup } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';

type DayNoteEditorProps = {
  note: string;
  onChange: (value: string) => void;
};

export function DayNoteEditor({ note, onChange }: DayNoteEditorProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);

  return (
    <MenuGroup centered title="메모" style={styles.sectionGroup}>
      <TextInput
        accessibilityLabel="하루 메모"
        accessibilityHint="인수인계나 준비물을 적어 둘 수 있어요."
        maxLength={200}
        multiline
        onBlur={() => setFocused(false)}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        placeholder="인수인계 또는 준비물 입력"
        placeholderTextColor={palette.inkSoft}
        selectionColor={palette.indigo}
        style={[styles.noteInput, focused && styles.noteInputFocused]}
        textAlignVertical="top"
        value={note}
      />
      <AppText color={palette.inkSoft} style={styles.counter} variant="caption">
        {note.length}/200자
      </AppText>
    </MenuGroup>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    sectionGroup: { gap: spacing.small },
    noteInput: {
      minHeight: 88,
      padding: spacing.medium,
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: palette.transparent,
      backgroundColor: palette.surfaceSoft,
      color: palette.ink,
      fontFamily: fontFamily.body,
      fontSize: 16,
      lineHeight: 23,
      ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
    },
    noteInputFocused: { borderColor: palette.indigo },
    counter: { textAlign: 'right' },
  });
}
