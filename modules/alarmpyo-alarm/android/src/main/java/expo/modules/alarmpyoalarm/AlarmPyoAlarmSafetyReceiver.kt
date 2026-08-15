package expo.modules.alarmpyoalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.concurrent.Executors

class AlarmPyoAlarmSafetyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_RUN_ALARMPYO_ALARM_SAFETY_CHECK) return
    val pendingResult = goAsync()
    val appContext = context.applicationContext
    EXECUTOR.execute {
      try {
        AlarmPyoAlarmSafetyScheduler.runCheck(
          appContext,
          AlarmPyoAlarmSafetyScheduler.planKeyFrom(intent)
        )
      } catch (error: Throwable) {
        Log.e(TAG, "알람 안전 점검을 완료하지 못했습니다.", error)
        runCatching { AlarmPyoAlarmSafetyScheduler.rearm(appContext, force = true) }
      } finally {
        pendingResult.finish()
      }
    }
  }

  private companion object {
    const val TAG = "AlarmPyoAlarmSafety"
    val EXECUTOR = Executors.newSingleThreadExecutor { task ->
      Thread(task, "alarmpyo-alarm-safety").apply { isDaemon = false }
    }
  }
}
