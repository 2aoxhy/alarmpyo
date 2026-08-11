package expo.modules.alarmpyoalarm

import android.content.Context

internal object AlarmPyoWidgetStore {
  private const val PREFERENCES_NAME = "alarmpyo-widget-v1"
  private const val KEY_SNAPSHOT = "snapshot"

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun write(context: Context, raw: String): Boolean {
    if (AlarmPyoWidgetSnapshot.fromJson(raw) == null) return false
    return preferences(context).edit().putString(KEY_SNAPSHOT, raw).commit()
  }

  fun read(context: Context): AlarmPyoWidgetSnapshot? {
    val raw = preferences(context).getString(KEY_SNAPSHOT, null) ?: return null
    return AlarmPyoWidgetSnapshot.fromJson(raw)
  }
}
