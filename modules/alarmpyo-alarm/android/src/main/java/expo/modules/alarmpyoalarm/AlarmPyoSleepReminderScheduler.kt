package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log

internal val ALARMPYO_SLEEP_REMINDER_RESTORE_ACTIONS = setOf(
  Intent.ACTION_BOOT_COMPLETED,
  Intent.ACTION_LOCKED_BOOT_COMPLETED,
  Intent.ACTION_MY_PACKAGE_REPLACED,
  Intent.ACTION_TIME_CHANGED,
  Intent.ACTION_TIMEZONE_CHANGED
)

internal fun shouldRestoreSleepReminders(action: String?): Boolean =
  action in ALARMPYO_SLEEP_REMINDER_RESTORE_ACTIONS

internal fun persistSleepReminderReconciliation(
  snapshot: AlarmPyoSleepReminderSnapshot,
  schedulingFailures: List<Pair<String, Throwable>>,
  persist: (AlarmPyoSleepReminderSnapshot) -> AlarmPyoSleepReminderSnapshot
): AlarmPyoSleepReminderSnapshot {
  val stored = persist(snapshot)
  if (schedulingFailures.isEmpty()) return stored

  val failedIds = schedulingFailures.mapTo(linkedSetOf()) { (id, _) -> id }
  val error = IllegalStateException(
    "수면 시작 알림 ${failedIds.size}개를 예약하지 못해 다시 시도해요.",
    schedulingFailures.first().second
  )
  schedulingFailures.drop(1).forEach { (_, cause) -> error.addSuppressed(cause) }
  throw error
}

internal fun requireAuthoritativePlansForCorruptSleepReminderReseed(
  activePlanCount: Int
) {
  check(activePlanCount > 0) {
    "수면 시작 알림 저장소가 손상됐지만 확인할 계획이 없어 빈 계획으로 덮어쓰지 않았어요."
  }
}

internal object AlarmPyoSleepReminderScheduler {
  private const val TAG = "AlarmPyoSleepReminder"
  private const val REQUEST_CODE_SALT = 0x534C50

  @Synchronized
  fun sync(
    context: Context,
    plans: List<AlarmPyoSleepReminderPlan>,
    nowMillis: Long = System.currentTimeMillis()
  ): AlarmPyoSleepReminderSnapshot {
    require(plans.size <= MAX_STORED_SLEEP_REMINDERS) {
      "수면 시작 알림 계획이 너무 많아요."
    }
    val normalized = AlarmPyoSleepReminderPolicy.normalize(plans)
    require(normalized.size == plans.size) { "중복된 수면 시작 알림이 있어요." }

    val active = AlarmPyoSleepReminderPolicy.active(normalized, nowMillis)
    val previous = AlarmPyoSleepReminderStore.read(context)
    if (previous == null) {
      // 계획이 비어 있으면 ‘알림이 없음’과 ‘손상 때문에 읽지 못함’을 구분할 수 없어요.
      // 이때는 손상을 정상 빈 스냅샷으로 확정하지 않고 다음 포그라운드 동기화를 기다려요.
      requireAuthoritativePlansForCorruptSleepReminderReseed(active.size)
      // JS가 보낸 전체 계획만 새 current로 확정합니다. 손상본에서 알 수 없는 기존 ID는
      // 취소하지 않아, 프로세스 중단이나 잘못된 빈 복구로 기존 예약을 잃지 않게 해요.
      AlarmPyoSleepReminderStore.reseedAfterCorruption(
        context,
        AlarmPyoSleepReminderSnapshot(active, emptySet())
      )
      val reseeded = reconcile(context, nowMillis)
      AlarmPyoSleepReminderStore.markHealthy(context)
      return reseeded
    }
    if (
      AlarmPyoSleepReminderPolicy.canReuseScheduledSnapshot(
        previous,
        active,
        nowMillis
      )
    ) {
      return previous
    }
    // 계획 전체를 먼저 한 번에 커밋해 프로세스가 중단되어도 복구 수신기가 다시 예약할 수 있어요.
    AlarmPyoSleepReminderStore.write(
      context,
      AlarmPyoSleepReminderSnapshot(active, emptySet())
    )
    // 새 예약을 먼저 준비한 뒤 더 이상 필요 없는 이전 예약만 정리해요.
    // 중간에 프로세스가 종료돼도 동일 계획의 기존 예약은 유지되고,
    // 제거된 계획이 뒤늦게 발화하면 새 스냅샷의 id+시각 검증에서 거부돼요.
    val result = reconcile(context, nowMillis)
    (previous.scheduledIds - result.scheduledIds).forEach {
      cancelPendingIntent(context, it)
    }
    AlarmPyoSleepReminderStore.markHealthy(context)
    return result
  }

  @Synchronized
  fun reconcile(
    context: Context,
    nowMillis: Long = System.currentTimeMillis(),
    recalculateLocalTimes: Boolean = false
  ): AlarmPyoSleepReminderSnapshot {
    val current = requireStoredSnapshot(context)
    val restoredPlans = if (recalculateLocalTimes) {
      current.plans.map { plan ->
        plan.copy(
          reminderAt = AlarmPyoSleepReminderPolicy.recalculateReminderAt(plan) ?: plan.reminderAt
        )
      }
    } else {
      current.plans
    }
    val active = AlarmPyoSleepReminderPolicy.active(restoredPlans, nowMillis)
    val desired = AlarmPyoSleepReminderPolicy.scheduled(active, nowMillis)
    val desiredIds = desired.mapTo(linkedSetOf(), AlarmPyoSleepReminderPlan::id)

    (current.scheduledIds - desiredIds).forEach { cancelPendingIntent(context, it) }
    val scheduledIds = linkedSetOf<String>()
    val schedulingFailures = mutableListOf<Pair<String, Throwable>>()
    desired.forEach { plan ->
      runCatching { schedulePendingIntent(context, plan) }
        .onSuccess { scheduledIds.add(plan.id) }
        .onFailure { error -> schedulingFailures.add(plan.id to error) }
    }
    val result = AlarmPyoSleepReminderSnapshot(active, scheduledIds)
    return persistSleepReminderReconciliation(result, schedulingFailures) { snapshot ->
      AlarmPyoSleepReminderStore.write(context, snapshot)
    }
  }

  @Synchronized
  fun consumeAndReplenish(
    context: Context,
    id: String,
    reminderAt: Long,
    nowMillis: Long = System.currentTimeMillis()
  ): AlarmPyoSleepReminderPlan? {
    val current = AlarmPyoSleepReminderStore.read(context) ?: return null
    val (matched, remaining) = AlarmPyoSleepReminderPolicy.consume(
      current.plans,
      id,
      reminderAt,
      nowMillis
    )
    if (matched == null) return null

    cancelPendingIntent(context, matched.id)
    AlarmPyoSleepReminderStore.write(
      context,
      AlarmPyoSleepReminderSnapshot(remaining, current.scheduledIds - matched.id)
    )
    // 다음 알림 보충 실패는 부분 스냅샷에 남아 다음 앱 복귀·재부팅에서 다시 시도해요.
    // 이미 도착한 현재 알림까지 잃지 않도록 수신기에는 일치한 계획을 반환합니다.
    runCatching { reconcile(context, nowMillis) }
      .onFailure { error -> Log.e(TAG, "수면 시작 알림을 보충하지 못했어요.", error) }
    return matched
  }

  @Synchronized
  fun cancelAll(context: Context): AlarmPyoSleepReminderSnapshot {
    val current = requireStoredSnapshot(context)
    current.plans.forEach { cancelPendingIntent(context, it.id) }
    current.scheduledIds.forEach { cancelPendingIntent(context, it) }
    val empty = AlarmPyoSleepReminderSnapshot(emptyList(), emptySet())
    val stored = AlarmPyoSleepReminderStore.write(context, empty)
    AlarmPyoSleepReminderStore.markHealthy(context)
    return stored
  }

  fun status(
    context: Context,
    snapshot: AlarmPyoSleepReminderSnapshot?
  ): AlarmPyoSleepReminderStatus =
    AlarmPyoSleepReminderStatus(
      enabled = snapshot?.plans?.isNotEmpty() == true,
      notificationsAllowed = AlarmPyoSleepReminderChannels.notificationsAllowed(context),
      scheduledCount = snapshot?.scheduledIds?.size ?: 0,
      storageHealth = AlarmPyoSleepReminderStore.storageHealth(context)
    )

  private fun requireStoredSnapshot(context: Context): AlarmPyoSleepReminderSnapshot =
    requireNotNull(AlarmPyoSleepReminderStore.read(context)) {
      "수면 시작 알림 저장소가 손상되어 복구를 나중에 다시 시도해요."
    }

  private fun schedulePendingIntent(context: Context, plan: AlarmPyoSleepReminderPlan) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val operation = pendingIntent(context, plan, PendingIntent.FLAG_UPDATE_CURRENT)
      ?: error("수면 시작 알림 예약 작업을 만들지 못했어요.")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, plan.reminderAt, operation)
    } else {
      manager.set(AlarmManager.RTC_WAKEUP, plan.reminderAt, operation)
    }
  }

  private fun cancelPendingIntent(context: Context, id: String) {
    val operation = pendingIntentForId(context, id, PendingIntent.FLAG_NO_CREATE) ?: return
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    manager.cancel(operation)
    operation.cancel()
  }

  private fun pendingIntent(context: Context, plan: AlarmPyoSleepReminderPlan, flags: Int): PendingIntent? {
    val intent = firingIntent(context, plan.id).apply { plan.addToIntent(this) }
    return PendingIntent.getBroadcast(
      context,
      requestCode(plan.id),
      intent,
      flags or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun pendingIntentForId(context: Context, id: String, flags: Int): PendingIntent? =
    PendingIntent.getBroadcast(
      context,
      requestCode(id),
      firingIntent(context, id),
      flags or PendingIntent.FLAG_IMMUTABLE
    )

  private fun firingIntent(context: Context, id: String): Intent =
    Intent(context, AlarmPyoSleepReminderReceiver::class.java).apply {
      action = ACTION_FIRE_SLEEP_REMINDER
      data = Uri.Builder()
        .scheme("alarmpyo-sleep")
        .authority("reminder")
        .appendPath(id)
        .build()
    }

  internal fun requestCode(id: String): Int =
    (id.hashCode() xor REQUEST_CODE_SALT) and Int.MAX_VALUE
}
