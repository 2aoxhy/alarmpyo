package expo.modules.alarmpyoalarm

import android.content.Context
import expo.modules.kotlin.modules.ModuleDefinitionBuilder

/** Play 빌드에는 직접 APK 설치 API를 아예 등록하지 않아요. */
internal fun ModuleDefinitionBuilder.registerAlarmPyoDistributionApi(
  @Suppress("UNUSED_PARAMETER") contextProvider: () -> Context
) = Unit
