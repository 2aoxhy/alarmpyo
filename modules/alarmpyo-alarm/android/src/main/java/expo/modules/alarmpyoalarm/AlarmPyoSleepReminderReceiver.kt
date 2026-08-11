package expo.modules.alarmpyoalarm

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AlarmPyoSleepReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_FIRE_SLEEP_REMINDER) return
    val id = intent.getStringExtra(EXTRA_SLEEP_REMINDER_ID)
      ?.takeIf(String::isNotBlank)
      ?: return
    val reminderAt = intent.getLongExtra(EXTRA_SLEEP_REMINDER_AT, 0L)
    if (reminderAt <= 0L) return

    val plan = AlarmPyoSleepReminderScheduler.consumeAndReplenish(
      context.applicationContext,
      id,
      reminderAt
    ) ?: return

    AlarmPyoSleepReminderChannels.ensure(context)
    if (!AlarmPyoSleepReminderChannels.notificationsAllowed(context)) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(notificationId(plan.id), buildNotification(context, plan))
  }

  @Suppress("DEPRECATION")
  private fun buildNotification(
    context: Context,
    plan: AlarmPyoSleepReminderPlan
  ): Notification {
    val openAppIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val contentIntent = openAppIntent?.let {
      PendingIntent.getActivity(
        context,
        notificationId(plan.id) xor 0x4F504E,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, SLEEP_REMINDER_CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }
    builder
      .setSmallIcon(R.drawable.alarmpyo_ic_alarm)
      .setColor(context.alarmpyoColor(R.color.alarmpyo_accent))
      .setContentTitle(plan.title)
      .setContentText(plan.body)
      .setStyle(Notification.BigTextStyle().bigText(plan.body))
      .setCategory(Notification.CATEGORY_REMINDER)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPriority(Notification.PRIORITY_DEFAULT)
      .setWhen(plan.reminderAt)
      .setShowWhen(true)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
    contentIntent?.let(builder::setContentIntent)
    return builder.build()
  }

  private fun notificationId(id: String): Int =
    (id.hashCode() xor 0x534C4E) and Int.MAX_VALUE
}
