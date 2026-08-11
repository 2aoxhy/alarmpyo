package expo.modules.alarmpyoalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

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
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val appNotificationsBlocked =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()
    val intent = when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !appNotificationsBlocked ->
        Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          putExtra(Settings.EXTRA_CHANNEL_ID, SLEEP_REMINDER_CHANNEL_ID)
        }
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        }
      else -> Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.parse("package:${context.packageName}")
      )
    }
    return runCatching {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }.getOrDefault(false)
  }
}
