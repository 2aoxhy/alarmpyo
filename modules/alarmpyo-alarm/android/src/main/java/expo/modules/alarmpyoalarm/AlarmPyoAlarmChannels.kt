package expo.modules.alarmpyoalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

internal object AlarmPyoAlarmChannels {
  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.deleteNotificationChannel(LEGACY_ALARM_CHANNEL_ID)

    val channel = NotificationChannel(
      ALARM_CHANNEL_ID,
      "AlarmPyo 알람 실행",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "AlarmPyo 근무 알람 화면을 표시하고 앱에서 알람 소리를 재생합니다."
      setSound(null, null)
      enableVibration(false)
      enableLights(true)
      lightColor = context.alarmpyoColor(R.color.alarmpyo_accent)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(false)
    }
    manager.createNotificationChannel(channel)
  }
}
