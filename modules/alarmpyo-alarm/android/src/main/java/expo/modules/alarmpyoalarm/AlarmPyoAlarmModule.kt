package expo.modules.alarmpyoalarm

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AlarmPyoAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val permissions: Permissions
    get() = appContext.permissions ?: error("권한 관리 기능을 사용할 수 없습니다.")

  override fun definition() = ModuleDefinition {
    Name("AlarmPyoAlarm")

    lateinit var alarmSoundPickerLauncher: AppContextActivityResultLauncher<
      AlarmPyoAlarmSoundPickerInput,
      AlarmPyoAlarmSoundPickerResult
      >

    RegisterActivityContracts {
      alarmSoundPickerLauncher = registerForActivityResult(AlarmPyoAlarmSoundPickerContract())
    }

    AsyncFunction("syncAlarmsAsync") { records: List<AlarmPyoAlarmPlanRecord> ->
      syncRecords(records)
    }

    // 기존 APK의 syncAlarmsAsync 계약은 그대로 유지하고, 새 APK에서만 권장 갱신
    // 메타데이터를 받는 선택적 API를 제공해 OTA 코드도 안전하게 호환해요.
    AsyncFunction("syncAlarmsWithMetadataAsync") {
        records: List<AlarmPyoAlarmPlanRecord>,
        metadata: AlarmPyoAlarmSyncMetadataRecord ->
      syncRecords(
        records,
        requireNotNull(metadata.toValidatedMetadata()) {
          "알람 안전 계획 메타데이터가 올바르지 않아요."
        }
      )
    }

    AsyncFunction("getStatusAsync") {
      status(AlarmPyoAlarmScheduler.readScheduled(context))
    }

    AsyncFunction("requestAlarmPermissionsAsync") { promise: Promise ->
      requestPermissions(promise)
    }

    AsyncFunction("openAlarmPermissionSettingsAsync") {
      AlarmPyoAlarmPermissions.openNextRequiredSettings(context)
      status(AlarmPyoAlarmScheduler.reconcile(context))
    }

    AsyncFunction("openFullScreenPermissionSettingsAsync") {
      AlarmPyoAlarmPermissions.openFullScreenSettings(context)
      status(AlarmPyoAlarmScheduler.reconcile(context))
    }

    AsyncFunction("openDoNotDisturbSettingsAsync") {
      AlarmPyoAlarmPermissions.openDoNotDisturbSettings(context)
      true
    }

    AsyncFunction("openBatterySettingsAsync") {
      AlarmPyoAlarmPermissions.openBatterySettings(context)
      true
    }

    AsyncFunction("scheduleTestAlarmAsync") { seconds: Int? ->
      AlarmPyoAlarmChannels.ensure(context)
      AlarmPyoAlarmScheduler.scheduleTest(context, seconds ?: 5)
      status(AlarmPyoAlarmScheduler.reconcile(context))
    }

    AsyncFunction("cancelAllAsync") {
      AlarmPyoAlarmScheduler.cancelAll(context)
      status(emptyList())
    }

    AsyncFunction("syncSleepRemindersAsync") { records: List<AlarmPyoSleepReminderPlanRecord> ->
      AlarmPyoSleepReminderChannels.ensure(context)
      val plans = validateSleepReminderRecords(records)
      sleepReminderStatus(AlarmPyoSleepReminderScheduler.sync(context, plans))
    }

    AsyncFunction("cancelSleepRemindersAsync") {
      AlarmPyoSleepReminderChannels.ensure(context)
      sleepReminderStatus(AlarmPyoSleepReminderScheduler.cancelAll(context))
    }

    AsyncFunction("getSleepReminderStatusAsync") {
      AlarmPyoSleepReminderChannels.ensure(context)
      sleepReminderStatus(AlarmPyoSleepReminderScheduler.reconcile(context))
    }

    AsyncFunction("requestSleepReminderPermissionAsync") { promise: Promise ->
      requestSleepReminderPermission(promise)
    }

    AsyncFunction("openSleepReminderSettingsAsync") {
      AlarmPyoSleepReminderChannels.ensure(context)
      AlarmPyoSleepReminderChannels.openSettings(context)
      sleepReminderStatus(AlarmPyoSleepReminderScheduler.reconcile(context))
    }

    AsyncFunction("getAlarmSoundAsync") {
      AlarmPyoAlarmSoundStore.currentStatus(context).toMap()
    }

    AsyncFunction("selectAlarmSoundAsync") Coroutine { ->
      AlarmPyoAlarmSoundPreview.stop()
      when (
        val result = alarmSoundPickerLauncher.launch(
          AlarmPyoAlarmSoundPickerInput(AlarmPyoAlarmSoundStore.selectedUri(context)?.toString())
        )
      ) {
        is AlarmPyoAlarmSoundPickerResult.Selected -> {
          persistRingtoneReadPermission(result)
          AlarmPyoAlarmSoundStore.save(context, result.uri)
        }
        AlarmPyoAlarmSoundPickerResult.Cancelled -> Unit
      }
      AlarmPyoAlarmSoundStore.currentStatus(context).toMap()
    }

    AsyncFunction("previewAlarmSoundAsync") { promise: Promise ->
      AlarmPyoAlarmSoundPreview.start(context) { started ->
        promise.resolve(started)
      }
    }

    AsyncFunction("stopAlarmSoundPreviewAsync") {
      AlarmPyoAlarmSoundPreview.stop()
    }

    AsyncFunction("resetAlarmSoundAsync") {
      AlarmPyoAlarmSoundPreview.stop()
      AlarmPyoAlarmSoundStore.reset(context)
      AlarmPyoAlarmSoundStore.currentStatus(context).toMap()
    }

    AsyncFunction("syncWidgetAsync") { snapshotJson: String ->
      require(AlarmPyoWidgetSnapshot.fromJson(snapshotJson) != null) {
        "위젯 근무 정보가 올바르지 않아요."
      }
      check(AlarmPyoWidgetStore.write(context, snapshotJson)) {
        "위젯 근무 정보를 저장하지 못했어요."
      }
      if (AlarmPyoShiftWidgetUpdater.isInstalled(context)) {
        AlarmPyoShiftWidgetUpdater.updateAll(context)
      }
      true
    }

    AsyncFunction("isWidgetInstalledAsync") {
      AlarmPyoShiftWidgetUpdater.isInstalled(context)
    }

    AsyncFunction("requestWidgetPinAsync") {
      AlarmPyoShiftWidgetUpdater.requestPin(context)
    }

    registerAlarmPyoDistributionApi { context }

    OnDestroy {
      AlarmPyoAlarmSoundPreview.stop()
    }
  }

  private fun persistRingtoneReadPermission(result: AlarmPyoAlarmSoundPickerResult.Selected) {
    val persistableReadFlag = result.resultFlags and (
      Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
      )
    if (
      persistableReadFlag and Intent.FLAG_GRANT_READ_URI_PERMISSION == 0 ||
      persistableReadFlag and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION == 0
    ) return

    runCatching {
      context.contentResolver.takePersistableUriPermission(
        result.uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION
      )
    }
  }

  private fun validateSleepReminderRecords(
    records: List<AlarmPyoSleepReminderPlanRecord>
  ): List<AlarmPyoSleepReminderPlan> {
    require(records.size <= MAX_STORED_SLEEP_REMINDERS) {
      "수면 시작 알림 계획이 너무 많아요."
    }
    val plans = records.map { record ->
      require(
        record.reminderAt.isFinite() &&
          record.reminderAt > 0.0 &&
          record.reminderAt % 1.0 == 0.0
      ) { "수면 시작 알림 시각이 올바르지 않아요." }
      record.toPlan().also { plan ->
        require(AlarmPyoSleepReminderPlan.isValid(plan)) {
          "수면 시작 알림 계획이 올바르지 않아요."
        }
      }
    }
    require(plans.map(AlarmPyoSleepReminderPlan::id).distinct().size == plans.size) {
      "중복된 수면 시작 알림이 있어요."
    }
    return plans
  }

  private fun requestSleepReminderPermission(promise: Promise) {
    AlarmPyoSleepReminderChannels.ensure(context)
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !AlarmPyoAlarmPermissions.runtimeNotificationPermissionAllowed(context)
    ) {
      permissions.askForPermissions(
        { _ ->
          if (!AlarmPyoSleepReminderChannels.notificationsAllowed(context)) {
            AlarmPyoSleepReminderChannels.openSettings(context)
          }
          promise.resolve(
            sleepReminderStatus(AlarmPyoSleepReminderScheduler.reconcile(context))
          )
        },
        Manifest.permission.POST_NOTIFICATIONS
      )
      return
    }
    if (!AlarmPyoSleepReminderChannels.notificationsAllowed(context)) {
      AlarmPyoSleepReminderChannels.openSettings(context)
    }
    promise.resolve(sleepReminderStatus(AlarmPyoSleepReminderScheduler.reconcile(context)))
  }

  private fun sleepReminderStatus(
    snapshot: AlarmPyoSleepReminderSnapshot
  ): Map<String, Any> = AlarmPyoSleepReminderScheduler.status(context, snapshot).toMap()

  private fun syncRecords(
    records: List<AlarmPyoAlarmPlanRecord>,
    metadata: AlarmPyoAlarmSyncMetadata? = null
  ): Map<String, Any> {
    AlarmPyoAlarmChannels.ensure(context)
    val plans = records.map { record ->
      require(record.alarmAt.isFinite()) { "올바른 알람 시간이 필요합니다." }
      val hasLegacyTimeContract = record.startMinutes == -1 && record.alarmMinutesBefore == -1
      val hasLocalTimeContract = record.startMinutes in 0..1439 &&
        record.alarmMinutesBefore in 0..MAX_ALARM_MINUTES_BEFORE
      require(hasLegacyTimeContract || hasLocalTimeContract) {
        "근무 시작 시각과 선행 알람 시간이 올바르지 않습니다."
      }
      record.toPlan()
    }
    val scheduled = AlarmPyoAlarmScheduler.sync(context, plans, metadata)
    return status(scheduled)
  }

  private fun requestPermissions(promise: Promise) {
    AlarmPyoAlarmChannels.ensure(context)
    when {
      !AlarmPyoAlarmPermissions.exactAlarmAllowed(context) -> {
        AlarmPyoAlarmPermissions.openExactAlarmSettings(context)
        promise.resolve(status(AlarmPyoAlarmScheduler.reconcile(context)))
      }
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        !AlarmPyoAlarmPermissions.runtimeNotificationPermissionAllowed(context) -> {
        permissions.askForPermissions(
          { result ->
            val response = result[Manifest.permission.POST_NOTIFICATIONS]
            if (!AlarmPyoAlarmPermissions.notificationsAllowed(context) && response?.canAskAgain == false) {
              AlarmPyoAlarmPermissions.openNotificationSettings(context)
            }
            promise.resolve(status(AlarmPyoAlarmScheduler.reconcile(context)))
          },
          Manifest.permission.POST_NOTIFICATIONS
        )
      }
      !AlarmPyoAlarmPermissions.notificationsAllowed(context) -> {
        AlarmPyoAlarmPermissions.openNotificationSettings(context)
        promise.resolve(status(AlarmPyoAlarmScheduler.reconcile(context)))
      }
      !AlarmPyoAlarmPermissions.fullScreenAllowed(context) -> {
        AlarmPyoAlarmPermissions.openFullScreenSettings(context)
        promise.resolve(status(AlarmPyoAlarmScheduler.reconcile(context)))
      }
      else -> promise.resolve(status(AlarmPyoAlarmScheduler.reconcile(context)))
    }
  }

  private fun status(scheduled: List<AlarmPyoAlarmPlan>): Map<String, Any> {
    val exactAlarmAllowed = AlarmPyoAlarmPermissions.exactAlarmAllowed(context)
    val fullScreenAllowed = AlarmPyoAlarmPermissions.fullScreenAllowed(context)
    val notificationsAllowed = AlarmPyoAlarmPermissions.notificationsAllowed(context)
    val doNotDisturb = AlarmPyoAlarmPermissions.doNotDisturbAlarmStatus(context)
    val planCoverage = AlarmPyoPlanRefreshReminder.read(context)
    val widgetInstalled = AlarmPyoShiftWidgetUpdater.isInstalled(context)
    val lastRestoreResult = AlarmPyoAlarmRestoreStateStore.lastResult(context)
    val storageHealth = AlarmPyoAlarmStore.storageHealth(context)
    val triggerState = AlarmPyoAlarmStatusPolicy.triggerState(
      exactAlarmAllowed,
      notificationsAllowed,
      fullScreenAllowed,
      scheduled.size
    )
    val result = mutableMapOf<String, Any>(
      "supported" to true,
      "enabled" to AlarmPyoAlarmStatusPolicy.enabled(
        exactAlarmAllowed,
        notificationsAllowed,
        fullScreenAllowed,
        scheduled.size
      ),
      "triggerState" to triggerState,
      "storageHealth" to storageHealth.wireValue,
      "exactAlarmAllowed" to exactAlarmAllowed,
      "fullScreenAllowed" to fullScreenAllowed,
      "notificationsAllowed" to notificationsAllowed,
      "doNotDisturbActive" to doNotDisturb.active,
      "doNotDisturbMaySilenceAlarm" to doNotDisturb.maySilenceAlarm,
      "batteryOptimizationIgnored" to AlarmPyoAlarmPermissions.batteryOptimizationIgnored(context),
      "alarmVolume" to AlarmPyoAlarmPermissions.alarmVolume(context),
      "plannedThroughAt" to (planCoverage?.plannedThroughAt ?: 0L).toDouble(),
      "planRefreshRecommendedAt" to (planCoverage?.refreshRecommendedAt ?: 0L).toDouble(),
      "planRefreshReminderPending" to (planCoverage?.refreshReminderPending == true),
      "widgetInstalled" to widgetInstalled,
      "widgetSnapshotGeneratedAt" to if (widgetInstalled) {
        AlarmPyoWidgetStore.read(context)?.generatedAt ?: 0L
      } else {
        0L
      },
      "scheduledAlarms" to scheduled.map(AlarmPyoAlarmPlan::toMap),
      "scheduledCount" to scheduled.size,
      "lastRestoreResult" to (lastRestoreResult?.toMap() ?: emptyMap<String, Any>()),
      "recentEvents" to AlarmPyoAlarmStore.readRecentEvents(context).map(AlarmPyoAlarmHistoryEvent::toMap)
    )
    AlarmPyoAlarmSafetyScheduler.status(context)?.let { alarmSafety ->
      result["alarmSafety"] = alarmSafety
    }
    return result
  }

}
