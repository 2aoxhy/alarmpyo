package expo.modules.alarmpyoalarm

import android.content.Context
import expo.modules.kotlin.modules.ModuleDefinitionBuilder

/** 직접 배포 빌드에서만 APK 검증과 설치 API를 등록해요. */
internal fun ModuleDefinitionBuilder.registerAlarmPyoDistributionApi(
  contextProvider: () -> Context
) {
  AsyncFunction("getAppInstallInfoAsync") {
    AlarmPyoApkInstaller.appInfo(contextProvider())
  }

  AsyncFunction("openApkInstallPermissionSettingsAsync") {
    AlarmPyoApkInstaller.openInstallPermissionSettings(contextProvider())
  }

  AsyncFunction("verifyApkUpdateAsync") {
      fileUri: String,
      expectedSha256: String,
      expectedVersionCode: Double ->
    require(
      expectedVersionCode.isFinite() &&
        expectedVersionCode > 0.0 &&
        expectedVersionCode % 1.0 == 0.0
    ) { "APK 버전 정보가 올바르지 않아요." }
    AlarmPyoApkInstaller.verify(
      contextProvider(),
      fileUri,
      expectedSha256,
      expectedVersionCode.toLong()
    )
  }

  AsyncFunction("verifyAndOpenApkInstallerAsync") {
      fileUri: String,
      expectedSha256: String,
      expectedVersionCode: Double ->
    require(
      expectedVersionCode.isFinite() &&
        expectedVersionCode > 0.0 &&
        expectedVersionCode % 1.0 == 0.0
    ) { "APK 버전 정보가 올바르지 않아요." }
    AlarmPyoApkInstaller.verifyAndOpen(
      contextProvider(),
      fileUri,
      expectedSha256,
      expectedVersionCode.toLong()
    )
  }
}
