package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmStoreTest {
  private val workPlan = AlarmPyoAlarmPlan(
    id = "day-2026-08-10",
    dateKey = "2026-08-10",
    shiftTypeId = "day",
    shiftName = "주간",
    alarmAt = 1_807_543_800_000L,
    startMinutes = 7 * 60,
    alarmMinutesBefore = 110
  )
  private val repeatPlan = AlarmPyoAlarmPlan(
    id = "day-2026-08-10$SINGLE_REPEAT_ID_SUFFIX",
    dateKey = "",
    shiftTypeId = "day",
    shiftName = "주간",
    alarmAt = workPlan.alarmAt + 300_000L,
    originalAlarmAt = workPlan.alarmAt + 300_000L,
    rootPlanId = workPlan.id,
    repeatStage = SINGLE_REPEAT_STAGE
  )

  @Test
  fun `v2 snapshot protects plans scheduled ids and single repeats`() {
    val snapshot = AlarmPyoAlarmScheduleSnapshot(
      plans = listOf(workPlan),
      scheduledIds = setOf(workPlan.id),
      singleRepeats = listOf(repeatPlan),
      generation = 4L,
      committedAt = 1_807_000_000_000L
    )

    val decoded = AlarmPyoAlarmSnapshotCodec.decode(AlarmPyoAlarmSnapshotCodec.create(snapshot))

    assertNotNull(decoded)
    requireNotNull(decoded)
    assertEquals(snapshot, decoded)
  }

  @Test
  fun `checksum mismatch is treated as corruption`() {
    val envelope = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(generation = 2L))

    assertNull(AlarmPyoAlarmSnapshotCodec.decode(envelope.copy(payload = envelope.payload + " ")))
    assertNull(AlarmPyoAlarmSnapshotCodec.decode(envelope.copy(checksum = "00")))
  }

  @Test
  fun `valid previous snapshot recovers a corrupt primary snapshot`() {
    val previous = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(generation = 3L))
    val corruptPrimary = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(generation = 4L))
      .copy(checksum = "broken")

    val (selected, recovered) = AlarmPyoAlarmSnapshotCodec.selectBest(
      corruptPrimary,
      previous
    )

    assertTrue(recovered)
    assertEquals(3L, selected?.generation)
  }

  @Test
  fun `valid empty snapshot is distinct from two corrupt snapshots`() {
    val validEmpty = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(generation = 1L))
    val corrupt = validEmpty.copy(checksum = "broken")

    val (emptySelection, emptyRecovered) = AlarmPyoAlarmSnapshotCodec.selectBest(validEmpty, null)
    val (corruptSelection, corruptRecovered) = AlarmPyoAlarmSnapshotCodec.selectBest(corrupt, corrupt)

    assertNotNull(emptySelection)
    assertFalse(emptyRecovered)
    assertNull(corruptSelection)
    assertFalse(corruptRecovered)
  }

  private fun emptySnapshot(generation: Long) = AlarmPyoAlarmScheduleSnapshot(
    plans = emptyList(),
    scheduledIds = emptySet(),
    singleRepeats = emptyList(),
    generation = generation,
    committedAt = 1_807_000_000_000L + generation
  )
}
