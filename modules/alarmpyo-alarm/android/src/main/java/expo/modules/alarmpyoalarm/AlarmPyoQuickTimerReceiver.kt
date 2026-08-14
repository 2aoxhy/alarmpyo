package expo.modules.alarmpyoalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class AlarmPyoQuickTimerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_FIRE_ALARMPYO_QUICK_TIMER) return
    val appContext = context.applicationContext
    val plan = AlarmPyoQuickTimerScheduler.planForFiringIntent(appContext, intent) ?: return
    AlarmPyoAlarmChannels.ensure(appContext)

    val watchdog = runCatching {
      AlarmPyoQuickTimerScheduler.retryDelivery(appContext, plan)
    }.onFailure { error ->
      Log.e(TAG, "타이머 전달 안전 재시도를 예약하지 못했어요.", error)
    }.getOrNull() ?: return

    if (!AlarmPyoAlarmPermissions.notificationsAllowed(appContext)) {
      if (!watchdog.scheduled) {
        AlarmPyoQuickTimerScheduler.markDeliveryExhausted(appContext, watchdog.plan)
      }
      return
    }

    val serviceIntent = Intent(appContext, AlarmPyoAlarmService::class.java).apply {
      action = ACTION_START_RINGING
      putAlarmPyoSource(AlarmPyoAlarmSource.TIMER)
      putExtra(EXTRA_RETRY_ARMED, watchdog.scheduled)
      putExtra(EXTRA_AUTOMATIC_REPEAT_ELIGIBLE, !watchdog.plan.isSingleRepeat())
      watchdog.plan.addToIntent(this)
    }
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        appContext.startForegroundService(serviceIntent)
      } else {
        appContext.startService(serviceIntent)
      }
    }.onFailure { error ->
      if (!watchdog.scheduled) {
        AlarmPyoQuickTimerScheduler.markDeliveryExhausted(appContext, watchdog.plan)
      }
      Log.e(TAG, "타이머 알람 서비스를 시작하지 못했어요.", error)
    }
  }

  private companion object {
    const val TAG = "AlarmPyoQuickTimer"
  }
}
