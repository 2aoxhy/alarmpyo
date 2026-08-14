package expo.modules.alarmpyoalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class AlarmPyoAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_FIRE_ALARM) return

    val plan = AlarmPyoAlarmScheduler.planForFiringIntent(context, intent) ?: return
    val isTest = intent.getBooleanExtra(EXTRA_IS_TEST, false)
    AlarmPyoAlarmChannels.ensure(context)

    // 5분 뒤 한 번 더 울리기는 실제 소리 재생과 최신 generation 확인이 끝난 뒤
    // 서비스에서만 예약해요. 수신기에서 미리 예약하면 알림 차단·재생 실패·stale
    // 전달에도 불필요한 반복 알람이 남을 수 있어요.
    val automaticRepeatEligible =
      AlarmPyoAlarmScheduler.shouldArmAutomaticSingleRepeat(plan)

    if (plan.deliveryAttempt > 0) {
      AlarmPyoAlarmStore.appendRecentEvent(
        context.applicationContext,
        AlarmPyoAlarmHistoryEvent.create(AlarmPyoAlarmEventType.RETRY_STARTED, plan, isTest)
      )
    }

    // startForegroundService가 예외 없이 반환된 뒤 프로세스가 종료되는 경우까지
    // 복구할 수 있도록, 서비스 시작 전에 다음 재시도를 안전망으로 먼저 예약합니다.
    val watchdogResult = runCatching {
      AlarmPyoAlarmScheduler.retryDelivery(context.applicationContext, plan, isTest)
    }.getOrElse { error ->
      Log.e(TAG, "AlarmPyo 알람 안전 재시도를 예약하지 못했습니다.", error)
      null
    }
    if (watchdogResult == null) {
      Log.w(TAG, "더 최신 알람 계획이 있어 이전 알람 전달을 중단합니다.")
      return
    }
    val watchdogArmed = watchdogResult.scheduled
    val deliveryPlan = watchdogResult.plan

    if (!AlarmPyoAlarmPermissions.notificationsAllowed(context)) {
      recordDeliveryFailure(context, plan, isTest, watchdogResult)
      if (watchdogArmed) {
        Log.w(TAG, "알림 또는 알람 채널이 차단되어 AlarmPyo 알람을 다시 예약했습니다.")
      } else {
        Log.e(TAG, "알림 채널이 차단되었고 AlarmPyo 알람 재시도 한도를 초과했습니다.")
      }
      return
    }

    val serviceIntent = Intent(context, AlarmPyoAlarmService::class.java).apply {
      action = ACTION_START_RINGING
      putExtra(EXTRA_IS_TEST, isTest)
      putAlarmPyoSource(
        if (isTest) AlarmPyoAlarmSource.TEST else AlarmPyoAlarmSource.WORK
      )
      putExtra(EXTRA_RETRY_ARMED, watchdogArmed)
      putExtra(EXTRA_AUTOMATIC_REPEAT_ELIGIBLE, automaticRepeatEligible)
      deliveryPlan.addToIntent(this)
    }
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    }.onFailure { error ->
      recordDeliveryFailure(context, plan, isTest, watchdogResult)
      Log.e(TAG, "AlarmPyo 알람 서비스를 시작하지 못했습니다.", error)
    }
    // 계획은 서비스가 실제 소리 재생을 확인한 뒤에만 소비합니다.
  }

  private fun recordDeliveryFailure(
    context: Context,
    failedPlan: AlarmPyoAlarmPlan,
    isTest: Boolean,
    retryResult: AlarmPyoAlarmRetryResult
  ) {
    val appContext = context.applicationContext
    AlarmPyoAlarmStore.appendRecentEvent(
      appContext,
      AlarmPyoAlarmHistoryEvent.create(AlarmPyoAlarmEventType.PLAYBACK_FAILED, failedPlan, isTest)
    )
    val retryType = if (retryResult.scheduled) {
      AlarmPyoAlarmEventType.RETRY_SCHEDULED
    } else {
      AlarmPyoAlarmEventType.RETRY_EXHAUSTED
    }
    AlarmPyoAlarmStore.appendRecentEvent(
      appContext,
      AlarmPyoAlarmHistoryEvent.create(
        retryType,
        failedPlan,
        isTest,
        nextAlarmAt = retryResult.plan.alarmAt.takeIf { retryResult.scheduled } ?: 0L
      )
    )
  }

  private companion object {
    const val TAG = "AlarmPyoAlarmReceiver"
  }
}
