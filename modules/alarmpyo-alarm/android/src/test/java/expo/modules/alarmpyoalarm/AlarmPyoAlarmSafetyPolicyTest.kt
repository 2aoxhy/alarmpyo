package expo.modules.alarmpyoalarm

import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmSafetyPolicyTest {
  private val now = 1_000_000_000L

  @Test
  fun `schedules one check ten hours before the nearest root work alarm`() {
    val later = plan("later", now + TimeUnit.HOURS.toMillis(20))
    val nearest = plan("nearest", now + TimeUnit.HOURS.toMillis(12))

    val target = requireNotNull(AlarmPyoAlarmSafetyPolicy.target(listOf(later, nearest), now))

    assertEquals("nearest", target.planId)
    assertEquals(now + TimeUnit.HOURS.toMillis(2), target.checkAt)
  }

  @Test
  fun `late safety window checks within one minute before a future alarm`() {
    val alarmAt = now + TimeUnit.HOURS.toMillis(2)

    val target = requireNotNull(AlarmPyoAlarmSafetyPolicy.target(listOf(plan("work", alarmAt)), now))

    assertTrue(target.checkAt > now)
    assertTrue(target.checkAt <= now + TimeUnit.MINUTES.toMillis(1))
    assertTrue(target.checkAt < alarmAt)
  }

  @Test
  fun `repeat and test alarms never become a safety root`() {
    val repeat = plan("repeat", now + TimeUnit.HOURS.toMillis(12)).copy(
      rootPlanId = "root",
      repeatStage = SINGLE_REPEAT_STAGE
    )
    val test = plan("test", now + TimeUnit.HOURS.toMillis(11)).copy(shiftTypeId = "test")

    assertNull(AlarmPyoAlarmSafetyPolicy.target(listOf(repeat, test), now))
  }

  @Test
  fun `an already checked nearest plan is not armed repeatedly`() {
    val source = plan("work", now + TimeUnit.HOURS.toMillis(12))
    val key = AlarmPyoAlarmSafetyPolicy.planKey(source)

    assertNull(AlarmPyoAlarmSafetyPolicy.target(listOf(source), now, key))
  }

  @Test
  fun `an armed late-window check is reused instead of being postponed on every sync`() {
    val target = requireNotNull(
      AlarmPyoAlarmSafetyPolicy.target(
        listOf(plan("work", now + TimeUnit.HOURS.toMillis(2))),
        now
      )
    )

    assertTrue(
      AlarmPyoAlarmSafetyPolicy.canReuseArmedCheck(
        target.planKey,
        nextCheckAt = now + 30_000L,
        target = target.copy(checkAt = now + 60_000L),
        nowMillis = now + 10_000L
      )
    )
  }

  @Test
  fun `all required reliability issues are stable and deduplicated`() {
    val issues = AlarmPyoAlarmSafetyPolicy.issueCodes(
      exactAlarmAllowed = false,
      fullScreenAllowed = false,
      notificationsAllowed = false,
      doNotDisturbMaySilenceAlarm = true,
      batteryOptimizationIgnored = false,
      alarmVolume = 0,
      scheduleSynchronized = false,
      storageHealthy = false
    )

    assertEquals(8, issues.size)
    assertEquals(
      AlarmPyoAlarmSafetyPolicy.notificationKey("root", issues),
      AlarmPyoAlarmSafetyPolicy.notificationKey("root", issues.reversed())
    )
  }

  private fun plan(id: String, alarmAt: Long) = AlarmPyoAlarmPlan(
    id = id,
    dateKey = "2026-08-12",
    shiftTypeId = "day",
    shiftName = "주간",
    alarmAt = alarmAt,
    originalAlarmAt = alarmAt,
    rootPlanId = id
  )
}
