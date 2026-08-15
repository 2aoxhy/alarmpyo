package expo.modules.alarmpyoalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

internal object AlarmPyoSleepReminderChannels {
  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        SLEEP_REMINDER_CHANNEL_ID,
        "수면 시작 알림",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "교대 근무에 맞춘 권장 취침 시각을 알려줘요."
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        setBypassDnd(false)
      }
    )
  }

  fun notificationsAllowed(context: Context): Boolean {
    if (!AlarmPyoAlarmPermissions.runtimeNotificationPermissionAllowed(context)) return false
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) {
      return false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = manager.getNotificationChannel(SLEEP_REMINDER_CHANNEL_ID)
      if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) {
        return false
      }
    }
    return true
  }

  fun openSettings(context: Context): Boolean {
    return AlarmPyoPermissionSettings.open(
      context,
      AlarmPyoPermissionSettingsTarget.SLEEP_NOTIFICATIONS
    ).opened
  }
}
