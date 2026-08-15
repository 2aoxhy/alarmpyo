package expo.modules.alarmpyoalarm

import android.content.Context
import android.os.SystemClock
import android.provider.Settings

/**
 * A five-minute repeat is a countdown during the current boot. Wall time is retained as a
 * reboot fallback, but changing the clock must not shorten or extend an already running repeat.
 */
internal object AlarmPyoSingleRepeatTimingPolicy {
  fun isSameBootMonotonicTarget(plan: AlarmPyoAlarmPlan, currentBootCount: Int): Boolean =
    plan.isSingleRepeat() &&
      plan.bootCount >= 0 &&
      currentBootCount >= 0 &&
      plan.bootCount == currentBootCount &&
      plan.countdownStartedAtElapsed >= 0L &&
      plan.fireAtElapsed > plan.countdownStartedAtElapsed

  fun remainingMillis(
    plan: AlarmPyoAlarmPlan,
    currentBootCount: Int,
    nowWallClock: Long,
    nowElapsed: Long
  ): Long = if (isSameBootMonotonicTarget(plan, currentBootCount)) {
    plan.fireAtElapsed - nowElapsed
  } else {
    plan.alarmAt - nowWallClock
  }

  fun arm(
    plan: AlarmPyoAlarmPlan,
    nowWallClock: Long,
    nowElapsed: Long,
    currentBootCount: Int,
    delayMillis: Long
  ): AlarmPyoAlarmPlan {
    require(plan.isSingleRepeat()) { "5분 재알람만 monotonic 목표를 사용할 수 있습니다." }
    require(delayMillis > 0L) { "5분 재알람 지연 시간은 0보다 커야 합니다." }
    val fireAt = Math.addExact(nowWallClock, delayMillis)
    return plan.copy(
      alarmAt = fireAt,
      originalAlarmAt = fireAt,
      countdownStartedAtElapsed = nowElapsed,
      fireAtElapsed = Math.addExact(nowElapsed, delayMillis),
      bootCount = currentBootCount
    )
  }

  fun rebaseForRestore(
    plan: AlarmPyoAlarmPlan,
    currentBootCount: Int,
    nowWallClock: Long,
    nowElapsed: Long,
    overdueGraceMillis: Long
  ): AlarmPyoAlarmPlan? {
    val remaining = remainingMillis(plan, currentBootCount, nowWallClock, nowElapsed)
    val delay = when {
      remaining > 0L -> remaining
      remaining >= -overdueGraceMillis -> 1_000L
      else -> return null
    }
    return arm(plan, nowWallClock, nowElapsed, currentBootCount, delay)
  }
}

internal fun alarmPyoBootCount(context: Context): Int = runCatching {
  Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
}.getOrDefault(-1)

internal fun alarmPyoElapsedRealtime(): Long = SystemClock.elapsedRealtime()
