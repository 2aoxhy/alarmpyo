package expo.modules.alarmpyoalarm

// Play 빌드에는 포함하지 않는 직접 설치 인텐트 정책이에요.
internal object AlarmPyoApkInstallIntentPolicy {
  const val ACTION_INSTALL_PACKAGE = "android.intent.action.INSTALL_PACKAGE"
  const val ACTION_VIEW = "android.intent.action.VIEW"

  val actionOrder = listOf(ACTION_INSTALL_PACKAGE, ACTION_VIEW)
}
