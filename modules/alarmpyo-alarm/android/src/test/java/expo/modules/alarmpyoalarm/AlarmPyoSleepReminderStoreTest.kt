package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoSleepReminderStoreTest {
  private val plan = AlarmPyoSleepReminderPlan(
    id = "sleep-reminder:day:2027-01-15",
    reminderAt = 1_800_000_000_000L,
    shiftDate = "2027-01-15",
    shiftName = "주간",
    title = "수면 시작 시간이에요",
    body = "주간 전환 수면 목표 시각이에요. 지금 주무세요.",
    localDateKey = "2027-01-15",
    localMinutes = 21 * 60 + 10
  )

  @Test
  fun `v2 envelope protects a generated snapshot with a checksum`() {
    val snapshot = AlarmPyoSleepReminderSnapshot(
      plans = listOf(plan),
      scheduledIds = setOf(plan.id),
      generation = 4L
    )

    val decoded = AlarmPyoSleepReminderSnapshotCodec.decode(
      AlarmPyoSleepReminderSnapshotCodec.create(snapshot)
    )

    assertEquals(snapshot, decoded)
  }

  @Test
  fun `checksum mismatch is corrupt instead of an empty plan`() {
    val envelope = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(2L))

    assertNull(
      AlarmPyoSleepReminderSnapshotCodec.decode(envelope.copy(payload = envelope.payload + " "))
    )
    assertNull(AlarmPyoSleepReminderSnapshotCodec.decode(envelope.copy(generation = 3L)))
    assertNull(AlarmPyoSleepReminderSnapshotCodec.decode(envelope.copy(checksum = "broken")))
  }

  @Test
  fun `a valid previous snapshot recovers a corrupt current snapshot`() {
    val previous = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(3L))
    val corruptCurrent = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(4L))
      .copy(checksum = "broken")

    val (selected, recovered) = AlarmPyoSleepReminderSnapshotCodec.selectBest(
      corruptCurrent,
      previous
    )

    assertTrue(recovered)
    assertEquals(3L, selected?.generation)
  }

  @Test
  fun `two corrupt generations do not become a successful empty snapshot`() {
    val corrupt = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(1L))
      .copy(checksum = "broken")

    val (selected, recovered) = AlarmPyoSleepReminderSnapshotCodec.selectBest(corrupt, corrupt)

    assertNull(selected)
    assertFalse(recovered)
  }

  @Test
  fun `authoritative reseed ignores corrupt declared generations`() {
    val corruptCurrent = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(8L))
      .copy(checksum = "broken-current")
    val corruptPrevious = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(7L))
      .copy(checksum = "broken-previous")
    val (selected, _) = AlarmPyoSleepReminderSnapshotCodec.selectBest(
      corruptCurrent,
      corruptPrevious
    )

    assertNull(selected)
    assertEquals(
      1L,
      AlarmPyoSleepReminderSnapshotCodec.nextGenerationForReseed(
        corruptCurrent,
        corruptPrevious
      )
    )
    assertEquals(
      1L,
      AlarmPyoSleepReminderSnapshotCodec.nextGenerationForReseed(
        corruptCurrent.copy(generation = Long.MAX_VALUE),
        null
      )
    )
    assertEquals(
      1L,
      AlarmPyoSleepReminderSnapshotCodec.nextGenerationForReseed(
        corruptCurrent.copy(generation = Long.MAX_VALUE - 1L),
        null
      )
    )
  }

  @Test
  fun `legacy v1 snapshot remains readable and can be promoted on the first write`() {
    val legacy = AlarmPyoSleepReminderSnapshot(listOf(plan), setOf(plan.id))
    val decodedLegacy = AlarmPyoSleepReminderSnapshotCodec.decodeLegacy(
      AlarmPyoSleepReminderSnapshotCodec.encode(legacy)
    )

    assertNotNull(decodedLegacy)
    requireNotNull(decodedLegacy)
    assertEquals(0L, decodedLegacy.generation)
    val promoted = decodedLegacy.copy(generation = 1L)
    assertEquals(
      promoted,
      AlarmPyoSleepReminderSnapshotCodec.decode(
        AlarmPyoSleepReminderSnapshotCodec.create(promoted)
      )
    )
  }

  @Test
  fun `status exposes recovered and corrupt storage health values`() {
    val recovered = AlarmPyoSleepReminderStatus(
      enabled = true,
      notificationsAllowed = true,
      scheduledCount = 1,
      storageHealth = AlarmPyoSleepReminderStorageHealth.RECOVERED
    )
    val corrupt = recovered.copy(
      enabled = false,
      scheduledCount = 0,
      storageHealth = AlarmPyoSleepReminderStorageHealth.CORRUPT
    )

    assertEquals("recovered", recovered.toMap()["storageHealth"])
    assertEquals("corrupt", corrupt.toMap()["storageHealth"])
  }

  @Test
  fun `store flow restores corrupt current from previous and rewrites current`() {
    val previous = AlarmPyoSleepReminderSnapshotCodec.create(
      AlarmPyoSleepReminderSnapshot(listOf(plan), setOf(plan.id), generation = 3L)
    )
    val corruptCurrent = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(4L))
      .copy(checksum = "broken-current")
    val persistence = FakeSleepReminderPersistence(
      current = corruptCurrent,
      previous = previous
    )

    val recovered = AlarmPyoSleepReminderStoreEngine(persistence).read()

    assertEquals(3L, recovered?.generation)
    assertEquals(listOf(plan), recovered?.plans)
    assertEquals(
      recovered,
      persistence.current?.let(AlarmPyoSleepReminderSnapshotCodec::decode)
    )
    assertEquals(previous, persistence.previous)
    assertEquals(AlarmPyoSleepReminderStorageHealth.RECOVERED, persistence.health)
    assertEquals(1, persistence.currentWriteCount)
  }

  @Test
  fun `store flow promotes legacy v1 on first normal write`() {
    val legacy = AlarmPyoSleepReminderSnapshot(listOf(plan), setOf(plan.id))
    val persistence = FakeSleepReminderPersistence(
      legacyRaw = AlarmPyoSleepReminderSnapshotCodec.encode(legacy)
    )
    val store = AlarmPyoSleepReminderStoreEngine(persistence)

    val loaded = store.read()
    val promoted = store.write(requireNotNull(loaded))

    assertEquals(0L, loaded.generation)
    assertEquals(1L, promoted.generation)
    assertEquals(
      promoted,
      persistence.current?.let(AlarmPyoSleepReminderSnapshotCodec::decode)
    )
    assertNull(persistence.legacyRaw)
    assertTrue(persistence.legacyCleared)
    assertEquals(AlarmPyoSleepReminderStorageHealth.NORMAL, persistence.health)
  }

  @Test
  fun `two corrupt store generations keep reboot sleep restore journal pending`() {
    val current = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(5L))
      .copy(checksum = "broken-current")
    val previous = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(4L))
      .copy(payload = "broken-previous")
    val persistence = FakeSleepReminderPersistence(current = current, previous = previous)

    val restored = AlarmPyoSleepReminderStoreEngine(persistence).read()
    val restoreState = AlarmPyoAlarmRestoreState(
      workAlarmPending = false,
      recalculateLocalTimes = false,
      attemptCount = 0,
      lastAttemptAt = 0L,
      completedAt = 0L,
      retryAt = 0L,
      expectedCount = 0,
      scheduledCount = 0,
      sleepReminderPending = true,
      journalId = 11L
    )
    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      restoreState,
      result = null,
      nowMillis = 1_000L,
      sleepRemindersCompleted = restored != null
    )

    assertNull(restored)
    assertEquals(AlarmPyoSleepReminderStorageHealth.CORRUPT, persistence.health)
    assertTrue(next.sleepReminderPending)
    assertTrue(next.hasPendingWork)
    assertTrue(next.retryAt > 1_000L)
    assertEquals(11L, next.journalId)
  }

  @Test
  fun `authoritative reseed replaces only current after both generations are corrupt`() {
    val corruptCurrent = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(8L))
      .copy(checksum = "broken-current")
    val corruptPrevious = AlarmPyoSleepReminderSnapshotCodec.create(emptySnapshot(7L))
      .copy(checksum = "broken-previous")
    val persistence = FakeSleepReminderPersistence(
      current = corruptCurrent,
      previous = corruptPrevious
    )
    val store = AlarmPyoSleepReminderStoreEngine(persistence)
    assertNull(store.read())

    val reseeded = store.reseedAfterCorruption(
      AlarmPyoSleepReminderSnapshot(listOf(plan), emptySet())
    )

    assertEquals(1L, reseeded.generation)
    assertEquals(
      reseeded,
      persistence.current?.let(AlarmPyoSleepReminderSnapshotCodec::decode)
    )
    assertEquals(corruptPrevious, persistence.previous)
    assertEquals(AlarmPyoSleepReminderStorageHealth.RECOVERED, persistence.health)
  }

  private fun emptySnapshot(generation: Long) = AlarmPyoSleepReminderSnapshot(
    plans = emptyList(),
    scheduledIds = emptySet(),
    generation = generation
  )

  private class FakeSleepReminderPersistence(
    var legacyRaw: String? = null,
    var current: AlarmPyoSleepReminderSnapshotEnvelope? = null,
    var previous: AlarmPyoSleepReminderSnapshotEnvelope? = null,
    var health: AlarmPyoSleepReminderStorageHealth =
      AlarmPyoSleepReminderStorageHealth.NORMAL
  ) : AlarmPyoSleepReminderPersistence {
    var legacyCleared = false
    var currentWriteCount = 0

    override fun hasV2Values(): Boolean = current != null || previous != null

    override fun readLegacy(): Result<String?> = Result.success(legacyRaw)

    override fun readCurrent(): AlarmPyoSleepReminderSnapshotEnvelope? = current

    override fun readPrevious(): AlarmPyoSleepReminderSnapshotEnvelope? = previous

    override fun writeCurrent(envelope: AlarmPyoSleepReminderSnapshotEnvelope) {
      current = envelope
      currentWriteCount += 1
    }

    override fun writePrevious(envelope: AlarmPyoSleepReminderSnapshotEnvelope) {
      previous = envelope
    }

    override fun clearLegacy() {
      legacyRaw = null
      legacyCleared = true
    }

    override fun readHealth(): AlarmPyoSleepReminderStorageHealth = health

    override fun writeHealth(health: AlarmPyoSleepReminderStorageHealth) {
      this.health = health
    }
  }
}
