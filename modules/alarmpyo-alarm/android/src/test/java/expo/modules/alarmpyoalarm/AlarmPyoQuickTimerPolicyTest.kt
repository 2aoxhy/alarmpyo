package expo.modules.alarmpyoalarm

import android.content.Intent
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

class AlarmPyoQuickTimerPolicyTest {
  @Test
  fun `a fresh process restores once before timer status may reuse storage`() {
    val gate = AlarmPyoQuickTimerProcessSyncGate()
    var calls = 0

    assertFalse(gate.canReuseScheduledSnapshot())
    assertEquals("restored", gate.reconcileIfNeeded { calls += 1; "restored" })
    assertNull(gate.reconcileIfNeeded { calls += 1; "duplicate" })
    assertTrue(gate.canReuseScheduledSnapshot())
    assertEquals(1, calls)
  }

  @Test
  fun `failed process restore remains retryable for the next status read`() {
    val gate = AlarmPyoQuickTimerProcessSyncGate()

    runCatching {
      gate.reconcileIfNeeded { error("AlarmManager rejected registration") }
    }

    assertFalse(gate.canReuseScheduledSnapshot())
    assertEquals("retry", gate.reconcileIfNeeded { "retry" })
    assertTrue(gate.canReuseScheduledSnapshot())
  }

  @Test
  fun `explicit schedule or cancel marks the process timer state synchronized`() {
    val gate = AlarmPyoQuickTimerProcessSyncGate()

    gate.markSuccessfulSync()

    assertTrue(gate.canReuseScheduledSnapshot())
    assertNull(gate.reconcileIfNeeded { "unexpected restore" })
  }

  @Test
  fun `recovered replica forces one more registration in the same process`() {
    val gate = AlarmPyoQuickTimerProcessSyncGate().apply { markSuccessfulSync() }

    assertEquals("recovered", gate.reconcileIfNeeded(force = true) { "recovered" })
    assertTrue(gate.canReuseScheduledSnapshot())
  }

  @Test
  fun `failed forced registration reopens a previously completed process gate`() {
    val gate = AlarmPyoQuickTimerProcessSyncGate().apply { markSuccessfulSync() }

    runCatching {
      gate.reconcileIfNeeded(force = true) { error("AlarmManager rejected registration") }
    }

    assertFalse(gate.canReuseScheduledSnapshot())
    assertEquals("retry", gate.reconcileIfNeeded { "retry" })
  }

  @Test
  fun `failed status restore keeps quick timer pending in the restore journal`() {
    val now = 1_800_000_000_000L
    val pending = AlarmPyoQuickTimerRestoreJournalPolicy.markPending(null, now)

    assertTrue(pending.quickTimerPending)
    assertTrue(pending.retryAt > now)
    assertTrue(pending.journalId >= now)
    assertEquals(pending, AlarmPyoQuickTimerRestoreJournalPolicy.markPending(pending, now + 1L))
  }

  @Test
  fun `successful status restore clears only the timer journal work`() {
    val now = 1_800_000_000_000L
    val pending = AlarmPyoQuickTimerRestoreJournalPolicy.markPending(null, now)
    val completed = AlarmPyoQuickTimerRestoreJournalPolicy.markCompleted(pending, now + 1L)!!

    assertFalse(completed.quickTimerPending)
    assertFalse(completed.hasPendingWork)
    assertEquals(0L, completed.retryAt)
  }

  @Test
  fun `thirty forty five and sixty minute quick timers are accepted`() {
    assertTrue(AlarmPyoQuickTimerPolicy.isSupportedDuration(30))
    assertTrue(AlarmPyoQuickTimerPolicy.isSupportedDuration(45))
    assertTrue(AlarmPyoQuickTimerPolicy.isSupportedDuration(60))
    assertFalse(AlarmPyoQuickTimerPolicy.isSupportedDuration(0))
    assertFalse(AlarmPyoQuickTimerPolicy.isSupportedDuration(15))
  }

  @Test
  fun `paused timer persists its authoritative remaining duration without an active target`() {
    val active = activeSnapshot(generation = 21L)
    val remaining = TimeUnit.MINUTES.toMillis(17)

    val paused = AlarmPyoQuickTimerPolicy.pausedSnapshot(active, remaining)
      .copy(generation = 22L)
    val decoded = AlarmPyoQuickTimerCodec.decode(AlarmPyoQuickTimerCodec.encode(paused))!!

    assertFalse(decoded.isActive())
    assertTrue(decoded.isPaused())
    assertEquals(remaining, decoded.pausedRemainingMillis)
    assertEquals(0L, decoded.fireAtElapsed)
    assertEquals(-1, decoded.bootCount)
    assertEquals(active.plan, decoded.plan)
    assertEquals(active.durationMinutes, decoded.durationMinutes)
  }

  @Test
  fun `resuming a paused timer creates a new monotonic target from saved remaining time`() {
    val remaining = TimeUnit.MINUTES.toMillis(17)
    val paused = AlarmPyoQuickTimerPolicy.pausedSnapshot(
      activeSnapshot(generation = 21L),
      remaining
    )
    val nowWallClock = 1_900_000_000_000L
    val nowElapsed = 4_000L
    val resumedPlan = AlarmPyoQuickTimerPolicy.rebasePlanForRestore(
      paused.plan!!,
      nowWallClock,
      remaining
    )

    val resumed = AlarmPyoQuickTimerPolicy.resumedSnapshot(
      paused,
      resumedPlan,
      nowWallClock,
      nowElapsed,
      currentBootCount = 33
    )

    assertTrue(resumed.isActive())
    assertFalse(resumed.isPaused())
    assertEquals(0L, resumed.pausedRemainingMillis)
    assertEquals(nowWallClock + remaining, resumed.plan!!.alarmAt)
    assertEquals(nowElapsed + remaining, resumed.fireAtElapsed)
    assertEquals(
      remaining,
      AlarmPyoQuickTimerPolicy.remainingMillis(
        resumed,
        currentBootCount = 33,
        nowWallClock = nowWallClock,
        nowElapsed = nowElapsed
      )
    )
  }

  @Test
  fun `same boot countdown uses monotonic time and ignores wall clock changes`() {
    val snapshot = activeSnapshot(generation = 3L, bootCount = 12)

    val remaining = AlarmPyoQuickTimerPolicy.remainingMillis(
      snapshot,
      currentBootCount = 12,
      nowWallClock = snapshot.plan!!.alarmAt + TimeUnit.HOURS.toMillis(4),
      nowElapsed = snapshot.fireAtElapsed - TimeUnit.MINUTES.toMillis(7)
    )

    assertEquals(TimeUnit.MINUTES.toMillis(7), remaining)
  }

  @Test
  fun `wall clock jump rebases timer target without changing delivery lineage`() {
    val snapshot = activeSnapshot(generation = 3L, bootCount = 12)
    val oldPlan = snapshot.plan!!
    val remaining = TimeUnit.MINUTES.toMillis(7)
    val jumpedWallClock = oldPlan.alarmAt + TimeUnit.HOURS.toMillis(4)

    val restoredPlan = AlarmPyoQuickTimerPolicy.rebasePlanForRestore(
      plan = oldPlan,
      nowWallClock = jumpedWallClock,
      delayMillis = remaining
    )

    val expectedTarget = jumpedWallClock + remaining
    assertEquals(expectedTarget, restoredPlan.alarmAt)
    assertEquals(expectedTarget, restoredPlan.originalAlarmAt)
    assertEquals(oldPlan.rootPlanId, restoredPlan.rootPlanId)
    assertEquals(oldPlan.repeatStage, restoredPlan.repeatStage)
    assertEquals(oldPlan.deliveryAttempt, restoredPlan.deliveryAttempt)
    assertFalse(oldPlan.hasSameDeliveryGeneration(restoredPlan))
    assertEquals(
      0L,
      AlarmPyoQuickTimerPolicy.remainingMillis(
        snapshot = AlarmPyoQuickTimerPolicy.restoredSnapshot(
          snapshot = snapshot,
          restoredPlan = restoredPlan,
          nowElapsed = 2_000L,
          delayMillis = remaining,
          currentBootCount = 12
        ),
        currentBootCount = 12,
        nowWallClock = expectedTarget,
        nowElapsed = 2_000L + remaining
      )
    )
  }

  @Test
  fun `wall clock rebase preserves an existing retry grace interval`() {
    val base = activeSnapshot(generation = 3L).plan!!
    val retry = base.copy(
      alarmAt = base.originalAlarmAt + TimeUnit.MINUTES.toMillis(3),
      deliveryAttempt = 1
    )
    val previousGap = retry.alarmAt - retry.originalAlarmAt

    val restored = AlarmPyoQuickTimerPolicy.rebasePlanForRestore(
      retry,
      nowWallClock = retry.alarmAt - TimeUnit.HOURS.toMillis(2),
      delayMillis = TimeUnit.MINUTES.toMillis(2)
    )

    assertEquals(previousGap, restored.alarmAt - restored.originalAlarmAt)
    assertEquals(retry.deliveryAttempt, restored.deliveryAttempt)
  }

  @Test
  fun `time set rebases wall fallback before a later reboot`() {
    assertTrue(shouldRestoreQuickTimer(Intent.ACTION_TIME_CHANGED))
    assertFalse(shouldRestoreQuickTimer(Intent.ACTION_TIMEZONE_CHANGED))

    val scheduled = activeSnapshot(generation = 8L, bootCount = 12)
    val elapsedAfterTenMinutes =
      scheduled.startedAtElapsed + TimeUnit.MINUTES.toMillis(10)
    val wallAfterOneHourJump =
      scheduled.startedAt + TimeUnit.MINUTES.toMillis(10) + TimeUnit.HOURS.toMillis(1)
    val authoritativeRemaining = AlarmPyoQuickTimerPolicy.remainingMillis(
      snapshot = scheduled,
      currentBootCount = 12,
      nowWallClock = wallAfterOneHourJump,
      nowElapsed = elapsedAfterTenMinutes
    )
    assertEquals(TimeUnit.MINUTES.toMillis(20), authoritativeRemaining)

    val rebasedPlan = AlarmPyoQuickTimerPolicy.rebasePlanForRestore(
      plan = scheduled.plan!!,
      nowWallClock = wallAfterOneHourJump,
      delayMillis = authoritativeRemaining
    )
    val rebased = AlarmPyoQuickTimerPolicy.restoredSnapshot(
      snapshot = scheduled,
      restoredPlan = rebasedPlan,
      nowElapsed = elapsedAfterTenMinutes,
      delayMillis = authoritativeRemaining,
      currentBootCount = 12
    )

    assertEquals(scheduled.generation, rebased.generation)
    assertEquals(scheduled.plan.rootPlanId, rebased.plan!!.rootPlanId)
    assertEquals(scheduled.plan.repeatStage, rebased.plan.repeatStage)
    assertEquals(scheduled.plan.deliveryAttempt, rebased.plan.deliveryAttempt)
    assertFalse(scheduled.plan.hasSameDeliveryGeneration(rebased.plan))

    val rebootWallClock = wallAfterOneHourJump + TimeUnit.MINUTES.toMillis(5)
    assertEquals(
      TimeUnit.MINUTES.toMillis(15),
      AlarmPyoQuickTimerPolicy.remainingMillis(
        snapshot = rebased,
        currentBootCount = 13,
        nowWallClock = rebootWallClock,
        nowElapsed = TimeUnit.SECONDS.toMillis(3)
      )
    )
  }

  @Test
  fun `backward time set keeps active timer and automatic repeat status valid`() {
    val scheduled = activeSnapshot(generation = 11L, bootCount = 12)
    val elapsedAfterTenMinutes =
      scheduled.startedAtElapsed + TimeUnit.MINUTES.toMillis(10)
    val wallAfterTwoHourRollback =
      scheduled.startedAt + TimeUnit.MINUTES.toMillis(10) - TimeUnit.HOURS.toMillis(2)
    val remaining = AlarmPyoQuickTimerPolicy.remainingMillis(
      snapshot = scheduled,
      currentBootCount = 12,
      nowWallClock = wallAfterTwoHourRollback,
      nowElapsed = elapsedAfterTenMinutes
    )
    val rebasedPlan = AlarmPyoQuickTimerPolicy.rebasePlanForRestore(
      plan = scheduled.plan!!,
      nowWallClock = wallAfterTwoHourRollback,
      delayMillis = remaining
    )
    val rebased = AlarmPyoQuickTimerPolicy.restoredSnapshot(
      snapshot = scheduled,
      restoredPlan = rebasedPlan,
      nowElapsed = elapsedAfterTenMinutes,
      delayMillis = remaining,
      currentBootCount = 12
    ).copy(generation = 12L)
    val decoded = AlarmPyoQuickTimerCodec.decode(AlarmPyoQuickTimerCodec.encode(rebased))!!

    assertTrue(decoded.isActive())
    assertTrue(decoded.plan!!.alarmAt > decoded.startedAt)
    assertEquals(TimeUnit.MINUTES.toMillis(30), decoded.plan.alarmAt - decoded.startedAt)
    assertEquals(TimeUnit.MINUTES.toMillis(20), remaining)
    assertEquals(
      remaining,
      AlarmPyoQuickTimerPolicy.remainingMillis(
        decoded,
        currentBootCount = 12,
        nowWallClock = wallAfterTwoHourRollback,
        nowElapsed = elapsedAfterTenMinutes
      )
    )

    val repeatStartedAt = decoded.plan.alarmAt
    val repeatStartedAtElapsed = decoded.fireAtElapsed
    val repeatDelay = TimeUnit.MINUTES.toMillis(5)
    val repeatPlan = decoded.plan.copy(
      id = "${decoded.plan.rootPlanId}$SINGLE_REPEAT_ID_SUFFIX",
      alarmAt = repeatStartedAt + repeatDelay,
      originalAlarmAt = repeatStartedAt + repeatDelay,
      deliveryAttempt = 0,
      repeatStage = SINGLE_REPEAT_STAGE
    )
    val repeat = AlarmPyoQuickTimerPolicy.automaticRepeatSnapshot(
      snapshot = decoded,
      repeatPlan = repeatPlan,
      nowWallClock = repeatStartedAt,
      nowElapsed = repeatStartedAtElapsed,
      delayMillis = repeatDelay,
      currentBootCount = 12
    ).copy(generation = 13L)
    val decodedRepeat = AlarmPyoQuickTimerCodec.decode(
      AlarmPyoQuickTimerCodec.encode(repeat)
    )!!

    assertTrue(decodedRepeat.isActive())
    assertTrue(decodedRepeat.plan!!.isSingleRepeat())
    assertEquals(repeatStartedAt, decodedRepeat.startedAt)
    assertEquals(repeatDelay, decodedRepeat.plan.alarmAt - decodedRepeat.startedAt)
    assertEquals(repeatDelay, decodedRepeat.fireAtElapsed - decodedRepeat.startedAtElapsed)
    assertEquals(decoded.plan.rootPlanId, decodedRepeat.plan.rootPlanId)
    assertEquals(
      repeatDelay,
      AlarmPyoQuickTimerPolicy.remainingMillis(
        decodedRepeat,
        currentBootCount = 12,
        nowWallClock = repeatStartedAt,
        nowElapsed = repeatStartedAtElapsed
      )
    )
  }

  @Test
  fun `new boot countdown falls back to the saved wall clock target`() {
    val snapshot = activeSnapshot(generation = 3L, bootCount = 12)

    val remaining = AlarmPyoQuickTimerPolicy.remainingMillis(
      snapshot,
      currentBootCount = 13,
      nowWallClock = snapshot.plan!!.alarmAt - TimeUnit.MINUTES.toMillis(9),
      nowElapsed = 2_000L
    )

    assertEquals(TimeUnit.MINUTES.toMillis(9), remaining)
  }

  @Test
  fun `reboot recovery resets elapsed origin and round trips through firing`() {
    val oldBoot = activeSnapshot(generation = 3L, bootCount = 12).copy(
      startedAtElapsed = TimeUnit.DAYS.toMillis(12),
      fireAtElapsed = TimeUnit.DAYS.toMillis(12) + TimeUnit.MINUTES.toMillis(30)
    )
    val newBootElapsed = TimeUnit.SECONDS.toMillis(2)
    val remaining = TimeUnit.MINUTES.toMillis(9)
    assertTrue(newBootElapsed + remaining < oldBoot.startedAtElapsed)

    val restored = AlarmPyoQuickTimerPolicy.restoredSnapshot(
      snapshot = oldBoot,
      restoredPlan = oldBoot.plan!!,
      nowElapsed = newBootElapsed,
      delayMillis = remaining,
      currentBootCount = 13
    ).copy(generation = 4L)
    val decoded = AlarmPyoQuickTimerCodec.decode(AlarmPyoQuickTimerCodec.encode(restored))

    assertEquals(restored, decoded)
    assertEquals(newBootElapsed, decoded!!.startedAtElapsed)
    assertTrue(decoded.fireAtElapsed > decoded.startedAtElapsed)
    assertEquals(
      0L,
      AlarmPyoQuickTimerPolicy.remainingMillis(
        snapshot = decoded,
        currentBootCount = 13,
        nowWallClock = decoded.plan!!.alarmAt,
        nowElapsed = decoded.fireAtElapsed
      )
    )
  }

  @Test
  fun `overdue timers fire during ten minute grace and expire afterwards`() {
    assertEquals(1_000L, AlarmPyoQuickTimerPolicy.restoredDelayMillis(-1L))
    assertEquals(
      1_000L,
      AlarmPyoQuickTimerPolicy.restoredDelayMillis(-TimeUnit.MINUTES.toMillis(10))
    )
    assertNull(
      AlarmPyoQuickTimerPolicy.restoredDelayMillis(
        -TimeUnit.MINUTES.toMillis(10) - 1L
      )
    )
  }

  @Test
  fun `committed tombstone prevents an older active replica from returning`() {
    val olderActive = activeSnapshot(generation = 4L)
    val committedIdle = AlarmPyoQuickTimerSnapshot.idle(generation = 5L)

    assertEquals(
      committedIdle,
      AlarmPyoQuickTimerReplicaPolicy.select(olderActive, committedIdle, 5L)
    )
    assertNull(AlarmPyoQuickTimerReplicaPolicy.select(olderActive, null, 5L))
  }

  @Test
  fun `failed first schedule rolls back to an explicit idle snapshot`() {
    val rollback = AlarmPyoQuickTimerPolicy.rollbackSnapshot(null)

    assertEquals(AlarmPyoQuickTimerSnapshotState.IDLE, rollback.state)
    assertNull(rollback.plan)
    val previous = activeSnapshot(generation = 4L)
    assertEquals(previous, AlarmPyoQuickTimerPolicy.rollbackSnapshot(previous))
    val paused = AlarmPyoQuickTimerPolicy.pausedSnapshot(
      previous,
      TimeUnit.MINUTES.toMillis(11)
    )
    assertEquals(paused, AlarmPyoQuickTimerPolicy.rollbackSnapshot(paused))
  }

  @Test
  fun `divergent replicas at the same generation are rejected`() {
    val primary = activeSnapshot(generation = 7L)
    val redundant = primary.copy(durationMinutes = 60)

    assertNull(AlarmPyoQuickTimerReplicaPolicy.select(primary, redundant, 7L))
  }

  @Test
  fun `timer codec protects generation and payload with a checksum`() {
    val snapshot = activeSnapshot(generation = 9L)
    val encoded = AlarmPyoQuickTimerCodec.encode(snapshot)

    assertEquals(snapshot, AlarmPyoQuickTimerCodec.decode(encoded))
    assertNull(
      AlarmPyoQuickTimerCodec.decode(
        encoded.replace("30분 타이머", "60분 타이머")
      )
    )
  }

  @Test
  fun `version one active timer remains readable after the paused schema upgrade`() {
    val snapshot = activeSnapshot(generation = 31L)
    val payload = JSONObject()
      .put("state", snapshot.state.wireValue)
      .put("durationMinutes", snapshot.durationMinutes)
      .put("startedAt", snapshot.startedAt)
      .put("startedAtElapsed", snapshot.startedAtElapsed)
      .put("fireAtElapsed", snapshot.fireAtElapsed)
      .put("bootCount", snapshot.bootCount)
      .put("plan", snapshot.plan!!.toJson())
      .toString()
    val checksum = MessageDigest.getInstance("SHA-256")
      .digest("1\n${snapshot.generation}\n$payload".toByteArray(Charsets.UTF_8))
      .joinToString("") { byte -> "%02x".format(byte) }
    val legacyEnvelope = JSONObject()
      .put("schemaVersion", 1)
      .put("generation", snapshot.generation)
      .put("payload", payload)
      .put("checksum", checksum)
      .toString()

    assertEquals(snapshot, AlarmPyoQuickTimerCodec.decode(legacyEnvelope))
  }

  @Test
  fun `alarm source priorities protect work alarms from timer and test alarms`() {
    assertTrue(AlarmPyoAlarmSource.WORK.priority > AlarmPyoAlarmSource.TIMER.priority)
    assertTrue(AlarmPyoAlarmSource.TIMER.priority > AlarmPyoAlarmSource.TEST.priority)
  }

  @Test
  fun `timer presentation never describes the timer as a work alarm`() {
    val first = activeSnapshot(generation = 1L).plan!!
    val repeat = first.copy(repeatStage = SINGLE_REPEAT_STAGE)

    assertEquals("AlarmPyo 타이머", AlarmPyoQuickTimerPresentation.notificationTitle(false))
    assertEquals(
      "AlarmPyo 타이머 5분 재알림",
      AlarmPyoQuickTimerPresentation.notificationTitle(true)
    )
    assertEquals("타이머", AlarmPyoQuickTimerPresentation.badge(false))
    assertTrue(AlarmPyoQuickTimerPresentation.message(first).contains("타이머"))
    assertTrue(AlarmPyoQuickTimerPresentation.message(repeat).contains("5분"))
    assertEquals(
      "타이머가 5분 뒤 한 번 더 울렸습니다.",
      AlarmPyoQuickTimerPresentation.notificationContent(repeat)
    )
    assertFalse(
      AlarmPyoQuickTimerPresentation.notificationContent(repeat).contains("30분 타이머")
    )
  }

  private fun activeSnapshot(
    generation: Long,
    bootCount: Int = 12
  ): AlarmPyoQuickTimerSnapshot {
    val startedAt = 1_800_000_000_000L
    val duration = TimeUnit.MINUTES.toMillis(30)
    val plan = AlarmPyoAlarmPlan(
      id = "__alarmpyo_quick_timer__",
      dateKey = "",
      shiftTypeId = "timer",
      shiftName = "30분 타이머",
      alarmAt = startedAt + duration,
      originalAlarmAt = startedAt + duration,
      rootPlanId = "__alarmpyo_quick_timer__"
    )
    return AlarmPyoQuickTimerSnapshot(
      plan = plan,
      durationMinutes = 30,
      startedAt = startedAt,
      startedAtElapsed = 1_000L,
      fireAtElapsed = 1_000L + duration,
      bootCount = bootCount,
      state = AlarmPyoQuickTimerSnapshotState.ACTIVE,
      generation = generation
    )
  }
}
