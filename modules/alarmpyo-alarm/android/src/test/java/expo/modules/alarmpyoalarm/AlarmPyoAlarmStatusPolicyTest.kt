package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmStatusPolicyTest {
  @Test
  fun `scheduled alarms are blocked when full screen permission is missing`() {
    assertEquals(
      "delivery-blocked",
      AlarmPyoAlarmStatusPolicy.triggerState(
        exactAlarmAllowed = true,
        notificationsAllowed = true,
        fullScreenAllowed = false,
        scheduledCount = 3
      )
    )
  }

  @Test
  fun `enabled and trigger state stay consistent for every permission combination`() {
    for (exact in listOf(false, true)) {
      for (notifications in listOf(false, true)) {
        for (fullScreen in listOf(false, true)) {
          for (scheduledCount in listOf(0, 3)) {
            val state = AlarmPyoAlarmStatusPolicy.triggerState(
              exact,
              notifications,
              fullScreen,
              scheduledCount
            )
            val enabled = AlarmPyoAlarmStatusPolicy.enabled(
              exact,
              notifications,
              fullScreen,
              scheduledCount
            )
            if (state == "scheduled") assertTrue(enabled) else assertFalse(enabled)
          }
        }
      }
    }
  }
}
