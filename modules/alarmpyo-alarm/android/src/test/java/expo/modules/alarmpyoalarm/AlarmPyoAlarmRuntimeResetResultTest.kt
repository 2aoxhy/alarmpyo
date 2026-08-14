package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmPyoAlarmRuntimeResetResultTest {
  @Test
  fun `reset result distinguishes success partial and failure`() {
    val success = result(true, emptyList())
    val partial = result(true, listOf("sleep-reminders"))
    val failure = result(false, listOf("work-alarms"))

    assertEquals("success", success.outcome)
    assertEquals("partial", partial.outcome)
    assertEquals("failure", failure.outcome)
  }

  private fun result(completed: Boolean, issues: List<String>) =
    AlarmPyoAlarmRuntimeResetResult(
      workAlarmsReset = completed,
      sleepRemindersReset = completed,
      quickTimerReset = completed,
      activeAlarmStopped = completed,
      alarmSoundReset = completed,
      restoreJournalReset = completed,
      alarmHistoryReset = completed,
      issueCodes = issues
    )
}
