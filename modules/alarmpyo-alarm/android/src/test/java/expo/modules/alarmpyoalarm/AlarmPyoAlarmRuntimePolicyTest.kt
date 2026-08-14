package expo.modules.alarmpyoalarm

import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmRuntimePolicyTest {
  @Test
  fun `first alarm stops before the automatic repeat starts`() {
    val firstDuration = AlarmPyoAlarmRuntimePolicy.ringDurationMillis(
      automaticRepeatArmed = true
    )

    assertEquals(TimeUnit.MINUTES.toMillis(4) + TimeUnit.SECONDS.toMillis(50), firstDuration)
    assertTrue(
      firstDuration + AlarmPyoAlarmRuntimePolicy.REPEAT_OVERLAP_GUARD_MILLIS <=
        AlarmPyoAlarmRuntimePolicy.AUTOMATIC_REPEAT_DELAY_MILLIS
    )
  }

  @Test
  fun `last alarm may ring for at most ten minutes`() {
    assertEquals(
      TimeUnit.MINUTES.toMillis(10),
      AlarmPyoAlarmRuntimePolicy.ringDurationMillis(automaticRepeatArmed = false)
    )
  }

  @Test
  fun `first alarm stops ten seconds before the actual repeat time`() {
    val repeatAt = 1_800_000_300_750L

    assertEquals(
      repeatAt - AlarmPyoAlarmRuntimePolicy.REPEAT_OVERLAP_GUARD_MILLIS,
      AlarmPyoAlarmRuntimePolicy.firstRingStopAt(repeatAt)
    )
  }

  @Test
  fun `audio focus result is accepted only when Android grants it`() {
    assertTrue(AlarmPyoAlarmRuntimePolicy.audioFocusGranted(1, 1))
    assertEquals(false, AlarmPyoAlarmRuntimePolicy.audioFocusGranted(0, 1))
  }

  @Test
  fun `timer expires when work owns the last delivery attempt`() {
    assertTrue(
      AlarmPyoAlarmRuntimePolicy.shouldExpirePreemptedDelivery(
        AlarmPyoAlarmSource.TIMER,
        AlarmPyoAlarmSource.WORK,
        retryArmed = false
      )
    )
    assertEquals(
      false,
      AlarmPyoAlarmRuntimePolicy.shouldExpirePreemptedDelivery(
        AlarmPyoAlarmSource.TIMER,
        AlarmPyoAlarmSource.WORK,
        retryArmed = true
      )
    )
  }
}
