package expo.modules.alarmpyoalarm

import android.content.Context
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

internal data class AlarmPyoAlarmSoundStatus(
  val selected: Boolean,
  val label: String,
  val available: Boolean
) {
  fun toMap(): Map<String, Any> = mapOf(
    "supported" to true,
    "selected" to selected,
    "label" to label,
    "available" to available
  )
}

internal object AlarmPyoAlarmSoundStore {
  private const val PREFERENCES_NAME = "alarmpyo_alarm_sound"
  private const val KEY_SELECTED_URI = "selected_uri"
  private const val KEY_SELECTED_LABEL = "selected_label"
  private const val DEFAULT_LABEL = "시스템 기본 알람음"
  private const val SELECTED_FALLBACK_LABEL = "선택한 알람음"

  fun selectedUri(context: Context): Uri? = preferences(context)
    .getString(KEY_SELECTED_URI, null)
    ?.takeIf(String::isNotBlank)
    ?.let(Uri::parse)

  fun currentStatus(context: Context): AlarmPyoAlarmSoundStatus {
    val selected = selectedUri(context)
    if (selected != null) {
      val savedLabel = preferences(context).getString(KEY_SELECTED_LABEL, null)
      return AlarmPyoAlarmSoundStatus(
        selected = true,
        label = savedLabel?.takeIf(String::isNotBlank)
          ?: ringtoneLabel(context, selected)
          ?: SELECTED_FALLBACK_LABEL,
        available = isAvailable(context, selected)
      )
    }

    val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    return AlarmPyoAlarmSoundStatus(
      selected = false,
      label = defaultUri?.let { ringtoneLabel(context, it) } ?: DEFAULT_LABEL,
      available = defaultUri != null && isAvailable(context, defaultUri)
    )
  }

  fun save(context: Context, uri: Uri) {
    require(uri != Uri.EMPTY && uri.toString().isNotBlank()) {
      "선택한 알람음 주소가 올바르지 않아요."
    }
    val label = ringtoneLabel(context, uri) ?: SELECTED_FALLBACK_LABEL
    check(
      preferences(context).edit()
        .putString(KEY_SELECTED_URI, uri.toString())
        .putString(KEY_SELECTED_LABEL, label)
        .commit()
    ) { "선택한 알람음을 저장하지 못했어요." }
  }

  fun reset(context: Context) {
    check(
      preferences(context).edit()
        .remove(KEY_SELECTED_URI)
        .remove(KEY_SELECTED_LABEL)
        .commit()
    ) { "알람음을 기본값으로 복원하지 못했어요." }
  }

  fun playbackCandidates(context: Context): List<Uri> = AlarmPyoAlarmSoundPolicy.candidateValues(
    selected = selectedUri(context)?.toString(),
    defaultAlarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)?.toString(),
    defaultRingtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)?.toString(),
    defaultNotification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)?.toString()
  ).map(Uri::parse)

  private fun ringtoneLabel(context: Context, uri: Uri): String? = runCatching {
    RingtoneManager.getRingtone(context.applicationContext, uri)
      ?.getTitle(context.applicationContext)
      ?.trim()
      ?.takeIf(String::isNotBlank)
  }.getOrNull()

  private fun isAvailable(context: Context, uri: Uri): Boolean = runCatching {
    context.applicationContext.contentResolver
      .openAssetFileDescriptor(uri, "r")
      ?.use { true }
      ?: false
  }.getOrDefault(false)

  private fun preferences(context: Context) = storageContext(context)
    .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  private fun storageContext(context: Context): Context {
    val applicationContext = context.applicationContext
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      applicationContext.createDeviceProtectedStorageContext()
    } else {
      applicationContext
    }
  }
}
