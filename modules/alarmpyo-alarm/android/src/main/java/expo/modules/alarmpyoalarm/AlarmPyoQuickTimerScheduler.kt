package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import java.util.concurrent.TimeUnit

internal const val ACTION_FIRE_ALARMPYO_QUICK_TIMER =
  "expo.modules.alarmpyoalarm.action.FIRE_QUICK_TIMER"

internal object AlarmPyoQuickTimerPolicy {
  val OVERDUE_GRACE_MILLIS: Long = TimeUnit.MINUTES.toMillis(10)
  val EARLY_DELIVERY_TOLERANCE_MILLIS: Long = TimeUnit.MINUTES.toMillis(1)
  private val RETRY_DELAYS_MILLIS = longArrayOf(
    TimeUnit.MINUTES.toMillis(1),
    TimeUnit.MINUTES.toMillis(3),
    TimeUnit.MINUTES.toMillis(5)
  )

  fun isSupportedDuration(minutes: Int): Boolean = minutes == 30 || minutes == 45 || minutes == 60

  fun remainingMillis(
    snapshot: AlarmPyoQuickTimerSnapshot,
    currentBootCount: Int,
    nowWallClock: Long,
    nowElapsed: Long
  ): Long {
    val sameBoot = snapshot.bootCount >= 0 &&
      currentBootCount >= 0 &&
      snapshot.bootCount == currentBootCount &&
      snapshot.fireAtElapsed > 0L
    return if (sameBoot) {
      snapshot.fireAtElapsed - nowElapsed
    } else {
      (snapshot.plan?.alarmAt ?: 0L) - nowWallClock
    }
  }

  fun restoredDelayMillis(remainingMillis: Long): Long? = when {
    remainingMillis > 0L -> remainingMillis
    remainingMillis >= -OVERDUE_GRACE_MILLIS -> 1_000L
    else -> null
  }

  fun retryDelayMillis(deliveryAttempt: Int): Long? =
    RETRY_DELAYS_MILLIS.getOrNull(deliveryAttempt.coerceAtLeast(0))

  fun rollbackSnapshot(
    previous: AlarmPyoQuickTimerSnapshot?
  ): AlarmPyoQuickTimerSnapshot = previous ?: AlarmPyoQuickTimerSnapshot.idle()

  fun pausedSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    remainingMillis: Long
  ): AlarmPyoQuickTimerSnapshot {
    require(snapshot.isActive()) { "실행 중인 타이머만 일시정지할 수 있습니다." }
    require(remainingMillis > 0L) { "남은 시간이 있는 타이머만 일시정지할 수 있습니다." }
    return snapshot.copy(
      state = AlarmPyoQuickTimerSnapshotState.PAUSED,
      fireAtElapsed = 0L,
      bootCount = -1,
      pausedRemainingMillis = remainingMillis
    )
  }

  fun resumedSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    resumedPlan: AlarmPyoAlarmPlan,
    nowWallClock: Long,
    nowElapsed: Long,
    currentBootCount: Int
  ): AlarmPyoQuickTimerSnapshot {
    require(snapshot.isPaused()) { "일시정지된 타이머만 다시 시작할 수 있습니다." }
    val remainingMillis = snapshot.pausedRemainingMillis
    require(remainingMillis > 0L) { "다시 시작할 남은 시간이 없습니다." }
    return snapshot.copy(
      plan = resumedPlan,
      startedAt = nowWallClock,
      startedAtElapsed = nowElapsed,
      fireAtElapsed = Math.addExact(nowElapsed, remainingMillis),
      bootCount = currentBootCount,
      state = AlarmPyoQuickTimerSnapshotState.ACTIVE,
      pausedRemainingMillis = 0L
    )
  }

  fun restoredSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    restoredPlan: AlarmPyoAlarmPlan,
    nowElapsed: Long,
    delayMillis: Long,
    currentBootCount: Int
  ): AlarmPyoQuickTimerSnapshot {
    val previousPlan = requireNotNull(snapshot.plan)
    val wallClockDelta = Math.subtractExact(restoredPlan.alarmAt, previousPlan.alarmAt)
    return snapshot.copy(
      plan = restoredPlan,
      // Keep the wall duration valid even when TIME_SET moves the clock behind
      // the original start. JS can then retain its defensive fireAt > startedAt
      // validation without rejecting an otherwise healthy native timer.
      startedAt = Math.addExact(snapshot.startedAt, wallClockDelta),
      // elapsedRealtime resets on reboot. Keeping the previous boot's start
      // value can make fireAtElapsed <= startedAtElapsed and invalidate both
      // persisted replicas on their next read.
      startedAtElapsed = nowElapsed,
      fireAtElapsed = Math.addExact(nowElapsed, delayMillis),
      bootCount = currentBootCount
    )
  }

  fun automaticRepeatSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    repeatPlan: AlarmPyoAlarmPlan,
    nowWallClock: Long,
    nowElapsed: Long,
    delayMillis: Long,
    currentBootCount: Int
  ): AlarmPyoQuickTimerSnapshot = snapshot.copy(
    plan = repeatPlan,
    // A 5-minute repeat is a new countdown stage, not an extension of the
    // original 30/45/60-minute timer's start point.
    startedAt = nowWallClock,
    startedAtElapsed = nowElapsed,
    fireAtElapsed = Math.addExact(nowElapsed, delayMillis),
    bootCount = currentBootCount
  )

  fun rebasePlanForRestore(
    plan: AlarmPyoAlarmPlan,
    nowWallClock: Long,
    delayMillis: Long
  ): AlarmPyoAlarmPlan {
    val restoredAlarmAt = Math.addExact(nowWallClock, delayMillis)
    val wallClockDelta = Math.subtractExact(restoredAlarmAt, plan.alarmAt)
    return plan.copy(
      alarmAt = restoredAlarmAt,
      // Apply the same delta so an in-flight retry keeps its existing delivery
      // window instead of receiving a fresh ten-minute grace period.
      originalAlarmAt = Math.addExact(plan.originalAlarmAt, wallClockDelta)
    )
  }
}

/**
 * AlarmManager registrations cannot be enumerated reliably. A persisted active
 * timer therefore has to be registered again once when a new native process
 * first reads its status (for example after an OEM cleanup or a user force-stop
 * followed by reopening the app).
 *
 * A failed reconciliation deliberately leaves the gate open so the next status
 * read can retry. Explicit schedule/cancel operations mark the current process
 * synchronized after they have updated both storage and AlarmManager.
 */
internal class AlarmPyoQuickTimerProcessSyncGate {
  private var completedSuccessfulSync = false

  @Synchronized
  fun canReuseScheduledSnapshot(): Boolean = completedSuccessfulSync

  @Synchronized
  fun <T> reconcileIfNeeded(force: Boolean = false, action: () -> T): T? {
    if (completedSuccessfulSync && !force) return null
    completedSuccessfulSync = false
    return action().also { completedSuccessfulSync = true }
  }

  @Synchronized
  fun markSuccessfulSync() {
    completedSuccessfulSync = true
  }

  @Synchronized
  fun markNeedsReconciliation() {
    completedSuccessfulSync = false
  }
}

internal object AlarmPyoQuickTimerPresentation {
  fun notificationTitle(isRepeat: Boolean): String =
    if (isRepeat) "AlarmPyo 타이머 5분 재알림" else "AlarmPyo 타이머"

  fun badge(isRepeat: Boolean): String =
    if (isRepeat) "타이머 5분 재알림" else "타이머"

  fun message(plan: AlarmPyoAlarmPlan): String =
    if (plan.isSingleRepeat()) {
      "타이머가 5분 뒤 한 번 더 울렸습니다."
    } else {
      "${plan.shiftName.ifBlank { "타이머" }}가 끝났습니다."
    }

  fun notificationContent(plan: AlarmPyoAlarmPlan): String = message(plan)
}

internal data class AlarmPyoQuickTimerStatus(
  val state: String,
  val active: Boolean,
  val durationMinutes: Int?,
  val startedAt: Long,
  val fireAt: Long,
  val remainingMillis: Long,
  val isRepeat: Boolean,
  val storageHealth: AlarmPyoQuickTimerStorageHealth,
  val requiredAction: String
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "supported" to true,
    "state" to state,
    "active" to active,
    "durationMinutes" to durationMinutes,
    "startedAt" to startedAt.toDouble(),
    "fireAt" to fireAt.toDouble(),
    "remainingMillis" to remainingMillis.toDouble(),
    "isRepeat" to isRepeat,
    "storageHealth" to storageHealth.wireValue,
    "requiredAction" to requiredAction
  )
}

internal object AlarmPyoQuickTimerScheduler {
  private const val TIMER_PLAN_ID = "__alarmpyo_quick_timer__"
  private const val TIMER_REQUEST_CODE = 0x54494D
  private val processSyncGate = AlarmPyoQuickTimerProcessSyncGate()

  @Synchronized
  fun schedule(context: Context, durationMinutes: Int): AlarmPyoQuickTimerSnapshot {
    require(AlarmPyoQuickTimerPolicy.isSupportedDuration(durationMinutes)) {
      "빠른 타이머는 30분, 45분 또는 60분만 설정할 수 있습니다."
    }
    val appContext = context.applicationContext
    check(AlarmPyoAlarmPermissions.canDeliver(appContext)) {
      "타이머를 울리려면 정확한 알람, 알림, 전체 화면 권한이 필요합니다."
    }
    processSyncGate.markNeedsReconciliation()

    val previous = AlarmPyoQuickTimerStore.read(appContext).snapshot
    val nowWallClock = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val durationMillis = TimeUnit.MINUTES.toMillis(durationMinutes.toLong())
    val fireAt = nowWallClock + durationMillis
    val plan = AlarmPyoAlarmPlan(
      id = TIMER_PLAN_ID,
      dateKey = "",
      shiftTypeId = "timer",
      shiftName = "${durationMinutes}분 타이머",
      alarmAt = fireAt,
      originalAlarmAt = fireAt,
      rootPlanId = TIMER_PLAN_ID
    )
    val desired = AlarmPyoQuickTimerSnapshot(
      plan = plan,
      durationMinutes = durationMinutes,
      startedAt = nowWallClock,
      startedAtElapsed = nowElapsed,
      fireAtElapsed = nowElapsed + durationMillis,
      bootCount = bootCount(appContext),
      state = AlarmPyoQuickTimerSnapshotState.ACTIVE
    )
    var stored: AlarmPyoQuickTimerSnapshot? = null
    try {
      stored = AlarmPyoQuickTimerStore.writeAuthoritative(appContext, desired)
      schedulePendingIntent(appContext, plan, requireNotNull(stored).fireAtElapsed)
      processSyncGate.markSuccessfulSync()
    } catch (error: Throwable) {
      runCatching { cancelPendingIntent(appContext) }
      val rollbackSynchronized = runCatching {
        val restored = AlarmPyoQuickTimerStore.writeAuthoritative(
          appContext,
          AlarmPyoQuickTimerPolicy.rollbackSnapshot(previous)
        )
        !restored.isActive() || restoreSnapshot(appContext, restored)
      }.getOrDefault(false)
      if (rollbackSynchronized) processSyncGate.markSuccessfulSync()
      throw error
    }
    stopRingingTimerIfNeeded(appContext)
    return requireNotNull(stored)
  }

  @Synchronized
  fun pause(context: Context): AlarmPyoQuickTimerSnapshot {
    val appContext = context.applicationContext
    val result = AlarmPyoQuickTimerStore.read(appContext)
    check(result.storageHealth != AlarmPyoQuickTimerStorageHealth.CORRUPT) {
      "타이머 저장소가 손상되어 초기화가 필요합니다."
    }
    val snapshot = requireNotNull(result.snapshot)
    if (snapshot.isPaused() || !snapshot.isActive()) return snapshot

    val remaining = AlarmPyoQuickTimerPolicy.remainingMillis(
      snapshot,
      bootCount(appContext),
      System.currentTimeMillis(),
      SystemClock.elapsedRealtime()
    )
    require(remaining > 0L) { "울리기 시작한 타이머는 일시정지할 수 없습니다." }

    processSyncGate.markNeedsReconciliation()
    // Persist the paused generation first. If the old PendingIntent races with
    // cancellation, the receiver rejects it because it no longer matches an
    // ACTIVE authoritative snapshot.
    val stored = AlarmPyoQuickTimerStore.writeAuthoritative(
      appContext,
      AlarmPyoQuickTimerPolicy.pausedSnapshot(snapshot, remaining)
    )
    cancelPendingIntent(appContext)
    processSyncGate.markSuccessfulSync()
    return stored
  }

  @Synchronized
  fun resume(context: Context): AlarmPyoQuickTimerSnapshot {
    val appContext = context.applicationContext
    val result = AlarmPyoQuickTimerStore.read(appContext)
    check(result.storageHealth != AlarmPyoQuickTimerStorageHealth.CORRUPT) {
      "타이머 저장소가 손상되어 초기화가 필요합니다."
    }
    val paused = requireNotNull(result.snapshot)
    if (paused.isActive() || !paused.isPaused()) return paused
    check(AlarmPyoAlarmPermissions.canDeliver(appContext)) {
      "타이머를 울리려면 정확한 알람, 알림, 전체 화면 권한이 필요합니다."
    }
    val previousPlan = requireNotNull(paused.plan)
    val remaining = paused.pausedRemainingMillis
    val nowWallClock = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val resumedPlan = AlarmPyoQuickTimerPolicy.rebasePlanForRestore(
      previousPlan,
      nowWallClock,
      remaining
    )
    val desired = AlarmPyoQuickTimerPolicy.resumedSnapshot(
      snapshot = paused,
      resumedPlan = resumedPlan,
      nowWallClock = nowWallClock,
      nowElapsed = nowElapsed,
      currentBootCount = bootCount(appContext)
    )

    processSyncGate.markNeedsReconciliation()
    return try {
      val stored = AlarmPyoQuickTimerStore.writeAuthoritative(appContext, desired)
      schedulePendingIntent(appContext, resumedPlan, stored.fireAtElapsed)
      processSyncGate.markSuccessfulSync()
      stored
    } catch (error: Throwable) {
      runCatching { cancelPendingIntent(appContext) }
      val rolledBack = runCatching {
        AlarmPyoQuickTimerStore.writeAuthoritative(appContext, paused)
      }.isSuccess
      if (rolledBack) processSyncGate.markSuccessfulSync()
      throw error
    }
  }

  @Synchronized
  fun cancel(context: Context): AlarmPyoQuickTimerSnapshot {
    val appContext = context.applicationContext
    processSyncGate.markNeedsReconciliation()
    val stored = AlarmPyoQuickTimerStore.writeAuthoritative(
      appContext,
      AlarmPyoQuickTimerSnapshot.idle()
    )
    cancelPendingIntent(appContext)
    processSyncGate.markSuccessfulSync()
    stopRingingTimerIfNeeded(appContext)
    return stored
  }

  @Synchronized
  fun restore(context: Context): Boolean {
    val appContext = context.applicationContext
    processSyncGate.markNeedsReconciliation()
    val restored = restoreCurrentSnapshot(appContext)
    if (restored) processSyncGate.markSuccessfulSync()
    return restored
  }

  private fun restoreCurrentSnapshot(context: Context): Boolean {
    val appContext = context.applicationContext
    val result = AlarmPyoQuickTimerStore.read(appContext)
    if (result.storageHealth == AlarmPyoQuickTimerStorageHealth.CORRUPT) return false
    val snapshot = result.snapshot ?: return false
    if (!snapshot.isActive()) {
      cancelPendingIntent(appContext)
      return true
    }
    if (!AlarmPyoAlarmPermissions.canSchedule(appContext)) return false
    return restoreSnapshot(appContext, snapshot)
  }

  @Synchronized
  fun planForFiringIntent(context: Context, intent: Intent): AlarmPyoAlarmPlan? {
    val intentPlan = AlarmPyoAlarmPlan.fromIntent(intent) ?: return null
    val result = AlarmPyoQuickTimerStore.read(context.applicationContext)
    if (result.storageHealth == AlarmPyoQuickTimerStorageHealth.CORRUPT) return null
    val snapshot = result.snapshot?.takeIf(AlarmPyoQuickTimerSnapshot::isActive) ?: return null
    val storedPlan = snapshot.plan ?: return null
    if (!storedPlan.hasSameDeliveryGeneration(intentPlan)) return null
    val remaining = AlarmPyoQuickTimerPolicy.remainingMillis(
      snapshot,
      bootCount(context),
      System.currentTimeMillis(),
      SystemClock.elapsedRealtime()
    )
    if (remaining > AlarmPyoQuickTimerPolicy.EARLY_DELIVERY_TOLERANCE_MILLIS) return null
    if (remaining < -AlarmPyoQuickTimerPolicy.OVERDUE_GRACE_MILLIS) {
      expire(context.applicationContext)
      return null
    }
    return storedPlan
  }

  @Synchronized
  internal fun hasCurrentDeliveryGeneration(
    context: Context,
    plan: AlarmPyoAlarmPlan
  ): Boolean {
    val result = AlarmPyoQuickTimerStore.read(context.applicationContext)
    if (result.storageHealth == AlarmPyoQuickTimerStorageHealth.CORRUPT) return false
    return result.snapshot
      ?.takeIf(AlarmPyoQuickTimerSnapshot::isActive)
      ?.plan
      ?.hasSameDeliveryGeneration(plan) == true
  }

  @Synchronized
  fun retryDelivery(
    context: Context,
    plan: AlarmPyoAlarmPlan
  ): AlarmPyoAlarmRetryResult? {
    val appContext = context.applicationContext
    val result = AlarmPyoQuickTimerStore.read(appContext)
    if (result.storageHealth == AlarmPyoQuickTimerStorageHealth.CORRUPT) return null
    val snapshot = result.snapshot?.takeIf(AlarmPyoQuickTimerSnapshot::isActive) ?: return null
    val currentPlan = snapshot.plan?.takeIf { it.hasSameDeliveryGeneration(plan) } ?: return null
    val nowWallClock = System.currentTimeMillis()
    val delay = AlarmPyoQuickTimerPolicy.retryDelayMillis(currentPlan.deliveryAttempt)
    val retryAt = delay?.let(nowWallClock::plus)
    val deadline = currentPlan.originalAlarmAt + AlarmPyoQuickTimerPolicy.OVERDUE_GRACE_MILLIS
    if (retryAt == null || retryAt > deadline) {
      return AlarmPyoAlarmRetryResult(currentPlan, scheduled = false)
    }

    val retryPlan = currentPlan.copy(
      alarmAt = retryAt,
      deliveryAttempt = currentPlan.deliveryAttempt + 1
    )
    processSyncGate.markNeedsReconciliation()
    return try {
      val retrySnapshot = AlarmPyoQuickTimerStore.writeAuthoritative(
        appContext,
        snapshot.copy(
          plan = retryPlan,
          fireAtElapsed = SystemClock.elapsedRealtime() + requireNotNull(delay),
          bootCount = bootCount(appContext)
        )
      )
      schedulePendingIntent(appContext, retryPlan, retrySnapshot.fireAtElapsed)
      processSyncGate.markSuccessfulSync()
      AlarmPyoAlarmRetryResult(retryPlan, scheduled = true)
    } catch (_: Throwable) {
      runCatching { cancelPendingIntent(appContext) }
      runCatching { AlarmPyoQuickTimerStore.writeAuthoritative(appContext, snapshot) }
      AlarmPyoAlarmRetryResult(currentPlan, scheduled = false)
    }
  }

  @Synchronized
  fun markDeliveryExhausted(context: Context, plan: AlarmPyoAlarmPlan) {
    val appContext = context.applicationContext
    val snapshot = AlarmPyoQuickTimerStore.read(appContext).snapshot ?: return
    if (snapshot.plan?.hasSameDeliveryGeneration(plan) != true) return
    expire(appContext)
  }

  @Synchronized
  fun completeConfirmedDelivery(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    automaticRepeatEligible: Boolean,
    nowMillis: Long = System.currentTimeMillis()
  ): AlarmPyoAlarmDeliveryCompletionResult {
    val appContext = context.applicationContext
    val result = AlarmPyoQuickTimerStore.read(appContext)
    if (result.storageHealth == AlarmPyoQuickTimerStorageHealth.CORRUPT) {
      return AlarmPyoAlarmDeliveryCompletionResult(completed = false)
    }
    val snapshot = result.snapshot?.takeIf(AlarmPyoQuickTimerSnapshot::isActive)
      ?: return AlarmPyoAlarmDeliveryCompletionResult(completed = false)
    val current = snapshot.plan?.takeIf { it.hasSameDeliveryGeneration(plan) }
      ?: return AlarmPyoAlarmDeliveryCompletionResult(completed = false)

    if (automaticRepeatEligible && !current.isSingleRepeat()) {
      val repeatAt = nowMillis + AlarmPyoAlarmScheduler.SINGLE_REPEAT_DELAY_MILLIS
      val repeatStartedAtElapsed = SystemClock.elapsedRealtime()
      val repeatPlan = current.copy(
        id = "$TIMER_PLAN_ID$SINGLE_REPEAT_ID_SUFFIX",
        alarmAt = repeatAt,
        originalAlarmAt = repeatAt,
        deliveryAttempt = 0,
        rootPlanId = TIMER_PLAN_ID,
        repeatStage = SINGLE_REPEAT_STAGE
      )
      processSyncGate.markNeedsReconciliation()
      val scheduled = runCatching {
        val repeatSnapshot = AlarmPyoQuickTimerStore.writeAuthoritative(
          appContext,
          AlarmPyoQuickTimerPolicy.automaticRepeatSnapshot(
            snapshot = snapshot,
            repeatPlan = repeatPlan,
            nowWallClock = nowMillis,
            nowElapsed = repeatStartedAtElapsed,
            delayMillis = AlarmPyoAlarmScheduler.SINGLE_REPEAT_DELAY_MILLIS,
            currentBootCount = bootCount(appContext)
          )
        )
        schedulePendingIntent(appContext, repeatPlan, repeatSnapshot.fireAtElapsed)
      }.isSuccess
      if (scheduled) {
        processSyncGate.markSuccessfulSync()
        return AlarmPyoAlarmDeliveryCompletionResult(
          completed = true,
          automaticRepeat = AlarmPyoSingleRepeatResult(repeatPlan, created = true)
        )
      }
      cancelPendingIntent(appContext)
    }

    AlarmPyoQuickTimerStore.writeAuthoritative(appContext, AlarmPyoQuickTimerSnapshot.idle())
    cancelPendingIntent(appContext)
    processSyncGate.markSuccessfulSync()
    return AlarmPyoAlarmDeliveryCompletionResult(completed = true)
  }

  @Synchronized
  fun scheduleManualSingleRepeat(
    context: Context,
    original: AlarmPyoAlarmPlan,
    minutes: Int = 5
  ): AlarmPyoAlarmPlan? {
    if (original.isSingleRepeat()) return null
    val appContext = context.applicationContext
    if (!AlarmPyoAlarmPermissions.canSchedule(appContext)) return null
    val currentSnapshot = AlarmPyoQuickTimerStore.read(appContext)
      .snapshot
      ?.takeIf(AlarmPyoQuickTimerSnapshot::isActive)
      ?.takeIf { it.plan?.hasSameDeliveryGeneration(original) == true }
      ?: return null
    val duration = currentSnapshot.durationMinutes
      ?.takeIf(AlarmPyoQuickTimerPolicy::isSupportedDuration)
      ?: return null
    val delayMillis = TimeUnit.MINUTES.toMillis(minutes.coerceIn(1, 60).toLong())
    val nowWallClock = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val fireAt = nowWallClock + delayMillis
    val repeat = original.copy(
      id = "$TIMER_PLAN_ID$SINGLE_REPEAT_ID_SUFFIX",
      alarmAt = fireAt,
      originalAlarmAt = fireAt,
      deliveryAttempt = 0,
      rootPlanId = TIMER_PLAN_ID,
      repeatStage = SINGLE_REPEAT_STAGE
    )
    processSyncGate.markNeedsReconciliation()
    return runCatching {
      val snapshot = AlarmPyoQuickTimerStore.writeAuthoritative(
        appContext,
        AlarmPyoQuickTimerSnapshot(
          plan = repeat,
          durationMinutes = duration,
          startedAt = nowWallClock,
          startedAtElapsed = nowElapsed,
          fireAtElapsed = nowElapsed + delayMillis,
          bootCount = bootCount(appContext),
          state = AlarmPyoQuickTimerSnapshotState.ACTIVE
        )
      )
      schedulePendingIntent(appContext, repeat, snapshot.fireAtElapsed)
      processSyncGate.markSuccessfulSync()
      repeat
    }.getOrElse {
      expire(appContext)
      null
    }
  }

  @Synchronized
  fun cancelSingleRepeat(context: Context, rootPlanId: String) {
    val appContext = context.applicationContext
    val result = AlarmPyoQuickTimerStore.read(appContext)
    val plan = result.snapshot?.plan ?: return
    if (!plan.isSingleRepeat() || plan.rootPlanId != rootPlanId) return
    processSyncGate.markNeedsReconciliation()
    AlarmPyoQuickTimerStore.writeAuthoritative(appContext, AlarmPyoQuickTimerSnapshot.idle())
    cancelPendingIntent(appContext)
    processSyncGate.markSuccessfulSync()
  }

  fun status(context: Context): AlarmPyoQuickTimerStatus {
    val appContext = context.applicationContext
    val result = AlarmPyoQuickTimerStore.read(appContext)
    val requiredAction = requiredAction(appContext)
    if (result.storageHealth == AlarmPyoQuickTimerStorageHealth.CORRUPT) {
      markRestorePendingSafely(appContext)
      return AlarmPyoQuickTimerStatus(
        state = "error",
        active = false,
        durationMinutes = null,
        startedAt = 0L,
        fireAt = 0L,
        remainingMillis = 0L,
        isRepeat = false,
        storageHealth = result.storageHealth,
        requiredAction = requiredAction
      )
    }
    val snapshot = result.snapshot ?: AlarmPyoQuickTimerSnapshot.idle()
    val reconciliationFailed = if (snapshot.isActive() && requiredAction != "none") {
      markRestorePendingSafely(appContext)
      false
    } else {
      runCatching {
        processSyncGate.reconcileIfNeeded(
          force = result.storageHealth == AlarmPyoQuickTimerStorageHealth.RECOVERED
        ) {
          check(restoreCurrentSnapshot(appContext)) {
            "타이머 예약을 복원하지 못했습니다."
          }
        }
      }.fold(
        onSuccess = {
          markRestoreCompletedSafely(appContext)
          false
        },
        onFailure = {
          markRestorePendingSafely(appContext)
          true
        }
      )
    }
    // Reconciliation can refresh elapsed-time metadata or expire an overdue
    // timer, so status must be built from the post-reconciliation snapshot.
    val statusResult = AlarmPyoQuickTimerStore.read(appContext)
    val statusSnapshot = statusResult.snapshot ?: snapshot
    val plan = statusSnapshot.plan
    val remaining = if (statusSnapshot.isActive()) {
      AlarmPyoQuickTimerPolicy.remainingMillis(
        statusSnapshot,
        bootCount(appContext),
        System.currentTimeMillis(),
        SystemClock.elapsedRealtime()
      ).coerceAtLeast(0L)
    } else if (statusSnapshot.isPaused()) {
      statusSnapshot.pausedRemainingMillis
    } else 0L
    val active = statusSnapshot.isActive()
    val state = when {
      reconciliationFailed -> "error"
      active && requiredAction != "none" -> "action-required"
      active && AlarmPyoAlarmStore.isActiveSource(
        appContext,
        plan?.id.orEmpty(),
        AlarmPyoAlarmSource.TIMER
      ) -> "ringing"
      active -> "scheduled"
      statusSnapshot.isPaused() -> "paused"
      statusSnapshot.state == AlarmPyoQuickTimerSnapshotState.EXPIRED -> "expired"
      requiredAction != "none" -> "action-required"
      else -> "idle"
    }
    return AlarmPyoQuickTimerStatus(
      state = state,
      active = active,
      durationMinutes = statusSnapshot.durationMinutes,
      startedAt = statusSnapshot.startedAt,
      fireAt = if (statusSnapshot.isPaused()) 0L else plan?.alarmAt ?: 0L,
      remainingMillis = remaining,
      isRepeat = plan?.isSingleRepeat() == true,
      storageHealth = statusResult.storageHealth,
      requiredAction = requiredAction
    )
  }

  internal fun requiredAction(context: Context): String = when {
    !AlarmPyoAlarmPermissions.exactAlarmAllowed(context) -> "exact-alarm"
    !AlarmPyoAlarmPermissions.notificationsAllowed(context) -> "notifications"
    !AlarmPyoAlarmPermissions.fullScreenAllowed(context) -> "full-screen"
    else -> "none"
  }

  private fun markRestorePendingSafely(context: Context) {
    runCatching {
      AlarmPyoAlarmRestoreReceiver.markQuickTimerReconciliationPending(context)
    }
  }

  private fun markRestoreCompletedSafely(context: Context) {
    runCatching {
      AlarmPyoAlarmRestoreReceiver.markQuickTimerReconciliationCompleted(context)
    }
  }

  private fun restoreSnapshot(
    context: Context,
    snapshot: AlarmPyoQuickTimerSnapshot
  ): Boolean {
    val nowWallClock = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val currentBootCount = bootCount(context)
    val remaining = AlarmPyoQuickTimerPolicy.remainingMillis(
      snapshot,
      currentBootCount,
      nowWallClock,
      nowElapsed
    )
    val delay = AlarmPyoQuickTimerPolicy.restoredDelayMillis(remaining)
    if (delay == null) {
      expire(context)
      return true
    }
    val previousPlan = requireNotNull(snapshot.plan)
    val restoredPlan = AlarmPyoQuickTimerPolicy.rebasePlanForRestore(
      plan = previousPlan,
      nowWallClock = nowWallClock,
      delayMillis = delay
    )
    val restored = AlarmPyoQuickTimerStore.writeAuthoritative(
      context,
      AlarmPyoQuickTimerPolicy.restoredSnapshot(
        snapshot = snapshot,
        restoredPlan = restoredPlan,
        nowElapsed = nowElapsed,
        delayMillis = delay,
        currentBootCount = currentBootCount
      )
    )
    return runCatching {
      schedulePendingIntent(context, restoredPlan, restored.fireAtElapsed)
      true
    }.getOrElse { false }
  }

  private fun expire(context: Context) {
    processSyncGate.markNeedsReconciliation()
    AlarmPyoQuickTimerStore.writeAuthoritative(
      context,
      AlarmPyoQuickTimerSnapshot.idle(AlarmPyoQuickTimerSnapshotState.EXPIRED)
    )
    cancelPendingIntent(context)
    processSyncGate.markSuccessfulSync()
  }

  private fun schedulePendingIntent(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    triggerAtElapsed: Long
  ) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val operation = timerPendingIntent(
      context,
      plan,
      PendingIntent.FLAG_UPDATE_CURRENT
    ) ?: error("타이머 PendingIntent를 만들지 못했습니다.")
    when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> manager.setExactAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        triggerAtElapsed,
        operation
      )
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT -> manager.setExact(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        triggerAtElapsed,
        operation
      )
      else -> manager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtElapsed, operation)
    }
  }

  private fun cancelPendingIntent(context: Context) {
    val operation = timerPendingIntent(
      context,
      null,
      PendingIntent.FLAG_NO_CREATE
    ) ?: return
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(operation)
    operation.cancel()
  }

  private fun timerPendingIntent(
    context: Context,
    plan: AlarmPyoAlarmPlan?,
    flags: Int
  ): PendingIntent? {
    val intent = Intent(context, AlarmPyoQuickTimerReceiver::class.java).apply {
      action = ACTION_FIRE_ALARMPYO_QUICK_TIMER
      data = Uri.Builder()
        .scheme("alarmpyo-timer")
        .authority("quick")
        .appendPath("active")
        .build()
      putAlarmPyoSource(AlarmPyoAlarmSource.TIMER)
      plan?.addToIntent(this)
    }
    return PendingIntent.getBroadcast(
      context,
      TIMER_REQUEST_CODE,
      intent,
      flags or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun stopRingingTimerIfNeeded(context: Context) {
    if (AlarmPyoAlarmStore.activeSource(context) != AlarmPyoAlarmSource.TIMER) return
    context.stopService(Intent(context, AlarmPyoAlarmService::class.java))
    AlarmPyoAlarmActivity.finishActiveAlarm()
    AlarmPyoAlarmStore.clearActive(context)
  }

  private fun bootCount(context: Context): Int = runCatching {
    Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
  }.getOrDefault(-1)
}
