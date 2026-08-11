package expo.modules.alarmpyoalarm

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

internal data class AlarmPyoAlarmSoundPickerInput(
  val existingUri: String?
) : Serializable

internal sealed class AlarmPyoAlarmSoundPickerResult {
  data class Selected(val uri: Uri, val resultFlags: Int) : AlarmPyoAlarmSoundPickerResult()
  object Cancelled : AlarmPyoAlarmSoundPickerResult()
}

internal class AlarmPyoAlarmSoundPickerContract :
  AppContextActivityResultContract<AlarmPyoAlarmSoundPickerInput, AlarmPyoAlarmSoundPickerResult> {
  override fun createIntent(context: Context, input: AlarmPyoAlarmSoundPickerInput): Intent =
    Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
      putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
      putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "알람음 선택")
      putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
      putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
      putExtra(
        RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,
        input.existingUri?.let(Uri::parse)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      )
      addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or
          Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
      )
    }

  @Suppress("DEPRECATION")
  override fun parseResult(
    input: AlarmPyoAlarmSoundPickerInput,
    resultCode: Int,
    intent: Intent?
  ): AlarmPyoAlarmSoundPickerResult {
    if (resultCode != Activity.RESULT_OK || intent == null) {
      return AlarmPyoAlarmSoundPickerResult.Cancelled
    }
    val uri = intent.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
      ?: return AlarmPyoAlarmSoundPickerResult.Cancelled
    return AlarmPyoAlarmSoundPickerResult.Selected(uri, intent.flags)
  }
}
