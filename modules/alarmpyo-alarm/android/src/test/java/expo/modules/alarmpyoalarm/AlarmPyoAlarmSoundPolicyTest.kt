package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmPyoAlarmSoundPolicyTest {
  @Test
  fun `selected alarm sound is the first playback candidate`() {
    assertEquals(
      listOf("content://selected", "content://alarm", "content://ring", "content://notification"),
      AlarmPyoAlarmSoundPolicy.candidateValues(
        selected = "content://selected",
        defaultAlarm = "content://alarm",
        defaultRingtone = "content://ring",
        defaultNotification = "content://notification"
      )
    )
  }

  @Test
  fun `missing and duplicate candidates are removed without changing fallback order`() {
    assertEquals(
      listOf("content://alarm", "content://notification"),
      AlarmPyoAlarmSoundPolicy.candidateValues(
        selected = " ",
        defaultAlarm = "content://alarm",
        defaultRingtone = "content://alarm",
        defaultNotification = "content://notification"
      )
    )
  }
}
