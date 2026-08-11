package expo.modules.alarmpyoalarm

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log

internal const val ACTION_RUN_ALARMPYO_ALARM_SAFETY_CHECK =
  "expo.modules.alarmpyoalarm.action.RUN_ALARM_SAFETY_CHECK"

internal object AlarmPyoAlarmSafetyScheduler {
  private const val REQUEST_CODE = 0x485341
  private const val EXTRA_PLAN_KEY = "alarm-safety-plan-key"

  @Synchronized
  fun rearm(context: Context, force: Boolean = false) {
    val appContext = context.applicationContext
    val previous = AlarmPyoAlarmSafetyStore.read(appContext) ?: AlarmPyoAlarmSafetyState()
    val target = AlarmPyoAlarmSafetyPolicy.target(
      AlarmPyoAlarmStore.readPlans(appContext),
      nowMillis = System.currentTimeMillis()
    )
    if (target?.planKey == previous.lastCheckedPlanKey) {
      cancelPendingCheck(appContext)
      if (previous.nextCheckAt != 0L || previous.armedPlanKey != null) {
        AlarmPyoAlarmSafetyStore.write(
          appContext,
          previous.copy(nextCheckAt = 0L, armedPlanKey = null)
        )
      }
      return
    }
    if (target == null) {
      cancelPendingCheck(appContext)
      AlarmPyoAlarmSafetyChannels.cancel(appContext)
      if (
        previous.nextCheckAt != 0L ||
        previous.armedPlanKey != null ||
        previous.lastCheckedPlanKey != null
      ) {
        AlarmPyoAlarmSafetyStore.write(
          appContext,
          previous.copy(
            nextCheckAt = 0L,
            armedPlanKey = null,
            lastCheckedPlanKey = null
          )
        )
      }
      return
    }
    if (
      AlarmPyoAlarmSafetyPolicy.canReuseArmedCheck(
        previous.armedPlanKey,
        previous.nextCheckAt,
        target,
        System.currentTimeMillis(),
        force
      )
    ) return

    val operation = checkPendingIntent(
      appContext,
      PendingIntent.FLAG_UPDATE_CURRENT,
      target.planKey
    ) ?: return
    val manager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, target.checkAt, operation)
      } else {
        manager.set(AlarmManager.RTC_WAKEUP, target.checkAt, operation)
      }
      AlarmPyoAlarmSafetyStore.write(
        appContext,
        previous.copy(nextCheckAt = target.checkAt, armedPlanKey = target.planKey)
      )
    }.onFailure { error ->
      Log.e(TAG, "알람 안전 점검을 예약하지 못했어요.", error)
      runCatching {
        AlarmPyoAlarmSafetyStore.write(
          appContext,
          previous.copy(nextCheckAt = 0L, armedPlanKey = null)
        )
      }
    }
  }

  fun runCheck(context: Context, expectedPlanKey: String?) {
    val appContext = context.applicationContext
    // Scheduler 잠금을 먼저 사용한 뒤 safety 잠금을 잡아 sync와의 잠금 순서를 일정하게 유지해요.
    val reconciled = runCatching { AlarmPyoAlarmScheduler.reconcile(appContext) }
    synchronized(this) {
      finishCheck(appContext, expectedPlanKey, reconciled.isSuccess)
    }
  }

  private fun finishCheck(
    appContext: Context,
    expectedPlanKey: String?,
    reconciliationSucceeded: Boolean
  ) {
    val now = System.currentTimeMillis()
    val previous = AlarmPyoAlarmSafetyStore.read(appContext) ?: AlarmPyoAlarmSafetyState()
    val target = AlarmPyoAlarmSafetyPolicy.target(
      AlarmPyoAlarmStore.readPlans(appContext),
      nowMillis = now
    )
    if (target == null || target.planKey != expectedPlanKey) {
      rearm(appContext, force = true)
      return
    }

    val plansAfterReconcile = AlarmPyoAlarmStore.readPlans(appContext)
    val expectedIds = AlarmPyoAlarmScheduler.selectRestorableSchedule(plansAfterReconcile)
      .mapTo(linkedSetOf(), AlarmPyoAlarmPlan::id)
    val scheduledIds = AlarmPyoAlarmStore.readScheduledIds(appContext)
    val scheduleSynchronized = reconciliationSucceeded && scheduledIds == expectedIds
    val storageHealthy = AlarmPyoAlarmStore.storageHealth(appContext) == AlarmPyoAlarmStorageHealth.NORMAL
    val doNotDisturb = AlarmPyoAlarmPermissions.doNotDisturbAlarmStatus(appContext)
    val issueCodes = AlarmPyoAlarmSafetyPolicy.issueCodes(
      exactAlarmAllowed = AlarmPyoAlarmPermissions.exactAlarmAllowed(appContext),
      fullScreenAllowed = AlarmPyoAlarmPermissions.fullScreenAllowed(appContext),
      notificationsAllowed = AlarmPyoAlarmPermissions.notificationsAllowed(appContext),
      doNotDisturbMaySilenceAlarm = doNotDisturb.maySilenceAlarm,
      batteryOptimizationIgnored = AlarmPyoAlarmPermissions.batteryOptimizationIgnored(appContext),
      alarmVolume = AlarmPyoAlarmPermissions.alarmVolume(appContext),
      scheduleSynchronized = scheduleSynchronized,
      storageHealthy = storageHealthy
    )

    cancelPendingCheck(appContext)
    AlarmPyoAlarmSafetyChannels.ensure(appContext)
    val notificationKey = AlarmPyoAlarmSafetyPolicy.notificationKey(target.planKey, issueCodes)
    val shouldNotify = issueCodes.isNotEmpty() &&
      previous.lastNotifiedKey != notificationKey &&
      AlarmPyoAlarmSafetyChannels.canPost(appContext)
    var notified = false
    if (issueCodes.isEmpty()) {
      AlarmPyoAlarmSafetyChannels.cancel(appContext)
    } else if (shouldNotify) {
      notified = runCatching { AlarmPyoAlarmSafetyChannels.notify(appContext, issueCodes) }
        .onFailure { error -> Log.e(TAG, "알람 안전 점검 알림을 표시하지 못했어요.", error) }
        .isSuccess
    }
    AlarmPyoAlarmSafetyStore.write(
      appContext,
      previous.copy(
        nextCheckAt = 0L,
        lastCheckedAt = now,
        issueCodes = issueCodes,
        lastNotifiedAt = if (notified) now else previous.lastNotifiedAt,
        armedPlanKey = null,
        lastCheckedPlanKey = target.planKey,
        lastNotifiedKey = if (notified) notificationKey else previous.lastNotifiedKey
      )
    )
  }

  fun status(context: Context): Map<String, Any>? =
    AlarmPyoAlarmSafetyStore.read(context.applicationContext)?.toStatusMap()

  private fun cancelPendingCheck(context: Context) {
    val operation = checkPendingIntent(context, PendingIntent.FLAG_NO_CREATE, null) ?: return
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    manager.cancel(operation)
    operation.cancel()
  }

  private fun checkPendingIntent(
    context: Context,
    flags: Int,
    planKey: String?
  ): PendingIntent? = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    Intent(context, AlarmPyoAlarmSafetyReceiver::class.java).apply {
      action = ACTION_RUN_ALARMPYO_ALARM_SAFETY_CHECK
      planKey?.let { putExtra(EXTRA_PLAN_KEY, it) }
    },
    flags or PendingIntent.FLAG_IMMUTABLE
  )

  fun planKeyFrom(intent: Intent): String? = intent.getStringExtra(EXTRA_PLAN_KEY)

  private const val TAG = "AlarmPyoAlarmSafety"
}

internal object AlarmPyoAlarmSafetyChannels {
  private const val CHANNEL_ID = "alarmpyo-alarm-safety-v1"
  private const val NOTIFICATION_ID = 0x485341

  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "AlarmPyo 알람 안전 점검",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "근무 알람에 영향을 주는 휴대폰 설정을 알려줘요."
        setBypassDnd(false)
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      }
    )
  }

  fun canPost(context: Context): Boolean {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) return false
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) {
      return false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return false
      if (channel.importance == NotificationManager.IMPORTANCE_NONE) return false
    }
    return true
  }

  fun notify(context: Context, issueCodes: List<String>) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val contentIntent = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      Intent(Intent.ACTION_VIEW, Uri.parse("alarmpyo:///alarm-settings")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context).setPriority(Notification.PRIORITY_DEFAULT)
    }
    val labels = issueCodes.map(::issueLabel).distinct()
    manager.notify(
      NOTIFICATION_ID,
      builder
        .setSmallIcon(R.drawable.alarmpyo_ic_alarm)
        .setContentTitle("근무 알람 설정을 확인해 주세요")
        .setContentText(labels.joinToString(" · "))
        .setStyle(Notification.BigTextStyle().bigText(labels.joinToString(" · ")))
        .setCategory(Notification.CATEGORY_ERROR)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setAutoCancel(true)
        .setContentIntent(contentIntent)
        .build()
    )
  }

  fun cancel(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(NOTIFICATION_ID)
  }

  private fun issueLabel(code: String): String = when (code) {
    AlarmPyoAlarmSafetyPolicy.ISSUE_EXACT_ALARM -> "정확한 알람 권한"
    AlarmPyoAlarmSafetyPolicy.ISSUE_FULL_SCREEN -> "전체 화면 알람 권한"
    AlarmPyoAlarmSafetyPolicy.ISSUE_NOTIFICATIONS -> "알림 권한"
    AlarmPyoAlarmSafetyPolicy.ISSUE_DO_NOT_DISTURB -> "방해 금지 설정"
    AlarmPyoAlarmSafetyPolicy.ISSUE_BATTERY_OPTIMIZATION -> "배터리 제한"
    AlarmPyoAlarmSafetyPolicy.ISSUE_ALARM_VOLUME -> "알람 음량"
    AlarmPyoAlarmSafetyPolicy.ISSUE_SCHEDULE -> "알람 예약"
    AlarmPyoAlarmSafetyPolicy.ISSUE_STORAGE -> "알람 저장소"
    else -> "알람 설정"
  }
}
