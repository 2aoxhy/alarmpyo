package expo.modules.alarmpyoalarm

import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoSingleRepeatTimingPolicyTest {
  private val repeat = AlarmPyoAlarmPlan(
    id = "work$SINGLE_REPEAT_ID_SUFFIX",
    dateKey = "",
    shiftTypeId = "day",
    shiftName = "주간",
    alarmAt = 1_000_300_000L,
    originalAlarmAt = 1_000_300_000L,
    rootPlanId = "work",
    repeatStage = SINGLE_REPEAT_STAGE
  )

  @Test
  fun `same boot repeat ignores wall clock changes`() {
    val armed = AlarmPyoSingleRepeatTimingPolicy.arm(
      repeat,
      nowWallClock = 1_000_000_000L,
      nowElapsed = 50_000L,
      currentBootCount = 7,
      delayMillis = TimeUnit.MINUTES.toMillis(5)
    )

    assertEquals(
      TimeUnit.MINUTES.toMillis(4),
      AlarmPyoSingleRepeatTimingPolicy.remainingMillis(
        armed,
        currentBootCount = 7,
        nowWallClock = 1_000_000_000L + TimeUnit.HOURS.toMillis(2),
        nowElapsed = 50_000L + TimeUnit.MINUTES.toMillis(1)
      )
    )
  }

  @Test
  fun `reboot falls back to the rebased wall target and seeds a new elapsed target`() {
    val armed = AlarmPyoSingleRepeatTimingPolicy.arm(
      repeat,
      nowWallClock = 1_000_000_000L,
      nowElapsed = 50_000L,
      currentBootCount = 7,
      delayMillis = TimeUnit.MINUTES.toMillis(5)
    )
    val restored = AlarmPyoSingleRepeatTimingPolicy.rebaseForRestore(
      armed,
      currentBootCount = 8,
      nowWallClock = 1_000_120_000L,
      nowElapsed = 5_000L,
      overdueGraceMillis = TimeUnit.MINUTES.toMillis(30)
    )

    assertEquals(1_000_300_000L, restored?.alarmAt)
    assertEquals(185_000L, restored?.fireAtElapsed)
    assertEquals(8, restored?.bootCount)
  }

  @Test
  fun `repeat older than the wall fallback grace expires after reboot`() {
    assertNull(
      AlarmPyoSingleRepeatTimingPolicy.rebaseForRestore(
        repeat.copy(alarmAt = 1_000L, originalAlarmAt = 1_000L),
        currentBootCount = 8,
        nowWallClock = TimeUnit.HOURS.toMillis(1),
        nowElapsed = 5_000L,
        overdueGraceMillis = TimeUnit.MINUTES.toMillis(30)
      )
    )
  }

  @Test
  fun `legacy repeat without boot metadata remains readable`() {
    val legacyJson = repeat.toJson().apply {
      remove("countdownStartedAtElapsed")
      remove("fireAtElapsed")
      remove("bootCount")
    }
    val decoded = AlarmPyoAlarmPlan.fromJson(legacyJson)

    assertEquals(-1L, decoded?.countdownStartedAtElapsed)
    assertEquals(-1L, decoded?.fireAtElapsed)
    assertEquals(-1, decoded?.bootCount)
    assertTrue(decoded?.isSingleRepeat() == true)
  }
}
