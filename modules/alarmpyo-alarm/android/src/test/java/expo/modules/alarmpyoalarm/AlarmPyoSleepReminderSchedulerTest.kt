package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Test

class AlarmPyoSleepReminderSchedulerTest {
  @Test
  fun `corrupt storage is not reseeded from an empty authoritative plan`() {
    val error = assertThrows(IllegalStateException::class.java) {
      requireAuthoritativePlansForCorruptSleepReminderReseed(0)
    }

    assertEquals(
      "수면 시작 알림 저장소가 손상됐지만 확인할 계획이 없어 빈 계획으로 덮어쓰지 않았어요.",
      error.message
    )
  }

  @Test
  fun `corrupt storage may be reseeded from a non-empty authoritative plan`() {
    requireAuthoritativePlansForCorruptSleepReminderReseed(1)
  }

  @Test
  fun `partial scheduling result is persisted before retryable failure is returned`() {
    val firstFailure = IllegalStateException("first")
    val secondFailure = SecurityException("second")
    val partial = AlarmPyoSleepReminderSnapshot(
      plans = emptyList(),
      scheduledIds = emptySet(),
      generation = 4L
    )
    var persisted: AlarmPyoSleepReminderSnapshot? = null

    val error = assertThrows(IllegalStateException::class.java) {
      persistSleepReminderReconciliation(
        partial,
        listOf("first-id" to firstFailure, "second-id" to secondFailure)
      ) { snapshot ->
        persisted = snapshot
        snapshot.copy(generation = snapshot.generation + 1L)
      }
    }

    assertEquals(partial, persisted)
    assertSame(firstFailure, error.cause)
    assertEquals(listOf(secondFailure), error.suppressed.toList())
    assertEquals("수면 시작 알림 2개를 예약하지 못해 다시 시도해요.", error.message)
  }

  @Test
  fun `complete scheduling returns the persisted snapshot`() {
    val result = AlarmPyoSleepReminderSnapshot(
      plans = emptyList(),
      scheduledIds = emptySet(),
      generation = 4L
    )
    val stored = result.copy(generation = 5L)

    assertEquals(
      stored,
      persistSleepReminderReconciliation(result, emptyList()) { stored }
    )
  }

  @Test
  fun `persistence failure remains the primary failure`() {
    val writeFailure = IllegalStateException("write")
    val schedulingFailure = SecurityException("schedule")

    val error = assertThrows(IllegalStateException::class.java) {
      persistSleepReminderReconciliation(
        AlarmPyoSleepReminderSnapshot(emptyList(), emptySet()),
        listOf("failed-id" to schedulingFailure)
      ) {
        throw writeFailure
      }
    }

    assertSame(writeFailure, error)
  }
}
