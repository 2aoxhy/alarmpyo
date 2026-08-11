package expo.modules.alarmpyoalarm

import android.content.Intent
import java.util.GregorianCalendar
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmSchedulerTest {
  private val basePlan = AlarmPyoAlarmPlan(
    id = "day-alarm",
    dateKey = "2026-07-14",
    shiftTypeId = "day",
    shiftName = "주간",
    alarmAt = 1L,
    startMinutes = 7 * 60,
    alarmMinutesBefore = 2 * 60
  )

  @Test
  fun coldStartReconcileRunsOnlyOnceAfterSuccess() {
    val reconciler = AlarmPyoAlarmColdStartReconciler()
    var calls = 0

    reconciler.reconcileOnce { calls += 1 }
    reconciler.reconcileOnce { calls += 1 }

    assertEquals(1, calls)
  }

  @Test
  fun failedColdStartReconcileCanRetry() {
    val reconciler = AlarmPyoAlarmColdStartReconciler()
    var calls = 0

    assertThrows(IllegalStateException::class.java) {
      reconciler.reconcileOnce {
        calls += 1
        error("reconcile failed")
      }
    }
    reconciler.reconcileOnce { calls += 1 }

    assertEquals(2, calls)
  }

  @Test
  fun anEarlierSuccessfulSyncSkipsColdStartReconcile() {
    val reconciler = AlarmPyoAlarmColdStartReconciler()
    var calls = 0

    reconciler.markReconciled()
    reconciler.reconcileOnce { calls += 1 }

    assertEquals(0, calls)
  }

  @Test
  fun calculatesAlarmFromLocalDateStartAndLeadTime() {
    val zone = TimeZone.getTimeZone("Asia/Seoul")
    val expected = GregorianCalendar(zone).apply {
      clear()
      set(2026, 6, 14, 5, 0, 0)
    }.timeInMillis

    assertEquals(expected, AlarmPyoAlarmScheduler.calculateLocalAlarmAt(basePlan, zone))
  }

  @Test
  fun recalculatesEpochWhenTimeZoneChanges() {
    val seoul = AlarmPyoAlarmScheduler.calculateLocalAlarmAt(
      basePlan,
      TimeZone.getTimeZone("Asia/Seoul")
    )
    val utc = AlarmPyoAlarmScheduler.calculateLocalAlarmAt(basePlan, TimeZone.getTimeZone("UTC"))

    assertNotEquals(seoul, utc)
  }

  @Test
  fun movesLeadTimeAcrossPreviousLocalDay() {
    val zone = TimeZone.getTimeZone("Asia/Seoul")
    val plan = basePlan.copy(startMinutes = 60, alarmMinutesBefore = 120)
    val expected = GregorianCalendar(zone).apply {
      clear()
      set(2026, 6, 13, 23, 0, 0)
    }.timeInMillis

    assertEquals(expected, AlarmPyoAlarmScheduler.calculateLocalAlarmAt(plan, zone))
  }

  @Test
  fun keepsLegacyPlanWithoutLocalTimeMetadataUntouched() {
    assertNull(
      AlarmPyoAlarmScheduler.calculateLocalAlarmAt(
        basePlan.copy(startMinutes = -1, alarmMinutesBefore = -1),
        TimeZone.getTimeZone("Asia/Seoul")
      )
    )
  }

  @Test
  fun statusSelectionOnlyReadsKnownScheduledPlansWithoutChangingInputs() {
    val later = basePlan.copy(id = "later", alarmAt = 300L)
    val earlier = basePlan.copy(id = "earlier", alarmAt = 100L)
    val unscheduled = basePlan.copy(id = "not-scheduled", alarmAt = 50L)
    val plans = mutableListOf(later, unscheduled, earlier)
    val scheduledIds = mutableSetOf(later.id, earlier.id, "missing")

    val selected = AlarmPyoAlarmScheduler.selectScheduledPlans(plans, scheduledIds)

    assertEquals(listOf(earlier, later), selected)
    assertEquals(listOf(later, unscheduled, earlier), plans)
    assertEquals(setOf(later.id, earlier.id, "missing"), scheduledIds)
  }

  @Test
  fun restoreExpectationMatchesOnlyTheThreeSchedulablePlans() {
    val plans = listOf(
      basePlan.copy(id = "first"),
      basePlan.copy(id = "exhausted", deliveryAttempt = 5),
      basePlan.copy(id = "second"),
      basePlan.copy(id = "third"),
      basePlan.copy(id = "fourth")
    )

    assertEquals(
      listOf("first", "second", "third"),
      AlarmPyoAlarmScheduler.selectRestorableSchedule(plans).map(AlarmPyoAlarmPlan::id)
    )
  }

  @Test
  fun scheduleTransitionKeepsOnlyThePreviousGenerationNeededForSafeReplacement() {
    val previousSameId = basePlan.copy(alarmAt = 100L, originalAlarmAt = 100L)
    val previousRemoved = basePlan.copy(
      id = "removed",
      alarmAt = 150L,
      originalAlarmAt = 150L
    )
    val desired = basePlan.copy(alarmAt = 200L, originalAlarmAt = 200L)

    val transition = AlarmPyoAlarmScheduler.transitionPlans(
      listOf(previousSameId, previousRemoved),
      listOf(desired)
    )

    assertEquals(listOf(desired, previousSameId), transition)
  }

  @Test
  fun identicalScheduleGenerationIsNotDuplicatedDuringTransition() {
    assertEquals(
      listOf(basePlan),
      AlarmPyoAlarmScheduler.transitionPlans(listOf(basePlan), listOf(basePlan.copy()))
    )
  }

  @Test
  fun singleRepeatUsesADistinctIdAndStartsANewGraceWindow() {
    val snoozeAt = 1_785_000_000_000L
    val snoozed = AlarmPyoAlarmScheduler.createSingleRepeatPlan(
      basePlan.copy(deliveryAttempt = 3),
      snoozeAt
    )

    assertEquals("day-alarm$SINGLE_REPEAT_ID_SUFFIX", snoozed.id)
    assertEquals("day-alarm", snoozed.rootPlanId)
    assertEquals(SINGLE_REPEAT_STAGE, snoozed.repeatStage)
    assertEquals(snoozeAt, snoozed.alarmAt)
    assertEquals(snoozeAt, snoozed.originalAlarmAt)
    assertEquals(0, snoozed.deliveryAttempt)
    assertEquals(-1, snoozed.startMinutes)
    assertEquals(-1, snoozed.alarmMinutesBefore)
    assertEquals("", snoozed.dateKey)
  }

  @Test
  fun automaticRepeatIsArmedAfterAnySuccessfulNonRepeatDelivery() {
    assertEquals(true, AlarmPyoAlarmScheduler.shouldArmAutomaticSingleRepeat(basePlan))
    assertEquals(
      true,
      AlarmPyoAlarmScheduler.shouldArmAutomaticSingleRepeat(basePlan.copy(deliveryAttempt = 1))
    )
    assertEquals(
      false,
      AlarmPyoAlarmScheduler.shouldArmAutomaticSingleRepeat(
        AlarmPyoAlarmScheduler.createSingleRepeatPlan(basePlan, 100L)
      )
    )
  }

  @Test
  fun alarmSyncMetadataRequiresGeneratedRefreshAndSafetyOrder() {
    val valid = AlarmPyoAlarmSyncMetadataRecord(
      generatedAt = 100.0,
      refreshRecommendedAt = 200.0,
      safetyThroughAt = 300.0
    ).toValidatedMetadata()

    assertEquals(AlarmPyoAlarmSyncMetadata(100L, 200L, 300L), valid)
    assertNull(
      AlarmPyoAlarmSyncMetadataRecord(
        generatedAt = 300.0,
        refreshRecommendedAt = 200.0,
        safetyThroughAt = 100.0
      ).toValidatedMetadata()
    )
  }

  @Test
  fun manualAndAutomaticRepeatShareExactlyOneSlot() {
    val automatic = AlarmPyoAlarmScheduler.createSingleRepeatPlan(basePlan, 100L)
    val manual = AlarmPyoAlarmScheduler.createSingleRepeatPlan(basePlan, 200L)
    val merged = AlarmPyoAlarmScheduler.upsertSingleRepeat(listOf(automatic), manual)

    assertEquals(1, merged.size)
    assertEquals(200L, merged.single().alarmAt)
  }

  @Test
  fun dismissRemovesTheSingleRepeatSlot() {
    val repeat = AlarmPyoAlarmScheduler.createSingleRepeatPlan(basePlan, 100L)
    assertEquals(
      emptyList<AlarmPyoAlarmPlan>(),
      AlarmPyoAlarmScheduler.removeSingleRepeat(listOf(repeat), basePlan.id)
    )
  }

  @Test
  fun rebootRestoresWorkRepeatButDropsTestAndExpiredRepeats() {
    val now = 1_000_000L
    val work = AlarmPyoAlarmScheduler.createSingleRepeatPlan(basePlan, now + 1_000L)
    val test = AlarmPyoAlarmScheduler.createSingleRepeatPlan(
      basePlan.copy(id = "__alarmpyo_test_alarm__", rootPlanId = "__alarmpyo_test_alarm__", shiftTypeId = "test"),
      now + 1_000L
    )
    val expired = AlarmPyoAlarmScheduler.createSingleRepeatPlan(
      basePlan.copy(id = "old", rootPlanId = "old"),
      now - AlarmPyoAlarmScheduler.MISSED_ALARM_GRACE_MILLIS - 1L
    )

    val restored = AlarmPyoAlarmScheduler.restorableSingleRepeats(
      listOf(test, expired, work),
      now
    )

    assertEquals(listOf(work), restored)
  }

  @Test
  fun deliveryGenerationIncludesAlarmOriginalTimeAndAttempt() {
    assertEquals(true, basePlan.hasSameDeliveryGeneration(basePlan.copy()))
    assertEquals(false, basePlan.hasSameDeliveryGeneration(basePlan.copy(alarmAt = 2L)))
    assertEquals(
      false,
      basePlan.hasSameDeliveryGeneration(basePlan.copy(originalAlarmAt = 2L))
    )
    assertEquals(
      false,
      basePlan.hasSameDeliveryGeneration(basePlan.copy(deliveryAttempt = 1))
    )
    assertEquals(
      false,
      basePlan.hasSameDeliveryGeneration(basePlan.copy(repeatStage = SINGLE_REPEAT_STAGE))
    )
    assertEquals(
      false,
      basePlan.hasSameDeliveryGeneration(basePlan.copy(rootPlanId = "another-root"))
    )
  }

  @Test
  fun retryReplacesOnlyTheExactStoredDeliveryGeneration() {
    val other = basePlan.copy(id = "other", alarmAt = 50L)
    val retry = basePlan.copy(alarmAt = 200L, originalAlarmAt = 100L, deliveryAttempt = 1)

    assertEquals(
      listOf(other, retry),
      AlarmPyoAlarmScheduler.replacePlanGeneration(listOf(basePlan, other), basePlan, retry)
    )
    assertNull(
      AlarmPyoAlarmScheduler.replacePlanGeneration(
        listOf(basePlan),
        basePlan.copy(deliveryAttempt = 2),
        retry
      )
    )
  }

  @Test
  fun repeatMetadataSurvivesStorageAndLegacySnoozeIsMigrated() {
    val repeat = AlarmPyoAlarmScheduler.createSingleRepeatPlan(basePlan, 500L)
    assertEquals(repeat, AlarmPyoAlarmPlan.fromJson(repeat.toJson()))

    val legacy = AlarmPyoAlarmPlan.fromJson(
      basePlan.copy(id = "day-alarm:snooze").toJson().apply {
        remove("repeatStage")
        remove("rootPlanId")
      }
    )
    assertEquals(SINGLE_REPEAT_STAGE, legacy?.repeatStage)
    assertEquals("day-alarm", legacy?.rootPlanId)
  }

  @Test
  fun workPlanSurvivesDurableStorageWithoutAnyProcessMemory() {
    val stored = basePlan.copy(
      alarmAt = 1_785_000_000_000L,
      originalAlarmAt = 1_785_000_000_000L,
      deliveryAttempt = 2
    )

    assertEquals(stored, AlarmPyoAlarmPlan.fromJson(stored.toJson()))
  }

  @Test
  fun durableAlarmWriteFailureIsNeverReportedAsSuccess() {
    AlarmPyoAlarmStore.requireCommitted(true, "알람 계획")

    val error = assertThrows(IllegalStateException::class.java) {
      AlarmPyoAlarmStore.requireCommitted(false, "알람 계획")
    }

    assertEquals("알람 계획 저장에 실패했어요.", error.message)
  }

  @Test
  fun freshInstallNeedsNoCredentialStorageMigration() {
    assertTrue(AlarmPyoAlarmStore.isStorageMigrationReady(false, false))
    assertTrue(AlarmPyoAlarmStore.isStorageMigrationReady(true, true))
    assertFalse(AlarmPyoAlarmStore.isStorageMigrationReady(true, false))
  }

  @Test
  fun rebootAndPackageReplacementRestorePersistedAlarms() {
    assertTrue(shouldRestorePersistedAlarms(Intent.ACTION_BOOT_COMPLETED))
    assertTrue(shouldRestorePersistedAlarms(Intent.ACTION_LOCKED_BOOT_COMPLETED))
    assertTrue(shouldRestorePersistedAlarms(Intent.ACTION_MY_PACKAGE_REPLACED))
    assertTrue(shouldRestorePersistedAlarms(ACTION_RETRY_ALARMPYO_ALARM_RESTORE))
    assertFalse(shouldRestorePersistedAlarms(Intent.ACTION_DATE_CHANGED))
    assertFalse(shouldRestorePersistedAlarms("unrelated-action"))
  }
}
