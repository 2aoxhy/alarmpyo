package expo.modules.alarmpyoalarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent

internal data class AlarmPyoAlarmRuntimeResetResult(
  val workAlarmsReset: Boolean,
  val sleepRemindersReset: Boolean,
  val quickTimerReset: Boolean,
  val activeAlarmStopped: Boolean,
  val alarmSoundReset: Boolean,
  val restoreJournalReset: Boolean,
  val alarmHistoryReset: Boolean,
  val issueCodes: List<String>
) {
  val outcome: String
    get() = when {
      issueCodes.isEmpty() -> "success"
      listOf(
        workAlarmsReset,
        sleepRemindersReset,
        quickTimerReset,
        activeAlarmStopped,
        alarmSoundReset,
        restoreJournalReset,
        alarmHistoryReset
      ).any { it } -> "partial"
      else -> "failure"
    }

  fun toMap(): Map<String, Any> = mapOf(
    "outcome" to outcome,
    "workAlarmsReset" to workAlarmsReset,
    "sleepRemindersReset" to sleepRemindersReset,
    "quickTimerReset" to quickTimerReset,
    "activeAlarmStopped" to activeAlarmStopped,
    "alarmSoundReset" to alarmSoundReset,
    "restoreJournalReset" to restoreJournalReset,
    "alarmHistoryReset" to alarmHistoryReset,
    "issueCodes" to issueCodes
  )
}

internal object AlarmPyoAlarmRuntimeResetter {
  @Synchronized
  fun reset(context: Context): AlarmPyoAlarmRuntimeResetResult {
    val appContext = context.applicationContext
    val issues = mutableListOf<String>()

    fun step(code: String, action: () -> Unit): Boolean = runCatching(action)
      .fold(
        onSuccess = { true },
        onFailure = {
          issues.add(code)
          false
        }
      )

    val activeAlarmStopped = step("active-alarm") {
      AlarmPyoAlarmSoundPreview.stop()
      appContext.stopService(Intent(appContext, AlarmPyoAlarmService::class.java))
      AlarmPyoAlarmActivity.finishActiveAlarm()
      appContext.getSystemService(NotificationManager::class.java)
        ?.cancel(ALARM_NOTIFICATION_ID)
      AlarmPyoAlarmStore.clearActive(appContext)
    }
    val workAlarmsReset = step("work-alarms") {
      AlarmPyoAlarmScheduler.cancelAll(appContext)
    }
    val sleepRemindersReset = step("sleep-reminders") {
      try {
        AlarmPyoSleepReminderScheduler.cancelAll(appContext)
      } catch (cancellationFailure: Throwable) {
        // A tombstone still prevents a corrupt snapshot from reviving reminders. Unknown legacy
        // PendingIntents could not be enumerated, though, so keep this step partial and let the
        // reset journal retry instead of reporting a complete native reset.
        runCatching { AlarmPyoSleepReminderStore.clear(appContext) }
        throw cancellationFailure
      }
    }
    val quickTimerReset = step("quick-timer") {
      AlarmPyoQuickTimerScheduler.cancel(appContext)
    }
    val alarmSoundReset = step("alarm-sound") {
      AlarmPyoAlarmSoundPreview.stop()
      AlarmPyoAlarmSoundStore.reset(appContext)
    }
    val restoreJournalReset = step("restore-journal") {
      AlarmPyoAlarmRestoreReceiver.cancelRestoreWakeup(appContext)
      AlarmPyoAlarmRestoreStateStore.clear(appContext)
    }
    val alarmHistoryReset = step("alarm-history") {
      AlarmPyoAlarmStore.clearRecentEvents(appContext)
    }

    return AlarmPyoAlarmRuntimeResetResult(
      workAlarmsReset = workAlarmsReset,
      sleepRemindersReset = sleepRemindersReset,
      quickTimerReset = quickTimerReset,
      activeAlarmStopped = activeAlarmStopped,
      alarmSoundReset = alarmSoundReset,
      restoreJournalReset = restoreJournalReset,
      alarmHistoryReset = alarmHistoryReset,
      issueCodes = issues.distinct()
    )
  }
}
