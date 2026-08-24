import { type RefObject, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { ModalSurface } from '@/design-system';
import { fontFamily } from '@/constants/typography';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { assertNewBackupPassword } from '@/services/encrypted-backup-service';

export type BackupPasswordDialogMode = 'create' | 'open';

export function BackupPasswordDialog({
  mode,
  onCancel,
  onSubmit,
  returnFocusRef,
}: {
  mode: BackupPasswordDialogMode | null;
  onCancel: () => void;
  onSubmit: (password: string) => Promise<void>;
  returnFocusRef?: RefObject<React.ElementRef<typeof Pressable> | null>;
}) {
  const { fontScale, width } = useWindowDimensions();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const confirmationInputRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearInputs = () => {
    setPassword('');
    setConfirmation('');
    setRevealed(false);
    setErrorMessage(null);
  };

  const cancel = () => {
    if (submitting) return;
    clearInputs();
    onCancel();
  };

  const createMode = mode === 'create';
  const stackActions = width < 360 || fontScale >= 1.25;

  const submit = async () => {
    if (submitting) return;
    try {
      if (createMode) {
        assertNewBackupPassword(password);
        if (password !== confirmation) {
          throw new Error('두 비밀번호가 같지 않습니다.');
        }
      } else if (password.length === 0) {
        throw new Error('백업 비밀번호를 입력해야 합니다.');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '비밀번호를 다시 확인해야 합니다.',
      );
      return;
    }

    const submittedPassword = password;
    setPassword('');
    setConfirmation('');
    setRevealed(false);
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await onSubmit(submittedPassword);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '비밀번호를 다시 확인해야 합니다.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface
      alert={Boolean(errorMessage)}
      cancelable={!submitting}
      footer={
        <View style={[styles.actions, stackActions && styles.actionsStacked]}>
          <AppButton
            disabled={submitting}
            label="취소"
            onPress={cancel}
            style={[styles.action, stackActions && styles.actionStacked]}
            variant="secondary"
          />
          <AppButton
            label={createMode ? '암호화해 저장' : '백업 열기'}
            loading={submitting}
            onPress={() => void submit()}
            style={[styles.action, stackActions && styles.actionStacked]}
          />
        </View>
      }
      onClose={cancel}
      returnFocusRef={returnFocusRef}
      title={createMode ? '백업 비밀번호' : '암호화 백업 열기'}
      visible={mode !== null}>
      <View style={styles.content}>
        <AppText tone="secondary">
          {createMode
            ? '비밀번호를 잊으면 백업을 복구할 수 없습니다. 비밀번호는 앱에 저장되지 않습니다.'
            : '백업을 만들 때 사용한 비밀번호를 입력합니다.'}
        </AppText>

        <View style={styles.field}>
                <View style={styles.fieldHeader}>
                  <AppText variant="label">비밀번호</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
                    disabled={submitting}
                    hitSlop={10}
                    onPress={() => setRevealed((value) => !value)}>
                    <AppText color={palette.indigoDark} variant="label">
                      {revealed ? '숨기기' : '보기'}
                    </AppText>
                  </Pressable>
                </View>
                <TextInput
                  accessibilityLabel="백업 비밀번호"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                  autoFocus
                  editable={!submitting}
                  importantForAutofill="noExcludeDescendants"
                  maxLength={128}
                  onChangeText={setPassword}
                  onSubmitEditing={() => {
                    if (createMode) {
                      confirmationInputRef.current?.focus();
                    } else {
                      void submit();
                    }
                  }}
                  placeholder={createMode ? '12자 이상 입력' : '비밀번호 입력'}
                  placeholderTextColor={palette.inkSoft}
                  returnKeyType={createMode ? 'next' : 'done'}
                  secureTextEntry={!revealed}
                  selectionColor={palette.indigo}
                  style={styles.input}
                  textContentType="none"
                  value={password}
                />
        </View>

        {createMode ? (
          <View style={styles.field}>
                  <AppText variant="label">비밀번호 다시 입력</AppText>
                  <TextInput
                    ref={confirmationInputRef}
                    accessibilityLabel="백업 비밀번호 다시 입력"
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect={false}
                    editable={!submitting}
                    importantForAutofill="noExcludeDescendants"
                    maxLength={128}
                    onChangeText={setConfirmation}
                    onSubmitEditing={() => void submit()}
                    placeholder="같은 비밀번호 입력"
                    placeholderTextColor={palette.inkSoft}
                    returnKeyType="done"
                    secureTextEntry={!revealed}
                    selectionColor={palette.indigo}
                    style={styles.input}
                    textContentType="none"
                    value={confirmation}
                  />
          </View>
        ) : null}

        {errorMessage ? (
          <View accessibilityLiveRegion="assertive" style={styles.error}>
            <AppText color={palette.danger} variant="caption">
              {errorMessage}
            </AppText>
          </View>
        ) : null}
        </View>
    </ModalSurface>
  );
}

function createStyles(palette: AppPalette, isDark: boolean) {
  return StyleSheet.create({
    content: {
      gap: spacing.large,
    },
    field: {
      gap: spacing.small,
    },
    fieldHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    input: {
      minHeight: 56,
      paddingHorizontal: spacing.large,
      borderRadius: radii.medium,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      backgroundColor: palette.surfaceSoft,
      color: palette.ink,
      fontFamily: fontFamily.body,
      fontSize: 17,
    },
    error: {
      padding: spacing.medium,
      borderRadius: radii.small,
      backgroundColor: palette.dangerSoft,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.small,
    },
    actionsStacked: {
      flexDirection: 'column',
    },
    action: {
      flex: 1,
    },
    actionStacked: {
      flex: 0,
      width: '100%',
    },
  });
}
