package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import kotlin.math.absoluteValue

internal data class AlarmPyoAlarmRetryResult(
  val plan: AlarmPyoAlarmPlan,
  val scheduled: Boolean
)

internal data class AlarmPyoSingleRepeatResult(
  val plan: AlarmPyoAlarmPlan,
  val created: Boolean
)

internal data class AlarmPyoAlarmDeliveryCompletionResult(
  val completed: Boolean,
  val automaticRepeat: AlarmPyoSingleRepeatResult? = null
)

/** 프로세스가 새로 시작됐을 때 저장된 계획을 AlarmManager에 한 번 다시 확인해요. */
internal class AlarmPyoAlarmColdStartReconciler {
  private var reconciled = false

  @Synchronized
  fun reconcileOnce(action: () -> Unit) {
    if (reconciled) return
    action()
    reconciled = true
  }

  @Synchronized
  fun markReconciled() {
    reconciled = true
  }
}

internal object AlarmPyoAlarmScheduler {
  private const val TEST_PLAN_ID = "__alarmpyo_test_alarm__"
  private const val TEST_REQUEST_CODE = 0x485454
  internal val SINGLE_REPEAT_DELAY_MILLIS: Long =
    AlarmPyoAlarmRuntimePolicy.AUTOMATIC_REPEAT_DELAY_MILLIS
  // Android가 절전·재부팅·시각 변경 때문에 늦게 전달한 알람은 원래 시각부터
  // 최대 30분까지 울립니다. 30분을 넘긴 알람은 새 근무 알람을 막지 않도록 제외합니다.
  internal val MISSED_ALARM_GRACE_MILLIS: Long = TimeUnit.MINUTES.toMillis(30)
  private const val EARLY_DELIVERY_TOLERANCE_MILLIS = 60_000L
  private const val MAX_DELIVERY_RETRIES = 4
  private val DELIVERY_RETRY_DELAYS_MILLIS = longArrayOf(
    TimeUnit.MINUTES.toMillis(1),
    TimeUnit.MINUTES.toMillis(3),
    TimeUnit.MINUTES.toMillis(5),
    TimeUnit.MINUTES.toMillis(10)
  )
  private val DATE_KEY_PATTERN = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$")
  private val coldStartReconciler = AlarmPyoAlarmColdStartReconciler()

  @Synchronized
  fun sync(
    context: Context,
    input: List<AlarmPyoAlarmPlan>,
    metadata: AlarmPyoAlarmSyncMetadata? = null
  ): List<AlarmPyoAlarmPlan> {
    val appContext = context.applicationContext
    val now = System.currentTimeMillis()
    val uniquePlans = LinkedHashMap<String, AlarmPyoAlarmPlan>()
    input.forEach { plan ->
      if (plan.id.isNotBlank() && plan.alarmAt > now) uniquePlans[plan.id] = plan
    }
    val plans = uniquePlans.values.sortedBy { it.alarmAt }
    metadata?.let { value ->
      val lastPlanAt = plans.maxOfOrNull { plan ->
        plan.originalAlarmAt.takeIf { it > 0L } ?: plan.alarmAt
      } ?: 0L
      require(value.generatedAt <= now + TimeUnit.MINUTES.toMillis(5)) {
        "알람 안전 계획 생성 시각이 올바르지 않아요."
      }
      require(value.refreshRecommendedAt > now) {
        "알람 권장 갱신 시각이 이미 지났어요."
      }
      require(value.safetyThroughAt >= lastPlanAt) {
        "알람 안전 계획 종료 시각이 실제 계획보다 이릅니다."
      }
    }
    val recoveringCorruptStorage =
      AlarmPyoAlarmStore.storageHealth(appContext) == AlarmPyoAlarmStorageHealth.CORRUPT
    val previousPlans = if (recoveringCorruptStorage) {
      emptyList()
    } else {
      AlarmPyoAlarmStore.readPlans(appContext)
    }
    val previousScheduledIds = if (recoveringCorruptStorage) {
      emptySet()
    } else {
      AlarmPyoAlarmStore.readScheduledIds(appContext)
    }
    if (recoveringCorruptStorage) {
      // A complete foreground JS plan is authoritative, including an intentionally empty plan.
      AlarmPyoAlarmStore.reseedAfterCorruption(appContext, plans)
    }
    val scheduled = replaceScheduleSafely(
      appContext,
      previousPlans,
      previousScheduledIds,
      plans,
      recoveringCorruptStorage
    )
    if (
      recoveringCorruptStorage &&
      AlarmPyoAlarmPermissions.canSchedule(appContext) &&
      scheduled.size != selectRestorableSchedule(plans).size
    ) {
      rearmSafetyCheck(appContext, force = true)
      error("손상 복구 중 일부 근무 알람을 예약하지 못해 다시 시도해야 해요.")
    }
    AlarmPyoPlanRefreshReminder.update(appContext, plans, metadata)
    AlarmPyoAlarmStore.markHealthy(appContext)
    coldStartReconciler.markReconciled()
    rearmSafetyCheck(appContext)
    return scheduled
  }

  @Synchronized
  fun reconcile(context: Context): List<AlarmPyoAlarmPlan> {
    reconcileInternal(context.applicationContext)
    coldStartReconciler.markReconciled()
    return getScheduledPlansInternal(context.applicationContext)
  }

  /**
   * 앱 프로세스의 첫 상태 조회에서는 저장 계획을 AlarmManager에 한 번 복구한 뒤 읽어요.
   * 이후 조회는 저장 상태만 읽어서 상태 화면을 열 때마다 같은 알람을 다시 등록하지 않아요.
   * 재부팅·시각 변경은 [restore], 근무표 변경은 [sync]가 별도로 실제 예약을 복구해요.
   */
  @Synchronized
  fun readScheduled(context: Context): List<AlarmPyoAlarmPlan> {
    val appContext = context.applicationContext
    // SharedPreferences의 예약 ID만으로 성공을 판단하지 않아요. 앱 프로세스가 새로
    // 시작된 뒤 첫 상태 조회에서 저장된 계획을 AlarmManager에 실제로 다시 올려요.
    coldStartReconciler.reconcileOnce { reconcileInternal(appContext) }
    return selectScheduledPlans(
      AlarmPyoAlarmStore.readPlans(appContext),
      AlarmPyoAlarmStore.readScheduledIds(appContext)
    )
  }

  @Synchronized
  fun restore(
    context: Context,
    recalculateLocalTimes: Boolean = false
  ): AlarmPyoAlarmRestoreResult {
    val appContext = context.applicationContext
    if (AlarmPyoAlarmStore.storageHealth(appContext) == AlarmPyoAlarmStorageHealth.CORRUPT) {
      // 손상된 빈 값을 정상적인 0/0 복원으로 덮어쓰지 않아요.
      val result = AlarmPyoAlarmRestoreResult(
        expectedCount = 0,
        scheduledCount = 0,
        completed = false
      )
      rearmSafetyCheck(appContext, force = true)
      return result
    }
    val previousPlans = AlarmPyoAlarmStore.readPlans(appContext)
    val previousScheduledIds = AlarmPyoAlarmStore.readScheduledIds(appContext)
    val previousRepeats = AlarmPyoAlarmStore.readSingleRepeats(appContext)

    // 시험 알람은 진단 중에만 의미가 있으므로 재부팅·업데이트 뒤에는 남기지 않습니다.
    val activeRepeats = restorableSingleRepeats(previousRepeats)
    AlarmPyoAlarmStore.writeSingleRepeats(
      appContext,
      activeRepeats
    )
    AlarmPyoAlarmStore.writeTestAlarmAt(appContext, 0L)

    val recalculatedPlans = if (recalculateLocalTimes) {
      recalculateAlarmTimes(previousPlans)
    } else {
      previousPlans
    }
    val now = System.currentTimeMillis()
    val restorablePlans = recalculatedPlans
      .filter { plan ->
        (plan.originalAlarmAt.takeIf { value -> value > 0L } ?: plan.alarmAt) >
          now - MISSED_ALARM_GRACE_MILLIS
      }
      .sortedBy(AlarmPyoAlarmPlan::alarmAt)

    val expectedCount = selectRestorableSchedule(restorablePlans).size
    val scheduled = replaceScheduleSafely(
      appContext,
      previousPlans,
      previousScheduledIds,
      restorablePlans
    )
    AlarmPyoPlanRefreshReminder.restore(appContext)

    val activeRepeatRoots = activeRepeats.mapTo(hashSetOf(), AlarmPyoAlarmPlan::rootPlanId)
    previousRepeats
      .filter { it.rootPlanId !in activeRepeatRoots }
      .forEach { cancelSingleRepeatPendingIntent(appContext, it) }
    cancelTestAlarm(appContext)
    coldStartReconciler.markReconciled()
    rearmSafetyCheck(appContext, force = true)
    return AlarmPyoAlarmRestoreResult(
      expectedCount = expectedCount,
      scheduledCount = scheduled.size
    )
  }

  @Synchronized
  fun planForFiringIntent(context: Context, intent: Intent): AlarmPyoAlarmPlan? {
    val intentPlan = AlarmPyoAlarmPlan.fromIntent(intent) ?: return null
    val appContext = context.applicationContext
    if (intentPlan.isSingleRepeat()) {
      val storedPlan = AlarmPyoAlarmStore.readSingleRepeats(appContext)
        .firstOrNull { it.hasSameDeliveryGeneration(intentPlan) }
        ?: return null
      if (!isWithinFiringWindow(storedPlan)) {
        removeSingleRepeat(appContext, storedPlan.rootPlanId)
        reconcileSingleRepeats(appContext)
        return null
      }
      return storedPlan
    }
    if (intent.getBooleanExtra(EXTRA_IS_TEST, false)) {
      val storedAlarmAt = AlarmPyoAlarmStore.readTestAlarmAt(appContext)
      if (storedAlarmAt != intentPlan.alarmAt) return null
      if (!isWithinFiringWindow(intentPlan)) {
        AlarmPyoAlarmStore.writeTestAlarmAt(appContext, 0L)
        return null
      }
      return intentPlan
    }
    val storedPlan = AlarmPyoAlarmStore.readPlans(appContext)
      .firstOrNull { it.hasSameDeliveryGeneration(intentPlan) }
      ?: return null
    if (!isWithinFiringWindow(storedPlan)) {
      reconcileInternal(appContext)
      return null
    }
    return storedPlan
  }

  @Synchronized
  fun markAsFiredAndRefill(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    isTest: Boolean
  ): Boolean {
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.requireWritableSnapshot(appContext)
    if (plan.isSingleRepeat()) {
      val storedPlan = AlarmPyoAlarmStore.readSingleRepeats(appContext)
        .firstOrNull { it.rootPlanId == plan.rootPlanId }
        ?: return true
      if (!storedPlan.hasSameDeliveryGeneration(plan)) return false
      removeSingleRepeat(appContext, storedPlan.rootPlanId)
      cancelSingleRepeatPendingIntent(appContext, storedPlan)
      return true
    }
    if (isTest) {
      val storedAlarmAt = AlarmPyoAlarmStore.readTestAlarmAt(appContext)
      if (storedAlarmAt == 0L) return true
      if (storedAlarmAt != plan.alarmAt) return false
      // 시험 알람도 수신 시점에 1분 안전 재시도를 미리 걸기 때문에 저장 시각이
      // 원래 plan.alarmAt과 다를 수 있습니다. 실제 재생 확인 후에는 항상 지웁니다.
      AlarmPyoAlarmStore.writeTestAlarmAt(appContext, 0L)
      cancelTestAlarm(appContext)
      return true
    }

    val storedPlans = AlarmPyoAlarmStore.readPlans(appContext)
    val storedPlan = storedPlans.firstOrNull { it.id == plan.id } ?: return true
    if (!storedPlan.hasSameDeliveryGeneration(plan)) return false

    val remaining = storedPlans.filterNot { it.hasSameDeliveryGeneration(plan) }
    val scheduledIds = AlarmPyoAlarmStore.readScheduledIds(appContext).toMutableSet()
    scheduledIds.remove(plan.id)
    AlarmPyoAlarmStore.writeScheduleSnapshot(appContext, remaining, scheduledIds)
    // 수신 직전에 미리 걸어 둔 서비스 시작 안전 재시도를 실제 재생 확인 후 취소합니다.
    cancelPendingIntent(appContext, plan.id, requestCodeFor(plan.id))
    reconcileInternal(appContext)
    rearmSafetyCheck(appContext)
    return true
  }

  /**
   * 실제 소리 재생이 확인된 전달만 완료하고 5분 뒤 1회 재알람을 예약해요.
   * generation 검증, 원래 계획 소비, 반복 예약을 같은 잠금 안에서 처리해 stale 전달이
   * 반복 알람을 남기지 않도록 해요.
   */
  @Synchronized
  fun completeConfirmedDelivery(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    isTest: Boolean,
    automaticRepeatEligible: Boolean,
    nowMillis: Long = System.currentTimeMillis()
  ): AlarmPyoAlarmDeliveryCompletionResult {
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.requireWritableSnapshot(appContext)
    if (!hasCurrentDeliveryGeneration(appContext, plan, isTest)) {
      return AlarmPyoAlarmDeliveryCompletionResult(completed = false)
    }
    if (!markAsFiredAndRefill(appContext, plan, isTest)) {
      return AlarmPyoAlarmDeliveryCompletionResult(completed = false)
    }

    val repeat = if (
      automaticRepeatEligible && shouldArmAutomaticSingleRepeat(plan)
    ) {
      ensureAutomaticSingleRepeat(appContext, plan, isTest, nowMillis)
    } else {
      null
    }
    return AlarmPyoAlarmDeliveryCompletionResult(
      completed = true,
      automaticRepeat = repeat
    )
  }

  /**
   * 포그라운드 서비스 시작 또는 실제 음원 재생이 실패했을 때만 호출합니다.
   * 원래 알람 시각부터 30분 안에서 1·3·5·10분 간격으로 다시 시도합니다.
   * 마지막 실패 계획은 즉시 소비하지 않고 저장하되 다음 근무 알람 3개는 계속 채웁니다.
   */
  @Synchronized
  fun retryDelivery(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    isTest: Boolean
  ): AlarmPyoAlarmRetryResult? {
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.requireWritableSnapshot(appContext)
    val currentPlan = when {
      plan.isSingleRepeat() -> AlarmPyoAlarmStore.readSingleRepeats(appContext)
        .firstOrNull { it.hasSameDeliveryGeneration(plan) }
        ?: return null
      isTest -> {
        if (AlarmPyoAlarmStore.readTestAlarmAt(appContext) != plan.alarmAt) return null
        plan
      }
      else -> AlarmPyoAlarmStore.readPlans(appContext)
        .firstOrNull { it.hasSameDeliveryGeneration(plan) }
        ?: return null
    }
    val now = System.currentTimeMillis()
    val originalAlarmAt = currentPlan.originalAlarmAt.takeIf { it > 0L } ?: currentPlan.alarmAt
    val delay = DELIVERY_RETRY_DELAYS_MILLIS.getOrNull(currentPlan.deliveryAttempt)
    val retryAt = delay?.let { now + it }
    val canRetry = retryAt != null && retryAt <= originalAlarmAt + MISSED_ALARM_GRACE_MILLIS

    if (!canRetry) {
      if (currentPlan.isSingleRepeat()) {
        removeSingleRepeat(appContext, currentPlan.rootPlanId)
        cancelSingleRepeatPendingIntent(appContext, currentPlan)
        return AlarmPyoAlarmRetryResult(currentPlan, scheduled = false)
      } else if (isTest) {
        if (AlarmPyoAlarmStore.readTestAlarmAt(appContext) == currentPlan.alarmAt) {
          AlarmPyoAlarmStore.writeTestAlarmAt(appContext, 0L)
        }
        return AlarmPyoAlarmRetryResult(currentPlan, scheduled = false)
      } else {
        val exhaustedPlan = currentPlan.copy(deliveryAttempt = MAX_DELIVERY_RETRIES + 1)
        val exhaustedPlans = replacePlanGeneration(
          AlarmPyoAlarmStore.readPlans(appContext),
          currentPlan,
          exhaustedPlan
        ) ?: return null
        val scheduledIds = AlarmPyoAlarmStore.readScheduledIds(appContext).toMutableSet()
        scheduledIds.remove(currentPlan.id)
        AlarmPyoAlarmStore.writeScheduleSnapshot(appContext, exhaustedPlans, scheduledIds)
        reconcileInternal(appContext)
        return AlarmPyoAlarmRetryResult(exhaustedPlan, scheduled = false)
      }
    }
    val confirmedRetryAt = requireNotNull(retryAt)

    val retryPlan = currentPlan.copy(
      alarmAt = confirmedRetryAt,
      originalAlarmAt = originalAlarmAt,
      deliveryAttempt = currentPlan.deliveryAttempt + 1
    )
    if (retryPlan.isSingleRepeat()) {
      if (!replaceStoredSingleRepeat(appContext, currentPlan, retryPlan)) return null
      val scheduled = runCatching {
        setAlarmClock(
          appContext,
          retryPlan,
          isTest = isTest,
          requestCode = singleRepeatRequestCode(retryPlan.rootPlanId)
        )
      }.isSuccess
      if (!scheduled) reconcileSingleRepeats(appContext)
      return AlarmPyoAlarmRetryResult(retryPlan, scheduled)
    }

    if (isTest) {
      AlarmPyoAlarmStore.writeTestAlarmAt(appContext, retryPlan.alarmAt)
      val scheduled = runCatching {
        setAlarmClock(
          appContext,
          retryPlan,
          isTest = true,
          requestCode = TEST_REQUEST_CODE
        )
      }.isSuccess
      if (!scheduled) AlarmPyoAlarmStore.writeTestAlarmAt(appContext, 0L)
      return AlarmPyoAlarmRetryResult(if (scheduled) retryPlan else currentPlan, scheduled)
    }

    val storedPlans = AlarmPyoAlarmStore.readPlans(appContext)
    val retryPlans = replacePlanGeneration(storedPlans, currentPlan, retryPlan) ?: return null
    val scheduledIds = AlarmPyoAlarmStore.readScheduledIds(appContext).toMutableSet()
    AlarmPyoAlarmStore.writeScheduleSnapshot(
      appContext,
      transitionPlans(storedPlans, retryPlans),
      scheduledIds
    )
    val scheduled = runCatching {
      setAlarmClock(
        appContext,
        retryPlan,
        isTest = false,
        requestCode = requestCodeFor(retryPlan.id)
      )
    }.isSuccess
    if (scheduled) {
      scheduledIds.add(retryPlan.id)
      AlarmPyoAlarmStore.writeScheduleSnapshot(appContext, retryPlans, scheduledIds)
      return AlarmPyoAlarmRetryResult(retryPlan, scheduled = true)
    }

    val exhaustedPlan = retryPlan.copy(deliveryAttempt = MAX_DELIVERY_RETRIES + 1)
    val exhaustedPlans = replacePlanGeneration(storedPlans, currentPlan, exhaustedPlan)
      ?: return null
    scheduledIds.remove(currentPlan.id)
    AlarmPyoAlarmStore.writeScheduleSnapshot(appContext, exhaustedPlans, scheduledIds)
    reconcileInternal(appContext)
    return AlarmPyoAlarmRetryResult(exhaustedPlan, scheduled = false)
  }

  @Synchronized
  fun ensureAutomaticSingleRepeat(
    context: Context,
    original: AlarmPyoAlarmPlan,
    isTest: Boolean,
    nowMillis: Long = System.currentTimeMillis()
  ): AlarmPyoSingleRepeatResult? {
    if (!shouldArmAutomaticSingleRepeat(original)) return null
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.requireWritableSnapshot(appContext)
    val existing = AlarmPyoAlarmStore.readSingleRepeats(appContext)
      .firstOrNull { it.rootPlanId == original.rootPlanId }
    if (existing != null) return AlarmPyoSingleRepeatResult(existing, created = false)
    return scheduleSingleRepeat(
      appContext,
      original,
      isTest,
      nowMillis + SINGLE_REPEAT_DELAY_MILLIS
    )?.let { AlarmPyoSingleRepeatResult(it, created = true) }
  }

  @Synchronized
  fun scheduleManualSingleRepeat(
    context: Context,
    original: AlarmPyoAlarmPlan,
    isTest: Boolean,
    minutes: Int = 5
  ): AlarmPyoAlarmPlan? {
    if (original.isSingleRepeat()) return null
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.requireWritableSnapshot(appContext)
    val alarmAt = System.currentTimeMillis() + minutes.coerceIn(1, 60) * 60_000L
    return scheduleSingleRepeat(appContext, original, isTest, alarmAt)
  }

  @Synchronized
  fun cancelSingleRepeat(context: Context, rootPlanId: String) {
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.requireWritableSnapshot(appContext)
    val stored = AlarmPyoAlarmStore.readSingleRepeats(appContext)
    val cancelled = stored.filter { it.rootPlanId == rootPlanId }
    val remaining = removeSingleRepeat(stored, rootPlanId)
    if (remaining != stored) AlarmPyoAlarmStore.writeSingleRepeats(appContext, remaining)
    cancelled.forEach { cancelSingleRepeatPendingIntent(appContext, it) }
  }

  internal fun shouldArmAutomaticSingleRepeat(plan: AlarmPyoAlarmPlan): Boolean =
    !plan.isSingleRepeat()

  internal fun createSingleRepeatPlan(
    original: AlarmPyoAlarmPlan,
    alarmAt: Long
  ): AlarmPyoAlarmPlan {
    val rootId = original.rootPlanId
      .ifBlank { original.id }
      .substringBefore(SINGLE_REPEAT_ID_SUFFIX)
      .substringBefore(":snooze")
    return original.copy(
      id = "$rootId$SINGLE_REPEAT_ID_SUFFIX",
      dateKey = "",
      alarmAt = alarmAt,
      startMinutes = -1,
      alarmMinutesBefore = -1,
      originalAlarmAt = alarmAt,
      deliveryAttempt = 0,
      rootPlanId = rootId,
      repeatStage = SINGLE_REPEAT_STAGE
    )
  }

  internal fun upsertSingleRepeat(
    plans: List<AlarmPyoAlarmPlan>,
    repeat: AlarmPyoAlarmPlan
  ): List<AlarmPyoAlarmPlan> = plans
    .filterNot { it.rootPlanId == repeat.rootPlanId }
    .plus(repeat)
    .sortedBy(AlarmPyoAlarmPlan::alarmAt)

  internal fun removeSingleRepeat(
    plans: List<AlarmPyoAlarmPlan>,
    rootPlanId: String
  ): List<AlarmPyoAlarmPlan> = plans.filterNot { it.rootPlanId == rootPlanId }

  internal fun restorableSingleRepeats(
    plans: List<AlarmPyoAlarmPlan>,
    nowMillis: Long = System.currentTimeMillis()
  ): List<AlarmPyoAlarmPlan> = plans.filter { plan ->
    plan.isSingleRepeat() &&
      plan.shiftTypeId != "test" &&
      plan.originalAlarmAt > nowMillis - MISSED_ALARM_GRACE_MILLIS
  }.distinctBy(AlarmPyoAlarmPlan::rootPlanId)
    .sortedBy(AlarmPyoAlarmPlan::alarmAt)

  @Synchronized
  fun scheduleTest(context: Context, seconds: Int) {
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.requireWritableSnapshot(appContext)
    check(AlarmPyoAlarmPermissions.canDeliver(appContext)) { "알람 권한이 필요합니다." }

    cancelSingleRepeat(appContext, TEST_PLAN_ID)
    val delaySeconds = seconds.coerceIn(5, 60)
    val alarmAt = System.currentTimeMillis() + delaySeconds * 1_000L
    val plan = AlarmPyoAlarmPlan(
      id = TEST_PLAN_ID,
      dateKey = "",
      shiftTypeId = "test",
      shiftName = "시험 알람",
      alarmAt = alarmAt,
      originalAlarmAt = alarmAt
    )
    AlarmPyoAlarmStore.writeTestAlarmAt(appContext, alarmAt)
    runCatching {
      setAlarmClock(appContext, plan, isTest = true, requestCode = TEST_REQUEST_CODE)
    }.onFailure {
      AlarmPyoAlarmStore.writeTestAlarmAt(appContext, 0L)
      cancelTestAlarm(appContext)
    }.getOrThrow()
  }

  @Synchronized
  fun cancelAll(context: Context) {
    val appContext = context.applicationContext
    val knownWorkIds = buildSet {
      addAll(AlarmPyoAlarmStore.readScheduledIds(appContext))
      AlarmPyoAlarmStore.readPlans(appContext).mapTo(this, AlarmPyoAlarmPlan::id)
    }
    val knownRepeats = AlarmPyoAlarmStore.readSingleRepeats(appContext)
    AlarmPyoAlarmStore.clearForExplicitCancellation(appContext)
    cancelWorkAlarmIds(appContext, knownWorkIds)
    cancelTestAlarm(appContext)
    knownRepeats.forEach { cancelSingleRepeatPendingIntent(appContext, it) }
    AlarmPyoPlanRefreshReminder.clear(appContext)
    appContext.stopService(Intent(appContext, AlarmPyoAlarmService::class.java))
    AlarmPyoAlarmActivity.finishActiveAlarm()
    coldStartReconciler.markReconciled()
    rearmSafetyCheck(appContext)
    AlarmPyoAlarmStore.markHealthy(appContext)
  }

  private fun rearmSafetyCheck(context: Context, force: Boolean = false) {
    runCatching { AlarmPyoAlarmSafetyScheduler.rearm(context, force) }
      .onFailure { error -> Log.e("AlarmPyoAlarmSafety", "알람 안전 점검을 다시 예약하지 못했어요.", error) }
  }

  private fun reconcileInternal(context: Context) {
    if (AlarmPyoAlarmStore.storageHealth(context) == AlarmPyoAlarmStorageHealth.CORRUPT) return
    pruneExpiredPlans(context)

    val plans = AlarmPyoAlarmStore.readPlans(context)
    val previousScheduledIds = AlarmPyoAlarmStore.readScheduledIds(context)

    if (!AlarmPyoAlarmPermissions.canSchedule(context)) {
      AlarmPyoAlarmStore.writeScheduleSnapshot(context, plans, emptySet())
      cancelWorkAlarmIds(context, previousScheduledIds + plans.map(AlarmPyoAlarmPlan::id))
      cancelScheduledSingleRepeats(context)
      return
    }

    val desiredPlans = selectRestorableSchedule(plans)
    val scheduledIds = linkedSetOf<String>()

    // 새 예약을 먼저 등록하고 디스크 snapshot을 확정한 뒤 오래된 예약을 취소합니다.
    // 중간에 프로세스가 종료되어도 최소한 이전 또는 새 예약 중 하나는 남습니다.
    desiredPlans.forEach { plan ->
      runCatching {
        setAlarmClock(context, plan, isTest = false, requestCode = requestCodeFor(plan.id))
      }.onSuccess {
        scheduledIds.add(plan.id)
      }
    }
    AlarmPyoAlarmStore.writeScheduleSnapshot(context, plans, scheduledIds)
    cancelWorkAlarmIds(context, previousScheduledIds - scheduledIds)
    reconcileSingleRepeats(context)
  }

  /**
   * 근무표 변경 중 앱 프로세스가 종료되어도 기존 generation과 새 generation 중 하나가
   * 수신기 검증을 통과하도록 짧은 전환 snapshot을 먼저 저장합니다.
   */
  private fun replaceScheduleSafely(
    context: Context,
    previousPlans: List<AlarmPyoAlarmPlan>,
    previousScheduledIds: Set<String>,
    plans: List<AlarmPyoAlarmPlan>,
    recoveringCorruptStorage: Boolean = false
  ): List<AlarmPyoAlarmPlan> {
    val previousKnownIds = buildSet {
      addAll(previousScheduledIds)
      previousPlans.mapTo(this, AlarmPyoAlarmPlan::id)
    }
    val transitionalPlans = transitionPlans(previousPlans, plans)
    val transitionIds = transitionalPlans.mapTo(linkedSetOf(), AlarmPyoAlarmPlan::id)
    writeScheduleSnapshot(
      context,
      transitionalPlans,
      previousScheduledIds.intersect(transitionIds),
      recoveringCorruptStorage
    )

    if (!AlarmPyoAlarmPermissions.canSchedule(context)) {
      writeScheduleSnapshot(context, plans, emptySet(), recoveringCorruptStorage)
      cancelWorkAlarmIds(context, previousKnownIds)
      cancelScheduledSingleRepeats(context)
      return emptyList()
    }

    val scheduledIds = linkedSetOf<String>()
    selectRestorableSchedule(plans)
      .forEach { plan ->
        runCatching {
          setAlarmClock(context, plan, isTest = false, requestCode = requestCodeFor(plan.id))
        }.onSuccess {
          scheduledIds.add(plan.id)
        }
      }

    // snapshot 저장이 실패하면 전환 snapshot과 기존 예약을 그대로 유지합니다.
    writeScheduleSnapshot(context, plans, scheduledIds, recoveringCorruptStorage)
    cancelWorkAlarmIds(context, previousKnownIds - scheduledIds)
    reconcileSingleRepeats(context)
    return selectScheduledPlans(plans, scheduledIds)
  }

  private fun writeScheduleSnapshot(
    context: Context,
    plans: List<AlarmPyoAlarmPlan>,
    scheduledIds: Collection<String>,
    recoveringCorruptStorage: Boolean
  ) {
    if (recoveringCorruptStorage) {
      AlarmPyoAlarmStore.writeScheduleSnapshotForCorruptionRecovery(
        context,
        plans,
        scheduledIds
      )
    } else {
      AlarmPyoAlarmStore.writeScheduleSnapshot(context, plans, scheduledIds)
    }
  }

  internal fun selectRestorableSchedule(
    plans: List<AlarmPyoAlarmPlan>
  ): List<AlarmPyoAlarmPlan> = plans
    .filter { it.deliveryAttempt <= MAX_DELIVERY_RETRIES }
    .take(MAX_SCHEDULED_ALARMS)

  private fun pruneExpiredPlans(context: Context) {
    val now = System.currentTimeMillis()
    val plans = AlarmPyoAlarmStore.readPlans(context)
    val futurePlans = plans
      .filter { (it.originalAlarmAt.takeIf { value -> value > 0L } ?: it.alarmAt) > now - MISSED_ALARM_GRACE_MILLIS }
      .sortedBy { it.alarmAt }
    if (plans != futurePlans) AlarmPyoAlarmStore.writePlans(context, futurePlans)
  }

  private fun isWithinFiringWindow(plan: AlarmPyoAlarmPlan): Boolean {
    val now = System.currentTimeMillis()
    val originalAlarmAt = plan.originalAlarmAt.takeIf { it > 0L } ?: plan.alarmAt
    return plan.alarmAt > 0L &&
      plan.alarmAt <= now + EARLY_DELIVERY_TOLERANCE_MILLIS &&
      originalAlarmAt > now - MISSED_ALARM_GRACE_MILLIS
  }

  internal fun replacePlanGeneration(
    plans: List<AlarmPyoAlarmPlan>,
    expected: AlarmPyoAlarmPlan,
    replacement: AlarmPyoAlarmPlan
  ): List<AlarmPyoAlarmPlan>? {
    if (plans.none { it.hasSameDeliveryGeneration(expected) }) return null
    return plans
      .filterNot { it.hasSameDeliveryGeneration(expected) }
      .toMutableList()
      .apply { add(replacement) }
      .sortedBy { it.alarmAt }
  }

  private fun scheduleSingleRepeat(
    context: Context,
    original: AlarmPyoAlarmPlan,
    isTest: Boolean,
    alarmAt: Long
  ): AlarmPyoAlarmPlan? {
    if (alarmAt <= System.currentTimeMillis()) return null
    val before = AlarmPyoAlarmStore.readSingleRepeats(context)
    val repeat = createSingleRepeatPlan(original, alarmAt)
    AlarmPyoAlarmStore.writeSingleRepeats(context, upsertSingleRepeat(before, repeat))
    return runCatching {
      setAlarmClock(
        context,
        repeat,
        isTest = isTest || original.shiftTypeId == "test",
        requestCode = singleRepeatRequestCode(repeat.rootPlanId)
      )
      repeat
    }.getOrElse {
      AlarmPyoAlarmStore.writeSingleRepeats(context, before)
      before
        .filter { it.rootPlanId == repeat.rootPlanId }
        .forEach { previous ->
          runCatching {
            setAlarmClock(
              context,
              previous,
              isTest = previous.shiftTypeId == "test",
              requestCode = singleRepeatRequestCode(previous.rootPlanId)
            )
          }
        }
      null
    }
  }

  private fun hasCurrentDeliveryGeneration(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    isTest: Boolean
  ): Boolean = when {
    plan.isSingleRepeat() -> AlarmPyoAlarmStore.readSingleRepeats(context)
      .any { it.hasSameDeliveryGeneration(plan) }
    isTest -> AlarmPyoAlarmStore.readTestAlarmAt(context) == plan.alarmAt
    else -> AlarmPyoAlarmStore.readPlans(context)
      .any { it.hasSameDeliveryGeneration(plan) }
  }

  private fun replaceStoredSingleRepeat(
    context: Context,
    expected: AlarmPyoAlarmPlan,
    replacement: AlarmPyoAlarmPlan
  ): Boolean {
    val stored = AlarmPyoAlarmStore.readSingleRepeats(context)
    if (stored.none { it.hasSameDeliveryGeneration(expected) }) return false
    AlarmPyoAlarmStore.writeSingleRepeats(context, upsertSingleRepeat(stored, replacement))
    return true
  }

  private fun removeSingleRepeat(context: Context, rootPlanId: String) {
    val stored = AlarmPyoAlarmStore.readSingleRepeats(context)
    val remaining = removeSingleRepeat(stored, rootPlanId)
    if (remaining != stored) AlarmPyoAlarmStore.writeSingleRepeats(context, remaining)
  }

  private fun reconcileSingleRepeats(context: Context) {
    val now = System.currentTimeMillis()
    val stored = AlarmPyoAlarmStore.readSingleRepeats(context)
    val active = stored.filter { plan ->
      plan.isSingleRepeat() &&
        plan.originalAlarmAt > now - MISSED_ALARM_GRACE_MILLIS
    }.distinctBy(AlarmPyoAlarmPlan::rootPlanId)
      .sortedBy(AlarmPyoAlarmPlan::alarmAt)
    if (active != stored) AlarmPyoAlarmStore.writeSingleRepeats(context, active)
    if (!AlarmPyoAlarmPermissions.canSchedule(context)) return
    active.forEach { repeat ->
      runCatching {
        setAlarmClock(
          context,
          repeat,
          isTest = repeat.shiftTypeId == "test",
          requestCode = singleRepeatRequestCode(repeat.rootPlanId)
        )
      }
    }
  }

  private fun recalculateAlarmTimes(plans: List<AlarmPyoAlarmPlan>): List<AlarmPyoAlarmPlan> =
    plans.map { plan ->
      calculateLocalAlarmAt(plan)?.let { recalculatedAlarmAt ->
        plan.copy(
          alarmAt = recalculatedAlarmAt,
          originalAlarmAt = recalculatedAlarmAt,
          deliveryAttempt = 0
        )
      } ?: plan
    }.sortedBy(AlarmPyoAlarmPlan::alarmAt)

  internal fun calculateLocalAlarmAt(
    plan: AlarmPyoAlarmPlan,
    timeZone: TimeZone = TimeZone.getDefault()
  ): Long? {
    if (
      plan.startMinutes !in 0..1439 ||
      plan.alarmMinutesBefore !in 0..MAX_ALARM_MINUTES_BEFORE
    ) return null
    val match = DATE_KEY_PATTERN.matchEntire(plan.dateKey) ?: return null
    val year = match.groupValues[1].toIntOrNull() ?: return null
    val month = match.groupValues[2].toIntOrNull() ?: return null
    val day = match.groupValues[3].toIntOrNull() ?: return null

    // 날짜 자체는 엄격하게 검증하고, 실제 시각 계산은 DST 공백 시각을 다음 유효
    // 시각으로 보정하도록 lenient Calendar를 사용합니다.
    runCatching {
      GregorianCalendar(timeZone).apply {
        isLenient = false
        clear()
        set(year, month - 1, day, 12, 0, 0)
        timeInMillis
      }
    }.getOrNull() ?: return null

    return GregorianCalendar(timeZone).apply {
      isLenient = true
      clear()
      set(
        year,
        month - 1,
        day,
        plan.startMinutes / 60,
        plan.startMinutes % 60,
        0
      )
      set(Calendar.MILLISECOND, 0)
      add(Calendar.MINUTE, -plan.alarmMinutesBefore)
    }.timeInMillis
  }

  private fun getScheduledPlansInternal(context: Context): List<AlarmPyoAlarmPlan> {
    return selectScheduledPlans(
      AlarmPyoAlarmStore.readPlans(context),
      AlarmPyoAlarmStore.readScheduledIds(context)
    )
  }

  internal fun selectScheduledPlans(
    plans: List<AlarmPyoAlarmPlan>,
    scheduledIds: Set<String>
  ): List<AlarmPyoAlarmPlan> = plans
    .filter { it.id in scheduledIds }
    .sortedBy { it.alarmAt }

  internal fun transitionPlans(
    previousPlans: List<AlarmPyoAlarmPlan>,
    desiredPlans: List<AlarmPyoAlarmPlan>
  ): List<AlarmPyoAlarmPlan> = buildList {
    addAll(desiredPlans)
    val desiredIds = desiredPlans.mapTo(hashSetOf(), AlarmPyoAlarmPlan::id)
    previousPlans.forEach { previous ->
      if (
        previous.id in desiredIds &&
        none { candidate -> candidate.hasSameDeliveryGeneration(previous) }
      ) {
        add(previous)
      }
    }
  }

  private fun setAlarmClock(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    isTest: Boolean,
    requestCode: Int
  ) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val operation = alarmPendingIntent(context, plan, isTest, requestCode)
    val showIntent = alarmListPendingIntent(context, requestCode)
    manager.setAlarmClock(AlarmManager.AlarmClockInfo(plan.alarmAt, showIntent), operation)
  }

  private fun alarmPendingIntent(
    context: Context,
    plan: AlarmPyoAlarmPlan,
    isTest: Boolean,
    requestCode: Int
  ): PendingIntent {
    val intent = Intent(context, AlarmPyoAlarmReceiver::class.java).apply {
      action = ACTION_FIRE_ALARM
      data = alarmUri(plan.id, isTest, plan.repeatStage)
      putExtra(EXTRA_IS_TEST, isTest)
      plan.addToIntent(this)
    }
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun alarmListPendingIntent(context: Context, requestCode: Int): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(
      context,
      requestCode xor 0x41524D,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun cancelWorkAlarmIds(context: Context, ids: Collection<String>) {
    ids.forEach { id ->
      cancelPendingIntent(context, id, requestCodeFor(id), repeatStage = 0)
    }
  }

  private fun cancelTestAlarm(context: Context) {
    cancelPendingIntent(
      context,
      TEST_PLAN_ID,
      TEST_REQUEST_CODE,
      isTest = true,
      repeatStage = 0
    )
  }

  private fun cancelScheduledSingleRepeats(context: Context) {
    AlarmPyoAlarmStore.readSingleRepeats(context).forEach { repeat ->
      cancelSingleRepeatPendingIntent(context, repeat)
    }
  }

  private fun cancelSingleRepeatPendingIntent(context: Context, repeat: AlarmPyoAlarmPlan) {
    cancelPendingIntent(
      context,
      repeat.id,
      singleRepeatRequestCode(repeat.rootPlanId),
      isTest = repeat.shiftTypeId == "test",
      repeatStage = SINGLE_REPEAT_STAGE
    )
  }

  private fun cancelPendingIntent(
    context: Context,
    id: String,
    requestCode: Int,
    isTest: Boolean = false,
    repeatStage: Int = 0
  ) {
    val intent = Intent(context, AlarmPyoAlarmReceiver::class.java).apply {
      action = ACTION_FIRE_ALARM
      data = alarmUri(id, isTest, repeatStage)
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    ) ?: return
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    manager.cancel(pendingIntent)
    pendingIntent.cancel()
  }

  private fun alarmUri(id: String, isTest: Boolean, repeatStage: Int): Uri = Uri.Builder()
    .scheme("alarmpyo-alarm")
    .authority(
      when {
        repeatStage == SINGLE_REPEAT_STAGE && isTest -> "test-repeat"
        repeatStage == SINGLE_REPEAT_STAGE -> "work-repeat"
        isTest -> "test"
        else -> "work"
      }
    )
    .appendPath(id)
    .build()

  private fun requestCodeFor(id: String): Int = (id.hashCode() xor 0x485453).absoluteValue

  private fun singleRepeatRequestCode(rootPlanId: String): Int =
    (rootPlanId.hashCode() xor 0x485250).absoluteValue
}
