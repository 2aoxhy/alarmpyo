import * as Haptics from 'expo-haptics';

export type NotificationFeedbackTone = 'success' | 'warning' | 'error';

const NOTIFICATION_TYPE_BY_TONE = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} as const;

/** Native feedback seam shared by routes and feature views. */
export function triggerSelectionFeedback(): Promise<void> {
  return Haptics.selectionAsync();
}

export function triggerNotificationFeedback(
  tone: NotificationFeedbackTone,
): Promise<void> {
  return Haptics.notificationAsync(NOTIFICATION_TYPE_BY_TONE[tone]);
}
