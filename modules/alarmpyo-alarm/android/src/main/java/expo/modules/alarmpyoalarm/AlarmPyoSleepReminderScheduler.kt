package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

internal val ALARMPYO_SLEEP_REMINDER_RESTORE_ACTIONS = setOf(
  Intent.ACTION_BOOT_COMPLETED,
  Intent.ACTION_LOCKED_BOOT_COMPLETED,
  Intent.ACTION_MY_PACKAGE_REPLACED,
  Intent.ACTION_TIME_CHANGED,
  Intent.ACTION_TIMEZONE_CHANGED
)

internal fun shouldRestoreSleepReminders(action: String?): Boolean =
  action in ALARMPYO_SLEEP_REMINDER_RESTORE_ACTIONS

internal object AlarmPyoSleepReminderScheduler {
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

    val previous = AlarmPyoSleepReminderStore.read(context)
    val active = AlarmPyoSleepReminderPolicy.active(normalized, nowMillis)
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
    return result
  }

  @Synchronized
  fun reconcile(
    context: Context,
    nowMillis: Long = System.currentTimeMillis(),
    recalculateLocalTimes: Boolean = false
  ): AlarmPyoSleepReminderSnapshot {
    val current = AlarmPyoSleepReminderStore.read(context)
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
    desired.forEach { plan ->
      runCatching { schedulePendingIntent(context, plan) }
        .onSuccess { scheduledIds.add(plan.id) }
    }
    val result = AlarmPyoSleepReminderSnapshot(active, scheduledIds)
    AlarmPyoSleepReminderStore.write(context, result)
    return result
  }

  @Synchronized
  fun consumeAndReplenish(
    context: Context,
    id: String,
    reminderAt: Long,
    nowMillis: Long = System.currentTimeMillis()
  ): AlarmPyoSleepReminderPlan? {
    val current = AlarmPyoSleepReminderStore.read(context)
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
    reconcile(context, nowMillis)
    return matched
  }

  @Synchronized
  fun cancelAll(context: Context): AlarmPyoSleepReminderSnapshot {
    val current = AlarmPyoSleepReminderStore.read(context)
    current.plans.forEach { cancelPendingIntent(context, it.id) }
    current.scheduledIds.forEach { cancelPendingIntent(context, it) }
    val empty = AlarmPyoSleepReminderSnapshot(emptyList(), emptySet())
    AlarmPyoSleepReminderStore.write(context, empty)
    return empty
  }

  fun status(context: Context, snapshot: AlarmPyoSleepReminderSnapshot): AlarmPyoSleepReminderStatus =
    AlarmPyoSleepReminderStatus(
      enabled = snapshot.plans.isNotEmpty(),
      notificationsAllowed = AlarmPyoSleepReminderChannels.notificationsAllowed(context),
      scheduledCount = snapshot.scheduledIds.size
    )

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
