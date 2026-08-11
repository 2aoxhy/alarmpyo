package expo.modules.alarmpyoalarm

import android.content.Context
import android.os.Build

internal fun Context.alarmpyoColor(colorResource: Int): Int =
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
    getColor(colorResource)
  } else {
    @Suppress("DEPRECATION")
    resources.getColor(colorResource)
  }
