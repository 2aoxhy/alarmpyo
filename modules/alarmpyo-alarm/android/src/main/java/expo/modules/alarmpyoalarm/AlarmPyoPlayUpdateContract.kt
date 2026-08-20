package expo.modules.alarmpyoalarm

internal enum class AlarmPyoPlayUpdateInstallStatus(val wireValue: String) {
  UNKNOWN("unknown"),
  PENDING("pending"),
  DOWNLOADING("downloading"),
  DOWNLOADED("downloaded"),
  INSTALLING("installing"),
  INSTALLED("installed"),
  FAILED("failed"),
  CANCELED("canceled")
}

internal object AlarmPyoPlayUpdatePolicy {
  fun state(
    supported: Boolean,
    updateAvailable: Boolean,
    installStatus: AlarmPyoPlayUpdateInstallStatus
  ): String = when {
    !supported -> "unsupported"
    installStatus == AlarmPyoPlayUpdateInstallStatus.PENDING ||
      installStatus == AlarmPyoPlayUpdateInstallStatus.DOWNLOADING -> "in-progress"
    installStatus == AlarmPyoPlayUpdateInstallStatus.DOWNLOADED -> "downloaded"
    installStatus == AlarmPyoPlayUpdateInstallStatus.INSTALLING -> "installing"
    installStatus == AlarmPyoPlayUpdateInstallStatus.INSTALLED -> "installed"
    installStatus == AlarmPyoPlayUpdateInstallStatus.FAILED -> "failed"
    installStatus == AlarmPyoPlayUpdateInstallStatus.CANCELED -> "canceled"
    updateAvailable -> "available"
    else -> "idle"
  }
}

internal data class AlarmPyoPlayUpdateStatus(
  val supported: Boolean,
  val updateAvailable: Boolean,
  val flexibleAllowed: Boolean,
  val availableVersionCode: Int,
  val installStatus: AlarmPyoPlayUpdateInstallStatus,
  val bytesDownloaded: Long,
  val totalBytesToDownload: Long,
  val errorCode: Int
) {
  val state: String
    get() = AlarmPyoPlayUpdatePolicy.state(supported, updateAvailable, installStatus)

  fun toMap(): Map<String, Any> = mapOf(
    "supported" to supported,
    "state" to state,
    "updateAvailable" to updateAvailable,
    "flexibleAllowed" to flexibleAllowed,
    "availableVersionCode" to availableVersionCode,
    "installStatus" to installStatus.wireValue,
    "bytesDownloaded" to bytesDownloaded.toDouble(),
    "totalBytesToDownload" to totalBytesToDownload.toDouble(),
    "errorCode" to errorCode
  )

  companion object {
    fun unsupported(errorCode: Int = 0) = AlarmPyoPlayUpdateStatus(
      supported = false,
      updateAvailable = false,
      flexibleAllowed = false,
      availableVersionCode = 0,
      installStatus = AlarmPyoPlayUpdateInstallStatus.UNKNOWN,
      bytesDownloaded = 0L,
      totalBytesToDownload = 0L,
      errorCode = errorCode
    )
  }
}

internal data class AlarmPyoPlayUpdateStartResult(
  val started: Boolean,
  val resultCode: Int,
  val status: AlarmPyoPlayUpdateStatus
) {
  fun toMap(): Map<String, Any> = mapOf(
    "started" to started,
    "resultCode" to resultCode,
    "status" to status.toMap()
  )

  companion object {
    fun unsupported(errorCode: Int = 0) = AlarmPyoPlayUpdateStartResult(
      started = false,
      resultCode = 0,
      status = AlarmPyoPlayUpdateStatus.unsupported(errorCode)
    )
  }
}

internal data class AlarmPyoPlayUpdateCompleteResult(
  val completed: Boolean,
  val status: AlarmPyoPlayUpdateStatus
) {
  fun toMap(): Map<String, Any> = mapOf(
    "completed" to completed,
    "status" to status.toMap()
  )

  companion object {
    fun unsupported(errorCode: Int = 0) = AlarmPyoPlayUpdateCompleteResult(
      completed = false,
      status = AlarmPyoPlayUpdateStatus.unsupported(errorCode)
    )
  }
}
