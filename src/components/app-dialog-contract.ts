import type { AppButtonActionId } from './app-button-policy';
import type { AppDialogTone } from './app-dialog-tone';
import type { AppIconName } from './app-icon';
import { commonCopy } from '../content/common-copy';

export type AppDialogButton = {
  text: string;
  actionId: AppButtonActionId;
  icon: AppIconName;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AppDialogOptions = {
  tone: AppDialogTone;
  cancelable?: boolean;
  onDismiss?: () => void;
};

export const DEFAULT_APP_DIALOG_BUTTONS: readonly AppDialogButton[] = Object.freeze([
  Object.freeze({
    text: commonCopy.confirm.text,
    actionId: 'confirm',
    icon: 'checkmark',
  }),
]);

export const DEFAULT_APP_DIALOG_OPTIONS: AppDialogOptions = Object.freeze({
  tone: 'neutral',
});
