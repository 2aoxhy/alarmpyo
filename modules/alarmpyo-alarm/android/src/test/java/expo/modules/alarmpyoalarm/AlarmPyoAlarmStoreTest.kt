package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
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
  fun `current snapshot protects plans scheduled ids and single repeats`() {
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
  fun `current checksum protects generation and committed timestamp`() {
    val envelope = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(generation = 2L))

    assertNull(AlarmPyoAlarmSnapshotCodec.decode(envelope.copy(generation = 3L)))
    assertNull(AlarmPyoAlarmSnapshotCodec.decode(envelope.copy(committedAt = Long.MAX_VALUE)))
  }

  @Test
  fun `legacy metadata cannot make previous outrank a valid primary`() {
    val primary = AlarmPyoAlarmSnapshotCodec.createLegacy(
      emptySnapshot(1L).copy(plans = listOf(workPlan))
    )
    val previous = AlarmPyoAlarmSnapshotCodec.createLegacy(
      emptySnapshot(Long.MAX_VALUE).copy(committedAt = Long.MAX_VALUE)
    )

    val (selected, recovered) = AlarmPyoAlarmSnapshotCodec.selectBest(primary, previous)

    assertEquals(listOf(workPlan), selected?.plans)
    assertFalse(recovered)
  }

  @Test
  fun `normal read promotes legacy payload with fresh protected metadata`() {
    val legacy = AlarmPyoAlarmSnapshotCodec.createLegacy(
      emptySnapshot(Long.MAX_VALUE).copy(
        plans = listOf(workPlan),
        committedAt = Long.MAX_VALUE
      )
    )
    val persistence = FakeSnapshotPersistence(
      primary = legacy,
      previous = null,
      storedHealth = AlarmPyoAlarmStorageHealth.NORMAL
    )
    val engine = AlarmPyoAlarmStoreEngine(persistence) { 1_900_000_000_000L }

    val promoted = engine.read()

    assertEquals(listOf(workPlan), promoted?.plans)
    assertEquals(1L, promoted?.generation)
    assertEquals(1_900_000_000_000L, promoted?.committedAt)
    assertEquals(AlarmPyoAlarmSnapshotCodec.SCHEMA_VERSION, persistence.primary?.schemaVersion)
    assertNull(
      persistence.primary?.copy(generation = 2L)?.let(AlarmPyoAlarmSnapshotCodec::decode)
    )
  }

  @Test
  fun `protected max metadata rolls over without selecting previous`() {
    val maxSnapshot = emptySnapshot(Long.MAX_VALUE).copy(committedAt = Long.MAX_VALUE)
    val persistence = FakeSnapshotPersistence(
      primary = AlarmPyoAlarmSnapshotCodec.create(maxSnapshot),
      previous = null,
      storedHealth = AlarmPyoAlarmStorageHealth.NORMAL
    )
    val engine = AlarmPyoAlarmStoreEngine(persistence) { 1_900_000_000_000L }

    val written = engine.write { it.copy(plans = listOf(workPlan)) }

    assertEquals(1L, written.generation)
    assertEquals(1_900_000_000_000L, written.committedAt)
    assertEquals(written, engine.read())
    assertEquals(maxSnapshot, persistence.previous?.let(AlarmPyoAlarmSnapshotCodec::decode))
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

  @Test
  fun `ordinary mutation rejects two corrupt generations without changing envelopes`() {
    val corruptPrimary = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(8L))
      .copy(checksum = "broken-primary")
    val corruptPrevious = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(7L))
      .copy(checksum = "broken-previous")
    val persistence = FakeSnapshotPersistence(corruptPrimary, corruptPrevious)
    val engine = AlarmPyoAlarmStoreEngine(persistence) { 1_900_000_000_000L }

    val error = assertThrows(AlarmPyoAlarmStoreMutationException::class.java) {
      engine.write { it.copy(plans = listOf(workPlan)) }
    }

    assertEquals(AlarmPyoAlarmStoreFailureCode.CORRUPT_SNAPSHOT, error.code)
    assertEquals(corruptPrimary, persistence.primary)
    assertEquals(corruptPrevious, persistence.previous)
    assertEquals(AlarmPyoAlarmStorageHealth.CORRUPT, persistence.storedHealth)
  }

  @Test
  fun `authoritative non-empty reseed replaces current but preserves corrupt previous`() {
    val corruptPrimary = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(8L))
      .copy(checksum = "broken-primary")
    val corruptPrevious = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(7L))
      .copy(checksum = "broken-previous")
    val persistence = FakeSnapshotPersistence(corruptPrimary, corruptPrevious)
    val engine = AlarmPyoAlarmStoreEngine(persistence) { 1_900_000_000_000L }

    engine.read()
    val reseeded = engine.reseedAfterCorruption(
      emptySnapshot(0L).copy(plans = listOf(workPlan))
    )

    assertEquals(listOf(workPlan), reseeded.plans)
    assertEquals(1L, reseeded.generation)
    assertEquals(reseeded, persistence.primary?.let(AlarmPyoAlarmSnapshotCodec::decode))
    assertEquals(corruptPrevious, persistence.previous)
    assertEquals(AlarmPyoAlarmStorageHealth.CORRUPT, persistence.storedHealth)

    engine.markHealthy()
    assertEquals(AlarmPyoAlarmStorageHealth.NORMAL, persistence.storedHealth)
  }

  @Test
  fun `authoritative empty reseed is distinct from accidental empty fallback`() {
    val corrupt = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(3L))
      .copy(checksum = "broken")
    val persistence = FakeSnapshotPersistence(corrupt, corrupt)
    val engine = AlarmPyoAlarmStoreEngine(persistence) { 1_900_000_000_000L }

    engine.read()
    val reseeded = engine.reseedAfterCorruption(emptySnapshot(0L))

    assertTrue(reseeded.plans.isEmpty())
    assertTrue(reseeded.scheduledIds.isEmpty())
    assertTrue(reseeded.singleRepeats.isEmpty())
    assertEquals(corrupt, persistence.previous)
    assertEquals(AlarmPyoAlarmStorageHealth.CORRUPT, persistence.storedHealth)
  }

  @Test
  fun `interrupted recovery preserves reseed and corrupt previous for retry`() {
    val corruptPrimary = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(8L))
      .copy(checksum = "broken-primary")
    val corruptPrevious = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(7L))
      .copy(checksum = "broken-previous")
    val persistence = FakeSnapshotPersistence(corruptPrimary, corruptPrevious)
    val engine = AlarmPyoAlarmStoreEngine(persistence) { 1_900_000_000_000L }
    engine.read()
    val reseeded = engine.reseedAfterCorruption(
      emptySnapshot(0L).copy(plans = listOf(workPlan))
    )
    val reseededEnvelope = persistence.primary
    persistence.failNextPrimaryWrite = true

    assertThrows(IllegalStateException::class.java) {
      engine.write(allowCorruptRecovery = true) {
        it.copy(scheduledIds = setOf(workPlan.id))
      }
    }

    assertEquals(reseeded, reseededEnvelope?.let(AlarmPyoAlarmSnapshotCodec::decode))
    assertEquals(reseededEnvelope, persistence.primary)
    assertEquals(corruptPrevious, persistence.previous)
    assertEquals(AlarmPyoAlarmStorageHealth.CORRUPT, persistence.storedHealth)
  }

  @Test
  fun `explicit cancellation tombstone prevents previous active generation revival`() {
    val active = emptySnapshot(4L).copy(plans = listOf(workPlan))
    val persistence = FakeSnapshotPersistence(
      primary = AlarmPyoAlarmSnapshotCodec.create(active),
      previous = AlarmPyoAlarmSnapshotCodec.create(emptySnapshot(3L)),
      storedHealth = AlarmPyoAlarmStorageHealth.NORMAL
    )
    val engine = AlarmPyoAlarmStoreEngine(persistence) { 1_900_000_000_000L }

    val tombstone = engine.commitCancellationTombstone()
    persistence.primary = persistence.primary?.copy(checksum = "broken")
    val recovered = engine.read()

    assertTrue(tombstone.plans.isEmpty())
    assertEquals(tombstone.generation, persistence.rollbackFloor)
    assertTrue(recovered?.plans?.isEmpty() == true)
    assertEquals(tombstone.generation, recovered?.generation)
    assertEquals(AlarmPyoAlarmStorageHealth.RECOVERED, persistence.storedHealth)
  }

  private fun emptySnapshot(generation: Long) = AlarmPyoAlarmScheduleSnapshot(
    plans = emptyList(),
    scheduledIds = emptySet(),
    singleRepeats = emptyList(),
    generation = generation,
    committedAt = 1_807_000_000_000L + generation.coerceIn(0L, 1_000_000L)
  )

  private class FakeSnapshotPersistence(
    var primary: AlarmPyoAlarmSnapshotEnvelope?,
    var previous: AlarmPyoAlarmSnapshotEnvelope?,
    var storedHealth: AlarmPyoAlarmStorageHealth = AlarmPyoAlarmStorageHealth.CORRUPT
  ) : AlarmPyoAlarmSnapshotPersistence {
    var failNextPrimaryWrite = false
    var rollbackFloor = 0L

    override fun readPrimary(): AlarmPyoAlarmSnapshotEnvelope? = primary

    override fun readPrevious(): AlarmPyoAlarmSnapshotEnvelope? = previous

    override fun writePrimary(envelope: AlarmPyoAlarmSnapshotEnvelope) {
      if (failNextPrimaryWrite) {
        failNextPrimaryWrite = false
        error("simulated primary write failure")
      }
      primary = envelope
    }

    override fun writePrevious(envelope: AlarmPyoAlarmSnapshotEnvelope) {
      previous = envelope
    }

    override fun readHealth(): AlarmPyoAlarmStorageHealth = storedHealth

    override fun writeHealth(health: AlarmPyoAlarmStorageHealth) {
      storedHealth = health
    }

    override fun readRollbackFloor(): Long = rollbackFloor

    override fun writeRollbackFloor(generation: Long) {
      rollbackFloor = generation
    }
  }
}
