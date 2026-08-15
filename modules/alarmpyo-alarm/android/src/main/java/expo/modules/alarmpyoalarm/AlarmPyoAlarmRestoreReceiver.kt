package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal const val ACTION_RETRY_ALARMPYO_ALARM_RESTORE =
  "expo.modules.alarmpyoalarm.action.RETRY_ALARM_RESTORE"

internal val ALARMPYO_ALARM_RESTORE_ACTIONS = setOf(
  Intent.ACTION_BOOT_COMPLETED,
  Intent.ACTION_LOCKED_BOOT_COMPLETED,
  Intent.ACTION_DATE_CHANGED,
  Intent.ACTION_MY_PACKAGE_REPLACED,
  Intent.ACTION_TIME_CHANGED,
  Intent.ACTION_TIMEZONE_CHANGED,
  "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
  ACTION_RETRY_ALARMPYO_ALARM_RESTORE
)

internal fun shouldRestorePersistedAlarms(action: String?): Boolean =
  action in ALARMPYO_ALARM_RESTORE_ACTIONS && action != Intent.ACTION_DATE_CHANGED

internal fun shouldRestoreQuickTimer(action: String?): Boolean = action in setOf(
  Intent.ACTION_BOOT_COMPLETED,
  Intent.ACTION_LOCKED_BOOT_COMPLETED,
  Intent.ACTION_MY_PACKAGE_REPLACED,
  // A timer counts down with elapsedRealtime during the current boot. Rebase
  // its wall target immediately after TIME_SET so a later reboot can safely
  // fall back to the updated epoch time. TIMEZONE_CHANGED does not change
  // System.currentTimeMillis and therefore needs no timer reschedule.
  Intent.ACTION_TIME_CHANGED,
  "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
)

class AlarmPyoAlarmRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action !in ALARMPYO_ALARM_RESTORE_ACTIONS) return
    val appContext = context.applicationContext

    // 비동기 작업을 시작하기 전에 DP 저장소의 저널과 2분 watchdog을 동기로 확정해요.
    val transaction = runCatching { prepareTransaction(appContext, action) }
      .onFailure { error -> Log.e(TAG, "알람 복원 저널을 준비하지 못했습니다.", error) }
      .getOrNull() ?: return
    val pendingResult = goAsync()
    EXECUTOR.execute {
      try {
        if (action == Intent.ACTION_MY_PACKAGE_REPLACED) {
          cleanupRemovedActivityArtifacts(appContext)
        }
        performTransaction(appContext, transaction)
      } catch (error: Throwable) {
        // 완료 상태를 쓰기 전에 실패하면 이미 준비한 watchdog이 같은 저널을 다시 실행해요.
        Log.e(TAG, "알람 복원 작업을 완료하지 못했습니다.", error)
      } finally {
        pendingResult.finish()
      }
    }
  }

  internal companion object {
    const val TAG = "AlarmPyoAlarmRestore"
    const val RETRY_REQUEST_CODE = 0x485452
    const val REMOVED_ACTIVITY_CHANNEL_ID = "alarmpyo-activity-handover-v1"
    const val REMOVED_ACTIVITY_PREFERENCES_NAME = "alarmpyo-activity-handover-v1"
    val WATCHDOG_DELAY_MILLIS: Long = TimeUnit.MINUTES.toMillis(2)
    val EXECUTOR = Executors.newSingleThreadExecutor { task ->
      Thread(task, "alarmpyo-alarm-restore").apply { isDaemon = false }
    }

    @Synchronized
    fun markQuickTimerReconciliationPending(context: Context) {
      val appContext = context.applicationContext
      val now = System.currentTimeMillis()
      val next = AlarmPyoQuickTimerRestoreJournalPolicy.markPending(
        AlarmPyoAlarmRestoreStateStore.read(appContext),
        now
      )
      AlarmPyoAlarmRestoreStateStore.write(appContext, next)
      val wakeupAt = listOf(next.retryAt, next.watchdogAt)
        .filter { it > now }
        .minOrNull()
      if (wakeupAt != null) scheduleRestoreWakeup(appContext, wakeupAt)
    }

    @Synchronized
    fun markQuickTimerReconciliationCompleted(context: Context) {
      val appContext = context.applicationContext
      val previous = AlarmPyoAlarmRestoreStateStore.read(appContext)
      val next = AlarmPyoQuickTimerRestoreJournalPolicy.markCompleted(
        previous,
        System.currentTimeMillis()
      ) ?: return
      if (next == previous) return
      AlarmPyoAlarmRestoreStateStore.write(appContext, next)
      val wakeupAt = listOf(next.retryAt, next.watchdogAt)
        .filter { it > System.currentTimeMillis() }
        .minOrNull()
      if (wakeupAt != null) {
        scheduleRestoreWakeup(appContext, wakeupAt)
      } else if (!next.hasPendingWork) {
        cancelRestoreWakeup(appContext)
      }
    }

    @Synchronized
    fun prepareTransaction(context: Context, action: String?): AlarmPyoAlarmRestoreState? {
      val now = System.currentTimeMillis()
      val defaultWatchdogAt = now + WATCHDOG_DELAY_MILLIS
      val previous = AlarmPyoAlarmRestoreStateStore.read(context)
      val journalId = maxOf(now, (previous?.journalId ?: 0L) + 1L)
      val state = if (action == ACTION_RETRY_ALARMPYO_ALARM_RESTORE) {
        previous?.takeIf(AlarmPyoAlarmRestoreState::hasPendingWork)?.copy(
          retryAt = 0L,
          watchdogAt = defaultWatchdogAt,
          journalId = journalId
        ) ?: run {
          cancelRestoreWakeup(context)
          return null
        }
      } else {
        AlarmPyoAlarmRestoreStateStore.begin(
          context,
          previous = previous,
          recalculateLocalTimes = action == Intent.ACTION_TIME_CHANGED ||
            action == Intent.ACTION_TIMEZONE_CHANGED,
          workAlarmPending = shouldRestorePersistedAlarms(action),
          sleepReminderPending = shouldRestoreSleepReminders(action),
          widgetPending = action != Intent.ACTION_LOCKED_BOOT_COMPLETED,
          quickTimerPending = shouldRestoreQuickTimer(action),
          nowMillis = now,
          watchdogAt = defaultWatchdogAt,
          journalId = journalId
        )
      }
      // retry 저널은 begin을 거치지 않으므로 watchdog보다 먼저 동기 커밋해요.
      if (action == ACTION_RETRY_ALARMPYO_ALARM_RESTORE) {
        AlarmPyoAlarmRestoreStateStore.write(context, state)
      }
      val earliestWakeup = listOf(state.retryAt, state.watchdogAt)
        .filter { it > now }
        .minOrNull() ?: defaultWatchdogAt
      val watchdogAt = earliestWakeup
      scheduleRestoreWakeup(context, watchdogAt)
      return state
    }

    fun performTransaction(context: Context, state: AlarmPyoAlarmRestoreState) {
      val workResult = if (state.workAlarmPending) {
        runCatching {
          AlarmPyoAlarmScheduler.restore(
            context,
            recalculateLocalTimes = state.recalculateLocalTimes
          )
        }.onFailure { error ->
          Log.e(TAG, "근무 알람을 복원하지 못했습니다.", error)
        }.getOrNull()
      } else {
        null
      }

      val sleepRemindersCompleted = if (state.sleepReminderPending) {
        runCatching {
          AlarmPyoSleepReminderScheduler.reconcile(
            context,
            recalculateLocalTimes = state.recalculateLocalTimes
          )
        }.onFailure { error ->
          Log.e(TAG, "수면 시작 알림을 복원하지 못했습니다.", error)
        }.isSuccess
      } else {
        true
      }

      val widgetCompleted = if (state.widgetPending) {
        runCatching { AlarmPyoShiftWidgetUpdater.updateAll(context) }
          .onFailure { error -> Log.e(TAG, "위젯을 새로 고치지 못했습니다.", error) }
          .isSuccess
      } else {
        true
      }

      val quickTimerCompleted = if (state.quickTimerPending) {
        runCatching { AlarmPyoQuickTimerScheduler.restore(context) }
          .onFailure { error -> Log.e(TAG, "빠른 타이머를 복원하지 못했습니다.", error) }
          .getOrDefault(false)
      } else {
        true
      }

      val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
        state,
        result = workResult,
        nowMillis = System.currentTimeMillis(),
        retryAllowed = AlarmPyoAlarmPermissions.canSchedule(context),
        sleepRemindersCompleted = sleepRemindersCompleted,
        widgetCompleted = widgetCompleted,
        quickTimerCompleted = quickTimerCompleted
      )

      commitTransactionResult(context, state.journalId, next)
    }

    @Synchronized
    fun commitTransactionResult(
      context: Context,
      journalId: Long,
      next: AlarmPyoAlarmRestoreState
    ) {
      // 뒤에 도착한 시스템 이벤트가 새 저널을 만들었다면 이전 결과로 덮어쓰지 않아요.
      if (AlarmPyoAlarmRestoreStateStore.read(context)?.journalId != journalId) return
      AlarmPyoAlarmRestoreStateStore.write(context, next)
      if (next.hasPendingWork && next.retryAt > 0L) {
        scheduleRestoreWakeup(context, next.retryAt)
      } else {
        cancelRestoreWakeup(context)
      }
    }

    fun cleanupRemovedActivityArtifacts(context: Context) {
      runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.getSystemService(NotificationManager::class.java)
            ?.deleteNotificationChannel(REMOVED_ACTIVITY_CHANNEL_ID)
        }
        val storageContext = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          context.createDeviceProtectedStorageContext()
        } else {
          context
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          storageContext.deleteSharedPreferences(REMOVED_ACTIVITY_PREFERENCES_NAME)
        } else {
          storageContext
            .getSharedPreferences(REMOVED_ACTIVITY_PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        }
      }.onFailure { error ->
        Log.w(TAG, "제거된 활동 알림 정보를 정리하지 못했습니다.", error)
      }
    }

    fun scheduleRestoreWakeup(context: Context, triggerAt: Long) {
      val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val operation = restorePendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
      runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        } else {
          manager.set(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        }
      }.onFailure { error ->
        Log.e(TAG, "알람 복원 watchdog을 예약하지 못했습니다.", error)
      }
    }

    fun cancelRestoreWakeup(context: Context) {
      val operation = restorePendingIntent(context, PendingIntent.FLAG_NO_CREATE) ?: return
      val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      manager.cancel(operation)
      operation.cancel()
    }

    fun restorePendingIntent(context: Context, flags: Int): PendingIntent? =
      PendingIntent.getBroadcast(
        context,
        RETRY_REQUEST_CODE,
        Intent(context, AlarmPyoAlarmRestoreReceiver::class.java).apply {
          action = ACTION_RETRY_ALARMPYO_ALARM_RESTORE
        },
        flags or PendingIntent.FLAG_IMMUTABLE
      )
  }
}
