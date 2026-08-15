package expo.modules.alarmpyoalarm

import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil

internal data class AlarmPyoWidgetEntry(
  val dateKey: String,
  val shiftTypeId: String,
  val shiftName: String,
  val startMinutes: Int?,
  val endMinutes: Int?,
  val endsNextDay: Boolean,
  val isOff: Boolean,
  val isOverride: Boolean,
  val exceptionName: String? = null
)

internal data class AlarmPyoWidgetDisplayOptions(
  val todayShift: Boolean = true,
  val nextShift: Boolean = true,
  val nextAlarm: Boolean = false
) {
  fun hasSelection(): Boolean = todayShift || nextShift || nextAlarm
}

internal data class AlarmPyoWidgetAlarm(
  val alarmAt: Long,
  val shiftTypeId: String,
  val shiftName: String
)

internal data class AlarmPyoWidgetSnapshot(
  val generatedAt: Long,
  val setupCompleted: Boolean = true,
  val entries: List<AlarmPyoWidgetEntry>,
  val displayOptions: AlarmPyoWidgetDisplayOptions = AlarmPyoWidgetDisplayOptions(),
  val alarms: List<AlarmPyoWidgetAlarm> = emptyList()
) {
  companion object {
    fun fromJson(raw: String): AlarmPyoWidgetSnapshot? = runCatching {
      val root = JSONObject(raw)
      require(root.optInt("version", -1) == 2)
      val entriesJson = root.getJSONArray("entries")
      require(entriesJson.length() in 1..367)
      val entries = buildList {
        for (index in 0 until entriesJson.length()) {
          val item = entriesJson.getJSONObject(index)
          val dateKey = item.getString("dateKey").trim()
          require(DATE_KEY_REGEX.matches(dateKey))
          val startMinutes = item.optionalMinutes("startMinutes")
          val endMinutes = item.optionalMinutes("endMinutes")
          val isOff = item.optBoolean("isOff", startMinutes == null)
          val inferredEndsNextDay =
            startMinutes != null && endMinutes != null && endMinutes < startMinutes
          val endsNextDay = item.optBoolean("endsNextDay", inferredEndsNextDay)
          if (!isOff && startMinutes != null && endMinutes != null) {
            require(startMinutes != endMinutes)
            require(endsNextDay == inferredEndsNextDay)
          }
          add(
            AlarmPyoWidgetEntry(
              dateKey = dateKey,
              shiftTypeId = item.optString("shiftTypeId").trim().take(64),
              shiftName = item.optString("shiftName").trim().take(30),
              startMinutes = startMinutes,
              endMinutes = endMinutes,
              endsNextDay = endsNextDay,
              isOff = isOff,
              isOverride = item.optBoolean("isOverride", false),
              exceptionName = if (item.isNull("exceptionName")) {
                null
              } else {
                item.optString("exceptionName")
                  .trim()
                  .take(20)
                  .ifBlank { null }
              }
            )
          )
        }
      }
      require(entries.map(AlarmPyoWidgetEntry::dateKey).distinct().size == entries.size)
      val displayOptionsJson = root.optJSONObject("displayOptions")
      val displayOptions = if (displayOptionsJson == null) {
        AlarmPyoWidgetDisplayOptions()
      } else {
        AlarmPyoWidgetDisplayOptions(
          todayShift = displayOptionsJson.optBoolean("todayShift", true),
          nextShift = displayOptionsJson.optBoolean("nextShift", true),
          nextAlarm = displayOptionsJson.optBoolean("nextAlarm", false)
        )
      }
      require(displayOptions.hasSelection())
      val alarmsJson = root.optJSONArray("alarms")
      val alarms = if (alarmsJson == null) {
        emptyList()
      } else {
        require(alarmsJson.length() <= 366)
        buildList {
          for (index in 0 until alarmsJson.length()) {
            val item = alarmsJson.getJSONObject(index)
            val alarmAt = item.getLong("alarmAt")
            require(alarmAt > 0L)
            add(
              AlarmPyoWidgetAlarm(
                alarmAt = alarmAt,
                shiftTypeId = item.optString("shiftTypeId").trim().take(64),
                shiftName = item.optString("shiftName").trim().take(30)
              )
            )
          }
        }.sortedBy(AlarmPyoWidgetAlarm::alarmAt)
      }
      AlarmPyoWidgetSnapshot(
        generatedAt = root.optLong("generatedAt", 0L).coerceAtLeast(0L),
        setupCompleted = root.optBoolean("setupCompleted", false),
        entries = entries.sortedBy(AlarmPyoWidgetEntry::dateKey),
        displayOptions = displayOptions,
        alarms = alarms
      )
    }.getOrNull()

    private fun JSONObject.optionalMinutes(key: String): Int? =
      if (!has(key) || isNull(key)) null else getInt(key).also { require(it in 0..1439) }

    private val DATE_KEY_REGEX = Regex("^\\d{4}-\\d{2}-\\d{2}$")
  }
}

internal enum class AlarmPyoWidgetVisual {
  DAY,
  NIGHT,
  TRAINING,
  RESERVE,
  OFF,
  UNKNOWN
}

internal enum class AlarmPyoWidgetSectionKind {
  GENERIC,
  TODAY,
  NEXT_WORK,
  NEXT_ALARM
}

internal data class AlarmPyoWidgetViewState(
  val dateText: String,
  val statusText: String,
  val titleText: String,
  val scheduleText: String,
  val bottomLabel: String,
  val bottomText: String,
  val visual: AlarmPyoWidgetVisual,
  val contentDescription: String,
  val nextRefreshAt: Long?,
  val secondaryLabel: String? = null,
  val secondaryText: String? = null,
  val bottomSectionKind: AlarmPyoWidgetSectionKind = AlarmPyoWidgetSectionKind.GENERIC,
  val secondarySectionKind: AlarmPyoWidgetSectionKind = AlarmPyoWidgetSectionKind.GENERIC
)

private data class ShiftWindow(
  val entry: AlarmPyoWidgetEntry,
  val startAt: Long,
  val endAt: Long
)

private data class WidgetDisplayBlock(
  val sectionKind: AlarmPyoWidgetSectionKind,
  val label: String,
  val title: String,
  val detail: String,
  val compactText: String,
  val visual: AlarmPyoWidgetVisual
)

internal object AlarmPyoWidgetFormatter {
  private const val DAY_MILLIS = 24L * 60L * 60L * 1_000L

  fun format(
    snapshot: AlarmPyoWidgetSnapshot,
    nowMillis: Long = System.currentTimeMillis(),
    timeZone: TimeZone = TimeZone.getDefault()
  ): AlarmPyoWidgetViewState {
    val dateText = formatDate(nowMillis, timeZone)
    if (snapshot.entries.isEmpty()) {
      return state(
        dateText = dateText,
        statusText = "일정 갱신 필요",
        titleText = "근무표 갱신 필요",
        scheduleText = "앱을 열면 위젯이 자동으로 갱신됩니다",
        bottomLabel = "AlarmPyo",
        bottomText = "눌러서 앱 열기",
        visual = AlarmPyoWidgetVisual.UNKNOWN,
        nextRefreshAt = null
      )
    }
    if (!snapshot.setupCompleted) {
      return state(
        dateText = dateText,
        statusText = "설정 필요",
        titleText = "근무표 설정 필요",
        scheduleText = "앱에서 근무 방식을 먼저 선택해야 합니다",
        bottomLabel = "AlarmPyo",
        bottomText = "눌러서 설정하기",
        visual = AlarmPyoWidgetVisual.UNKNOWN,
        nextRefreshAt = null
      )
    }

    val todayKey = dateKey(nowMillis, timeZone)
    val today = snapshot.entries.firstOrNull { it.dateKey == todayKey }
    val windows = snapshot.entries.mapNotNull { shiftWindow(it, timeZone) }
    val active = windows.firstOrNull { nowMillis in it.startAt until it.endAt }
    val nextWork = windows.firstOrNull { it.startAt > nowMillis }
    val nextAlarm = snapshot.alarms.firstOrNull { it.alarmAt > nowMillis }

    val viewState = when {
      active != null -> activeState(dateText, active, nextWork, nowMillis, timeZone)
      today == null -> state(
        dateText = dateText,
        statusText = "일정 갱신 필요",
        titleText = "근무표 확인 필요",
        scheduleText = "앱을 열면 위젯이 자동으로 갱신됩니다",
        bottomLabel = "AlarmPyo",
        bottomText = "눌러서 확인하기",
        visual = AlarmPyoWidgetVisual.UNKNOWN,
        nextRefreshAt = null
      )
      today.isOff || today.startMinutes == null -> offState(
        dateText,
        today,
        nextWork,
        nowMillis,
        timeZone
      )
      else -> {
        val startAt = localTimeMillis(today, today.startMinutes, timeZone)
        val endAt = today.endMinutes?.let {
          localTimeMillis(today, it, timeZone, dayOffset = if (today.endsNextDay) 1 else 0)
        }
        when {
          startAt != null && startAt > nowMillis -> upcomingState(
            dateText,
            today,
            startAt,
            nowMillis,
            timeZone
          )
          endAt != null && endAt <= nowMillis -> completedState(
            dateText,
            today,
            nextWork,
            nowMillis,
            timeZone
          )
          else -> legacyCurrentState(
            dateText,
            today,
            nextWork,
            nowMillis,
            timeZone
          )
        }
      }
    }

    val displayedState = applyDisplayOptions(
      viewState,
      snapshot.displayOptions,
      nextWork,
      nextAlarm,
      nowMillis,
      timeZone
    )
    val eventRefreshAt = buildList {
      nextMidnight(nowMillis, timeZone)?.let(::add)
      if (snapshot.displayOptions.todayShift) {
        active?.endAt?.plus(1_000L)?.let(::add)
      }
      if (snapshot.displayOptions.todayShift || snapshot.displayOptions.nextShift) {
        nextWork?.startAt?.plus(1_000L)?.let(::add)
      }
      if (snapshot.displayOptions.nextAlarm) {
        nextAlarm?.alarmAt?.plus(1_000L)?.let(::add)
      }
    // 시작·종료 직전 30초 안에 위젯이 다시 그려져도 경계 갱신을 버리지 않습니다.
    // 각 근무 경계에는 이미 1초를 더했으므로 즉시 반복 예약도 생기지 않습니다.
    }.filter { it > nowMillis }.minOrNull()

    return displayedState.copy(nextRefreshAt = eventRefreshAt)
  }

  private fun applyDisplayOptions(
    todayState: AlarmPyoWidgetViewState,
    options: AlarmPyoWidgetDisplayOptions,
    nextWork: ShiftWindow?,
    nextAlarm: AlarmPyoWidgetAlarm?,
    nowMillis: Long,
    timeZone: TimeZone
  ): AlarmPyoWidgetViewState {
    val blocks = buildList {
      if (options.todayShift) {
        add(
          WidgetDisplayBlock(
            sectionKind = AlarmPyoWidgetSectionKind.TODAY,
            label = todayState.dateText,
            title = todayState.titleText,
            detail = todayState.scheduleText,
            compactText = "${todayState.titleText} · ${todayState.scheduleText}",
            visual = todayState.visual
          )
        )
      }
      if (options.nextShift) add(nextWorkBlock(nextWork, nowMillis, timeZone))
      if (options.nextAlarm) add(nextAlarmBlock(nextAlarm, nowMillis, timeZone))
    }
    val primary = blocks.first()
    val secondary = blocks.getOrNull(1)
    val tertiary = blocks.getOrNull(2)
    val description = blocks.joinToString(". ") {
      "${it.label}. ${it.title}. ${it.detail}"
    }
    return todayState.copy(
      dateText = primary.label,
      statusText = if (options.todayShift) todayState.statusText else primary.label,
      titleText = primary.title,
      scheduleText = primary.detail,
      bottomLabel = secondary?.label.orEmpty(),
      bottomText = secondary?.compactText.orEmpty(),
      bottomSectionKind = secondary?.sectionKind ?: AlarmPyoWidgetSectionKind.GENERIC,
      visual = primary.visual,
      contentDescription = description,
      secondaryLabel = tertiary?.label,
      secondaryText = tertiary?.compactText,
      secondarySectionKind = tertiary?.sectionKind ?: AlarmPyoWidgetSectionKind.GENERIC
    )
  }

  private fun nextWorkBlock(
    nextWork: ShiftWindow?,
    nowMillis: Long,
    timeZone: TimeZone
  ): WidgetDisplayBlock {
    if (nextWork == null) {
      return WidgetDisplayBlock(
        sectionKind = AlarmPyoWidgetSectionKind.NEXT_WORK,
        label = "다음 근무",
        title = "예정 없음",
        detail = "근무표 확인 필요",
        compactText = "예정 없음",
        visual = AlarmPyoWidgetVisual.UNKNOWN
      )
    }
    val entry = nextWork.entry
    val day = formatNextWorkDay(nextWork, nowMillis, timeZone)
    val shift = displayShift(entry)
    val clock = formatClock(entry.startMinutes!!)
    return WidgetDisplayBlock(
      sectionKind = AlarmPyoWidgetSectionKind.NEXT_WORK,
      label = "다음 근무",
      title = "$day $shift",
      detail = "$clock 시작",
      compactText = "$day $shift · $clock",
      visual = visualFor(entry)
    )
  }

  private fun nextAlarmBlock(
    nextAlarm: AlarmPyoWidgetAlarm?,
    nowMillis: Long,
    timeZone: TimeZone
  ): WidgetDisplayBlock {
    if (nextAlarm == null) {
      return WidgetDisplayBlock(
        sectionKind = AlarmPyoWidgetSectionKind.NEXT_ALARM,
        label = "다음 알람",
        title = "예약 없음",
        detail = "앱에서 알람 확인 필요",
        compactText = "예약 없음",
        visual = AlarmPyoWidgetVisual.UNKNOWN
      )
    }
    val day = formatRelativeDay(nextAlarm.alarmAt, nowMillis, timeZone)
    val clock = formatClockAt(nextAlarm.alarmAt, timeZone)
    val shift = displayAlarmShift(nextAlarm)
    return WidgetDisplayBlock(
      sectionKind = AlarmPyoWidgetSectionKind.NEXT_ALARM,
      label = "다음 알람",
      title = "$day $clock",
      detail = "$shift 알람",
      compactText = "$day $clock · $shift",
      visual = visualForAlarm(nextAlarm)
    )
  }

  private fun activeState(
    dateText: String,
    active: ShiftWindow,
    nextWork: ShiftWindow?,
    nowMillis: Long,
    timeZone: TimeZone
  ): AlarmPyoWidgetViewState {
    val entry = active.entry
    return state(
      dateText = dateText,
      statusText = "현재 근무 중",
      titleText = "${displayShift(entry)} 근무 중",
      scheduleText = formatSchedule(entry),
      bottomLabel = "다음 근무",
      bottomText = nextWork?.let { formatNextWork(it, nowMillis, timeZone) } ?: "예정 없음",
      visual = visualFor(entry),
      nextRefreshAt = nextWork?.startAt?.plus(1_000L),
      extraDescription = "퇴근까지 ${formatRemaining(active.endAt - nowMillis)}"
    )
  }

  private fun upcomingState(
    dateText: String,
    entry: AlarmPyoWidgetEntry,
    startAt: Long,
    nowMillis: Long,
    timeZone: TimeZone
  ): AlarmPyoWidgetViewState = state(
    dateText = dateText,
    statusText = if (entry.isOverride) "변경된 근무 예정" else "오늘 근무 예정",
    titleText = "${displayShift(entry)} 근무 예정",
    scheduleText = formatSchedule(entry),
    bottomLabel = "다음 근무",
    bottomText = formatNextWork(ShiftWindow(entry, startAt, startAt), nowMillis, timeZone),
    visual = visualFor(entry),
    nextRefreshAt = startAt + 1_000L,
    extraDescription = "출근까지 ${formatRemaining(startAt - nowMillis)}"
  )

  private fun completedState(
    dateText: String,
    entry: AlarmPyoWidgetEntry,
    nextWork: ShiftWindow?,
    nowMillis: Long,
    timeZone: TimeZone
  ): AlarmPyoWidgetViewState {
    return state(
      dateText = dateText,
      statusText = "오늘 근무 완료",
      titleText = "${displayShift(entry)} 근무 완료",
      scheduleText = formatSchedule(entry),
      bottomLabel = "다음 근무",
      bottomText = nextWork?.let { formatNextWork(it, nowMillis, timeZone) } ?: "예정 없음",
      visual = visualFor(entry),
      nextRefreshAt = nextWork?.startAt?.plus(1_000L),
      extraDescription = if (nextWork?.entry?.isOverride == true) "직접 변경한 다음 근무" else null
    )
  }

  private fun legacyCurrentState(
    dateText: String,
    entry: AlarmPyoWidgetEntry,
    nextWork: ShiftWindow?,
    nowMillis: Long,
    timeZone: TimeZone
  ): AlarmPyoWidgetViewState = state(
    dateText = dateText,
    statusText = "오늘 근무",
    titleText = displayShift(entry),
    scheduleText = formatSchedule(entry),
    bottomLabel = "다음 근무",
    bottomText = nextWork?.let { formatNextWork(it, nowMillis, timeZone) } ?: "일정 확인 필요",
    visual = visualFor(entry),
    nextRefreshAt = nextWork?.startAt?.plus(1_000L)
  )

  private fun offState(
    dateText: String,
    entry: AlarmPyoWidgetEntry,
    nextWork: ShiftWindow?,
    nowMillis: Long,
    timeZone: TimeZone
  ): AlarmPyoWidgetViewState {
    val offName = entry.exceptionName ?: displayShift(entry)
    return state(
      dateText = dateText,
      statusText = "오늘 $offName",
      titleText = offName,
      scheduleText = "오늘은 근무가 없습니다",
      bottomLabel = "다음 근무",
      bottomText = nextWork?.let { formatNextWork(it, nowMillis, timeZone) } ?: "예정 없음",
      visual = AlarmPyoWidgetVisual.OFF,
      nextRefreshAt = nextWork?.startAt?.plus(1_000L)
    )
  }

  private fun state(
    dateText: String,
    statusText: String,
    titleText: String,
    scheduleText: String,
    bottomLabel: String,
    bottomText: String,
    visual: AlarmPyoWidgetVisual,
    nextRefreshAt: Long?,
    extraDescription: String? = null
  ): AlarmPyoWidgetViewState {
    val description = listOfNotNull(
      dateText,
      statusText,
      titleText,
      scheduleText,
      "$bottomLabel $bottomText",
      extraDescription
    ).joinToString(". ")
    return AlarmPyoWidgetViewState(
      dateText = dateText,
      statusText = statusText,
      titleText = titleText,
      scheduleText = scheduleText,
      bottomLabel = bottomLabel,
      bottomText = bottomText,
      visual = visual,
      contentDescription = description,
      nextRefreshAt = nextRefreshAt
    )
  }

  private fun shiftWindow(entry: AlarmPyoWidgetEntry, timeZone: TimeZone): ShiftWindow? {
    if (entry.isOff) return null
    val startMinutes = entry.startMinutes ?: return null
    val endMinutes = entry.endMinutes ?: return null
    val startAt = localTimeMillis(entry, startMinutes, timeZone) ?: return null
    val endAt = localTimeMillis(
      entry,
      endMinutes,
      timeZone,
      dayOffset = if (entry.endsNextDay) 1 else 0
    ) ?: return null
    if (endAt <= startAt) return null
    return ShiftWindow(entry, startAt, endAt)
  }

  private fun displayShift(entry: AlarmPyoWidgetEntry): String {
    if (entry.isOff) {
      return if (entry.shiftTypeId.startsWith("exception-") && entry.shiftName.isNotBlank()) {
        entry.shiftName
      } else {
        "휴무"
      }
    }
    return when (entry.shiftTypeId) {
      "day" -> "주간"
      "night" -> "야간"
      "substitute-day" -> "주간 대체"
      "substitute-night" -> "야간 대체"
      else -> entry.shiftName.ifBlank { "근무" }
    }
  }

  private fun displayAlarmShift(alarm: AlarmPyoWidgetAlarm): String = when (alarm.shiftTypeId) {
    "day" -> alarm.shiftName.ifBlank { "주간" }
    "night" -> alarm.shiftName.ifBlank { "야간" }
    "substitute" -> alarm.shiftName.ifBlank { "대체근무" }
    else -> alarm.shiftName.ifBlank { "근무" }
  }

  private fun visualForAlarm(alarm: AlarmPyoWidgetAlarm): AlarmPyoWidgetVisual = when {
    alarm.shiftTypeId == "exception-training" -> AlarmPyoWidgetVisual.TRAINING
    alarm.shiftTypeId == "exception-reserve" -> AlarmPyoWidgetVisual.RESERVE
    alarm.shiftTypeId == "night" ||
      alarm.shiftTypeId == "substitute-night" -> AlarmPyoWidgetVisual.NIGHT
    else -> AlarmPyoWidgetVisual.DAY
  }

  private fun visualFor(entry: AlarmPyoWidgetEntry): AlarmPyoWidgetVisual = when {
    entry.shiftTypeId == "exception-training" -> AlarmPyoWidgetVisual.TRAINING
    entry.shiftTypeId == "exception-reserve" -> AlarmPyoWidgetVisual.RESERVE
    entry.isOff -> AlarmPyoWidgetVisual.OFF
    entry.shiftTypeId == "night" ||
      entry.shiftTypeId == "substitute-night" ||
      entry.endsNextDay -> AlarmPyoWidgetVisual.NIGHT
    else -> AlarmPyoWidgetVisual.DAY
  }

  private fun formatSchedule(entry: AlarmPyoWidgetEntry): String {
    val start = entry.startMinutes ?: return "근무 시간이 없습니다"
    val end = entry.endMinutes ?: return "${formatClock(start)} 시작"
    val endLabel = if (entry.endsNextDay) "익일 ${formatClock(end)}" else formatClock(end)
    return "${formatClock(start)}–$endLabel"
  }

  private fun formatNextWork(
    window: ShiftWindow,
    nowMillis: Long,
    timeZone: TimeZone
  ): String {
    return "${formatNextWorkDay(window, nowMillis, timeZone)} ${displayShift(window.entry)} · ${formatClock(window.entry.startMinutes!!)}"
  }

  private fun formatNextWorkDay(
    window: ShiftWindow,
    nowMillis: Long,
    timeZone: TimeZone
  ): String {
    val todayKey = dateKey(nowMillis, timeZone)
    val tomorrowKey = dateKey(
      Calendar.getInstance(timeZone).apply {
        timeInMillis = nowMillis
        add(Calendar.DAY_OF_MONTH, 1)
      }.timeInMillis,
      timeZone
    )
    return when (window.entry.dateKey) {
      todayKey -> "오늘"
      tomorrowKey -> "내일"
      else -> {
        val parts = window.entry.dateKey.split('-')
        "${parts[1].toInt()}월 ${parts[2].toInt()}일"
      }
    }
  }

  private fun formatRelativeDay(
    timestamp: Long,
    nowMillis: Long,
    timeZone: TimeZone
  ): String {
    val targetKey = dateKey(timestamp, timeZone)
    val todayKey = dateKey(nowMillis, timeZone)
    val tomorrowKey = dateKey(
      Calendar.getInstance(timeZone).apply {
        timeInMillis = nowMillis
        add(Calendar.DAY_OF_MONTH, 1)
      }.timeInMillis,
      timeZone
    )
    return when (targetKey) {
      todayKey -> "오늘"
      tomorrowKey -> "내일"
      else -> {
        val calendar = Calendar.getInstance(timeZone).apply { timeInMillis = timestamp }
        "${calendar.get(Calendar.MONTH) + 1}월 ${calendar.get(Calendar.DAY_OF_MONTH)}일"
      }
    }
  }

  private fun formatClock(minutes: Int): String = String.format(
    Locale.KOREA,
    "%02d:%02d",
    minutes / 60,
    minutes % 60
  )

  private fun formatClockAt(timestamp: Long, timeZone: TimeZone): String {
    val calendar = Calendar.getInstance(timeZone).apply { timeInMillis = timestamp }
    return String.format(
      Locale.KOREA,
      "%02d:%02d",
      calendar.get(Calendar.HOUR_OF_DAY),
      calendar.get(Calendar.MINUTE)
    )
  }

  private fun formatRemaining(remainingMillis: Long): String {
    val totalMinutes = ceil(remainingMillis.coerceAtLeast(0L) / 60_000.0).toLong()
    val hours = totalMinutes / 60L
    val minutes = totalMinutes % 60L
    return when {
      hours > 0L && minutes > 0L -> "${hours}시간 ${minutes}분 남음"
      hours > 0L -> "${hours}시간 남음"
      minutes > 0L -> "${minutes}분 남음"
      else -> "곧 시작"
    }
  }

  private fun formatDate(timestamp: Long, timeZone: TimeZone): String {
    val calendar = Calendar.getInstance(timeZone).apply { timeInMillis = timestamp }
    val weekday = WEEKDAYS[calendar.get(Calendar.DAY_OF_WEEK) - 1]
    return String.format(
      Locale.KOREA,
      "%d년 %d월 %d일 %s",
      calendar.get(Calendar.YEAR),
      calendar.get(Calendar.MONTH) + 1,
      calendar.get(Calendar.DAY_OF_MONTH),
      weekday
    )
  }

  private fun dateKey(timestamp: Long, timeZone: TimeZone): String {
    val calendar = Calendar.getInstance(timeZone).apply { timeInMillis = timestamp }
    return String.format(
      Locale.ROOT,
      "%04d-%02d-%02d",
      calendar.get(Calendar.YEAR),
      calendar.get(Calendar.MONTH) + 1,
      calendar.get(Calendar.DAY_OF_MONTH)
    )
  }

  private fun localTimeMillis(
    entry: AlarmPyoWidgetEntry,
    minutes: Int,
    timeZone: TimeZone,
    dayOffset: Int = 0
  ): Long? = runCatching {
    val parts = entry.dateKey.split('-').map(String::toInt)
    require(parts.size == 3)
    Calendar.getInstance(timeZone).apply {
      isLenient = false
      clear()
      set(parts[0], parts[1] - 1, parts[2], minutes / 60, minutes % 60, 0)
      set(Calendar.MILLISECOND, 0)
      if (dayOffset != 0) add(Calendar.DAY_OF_MONTH, dayOffset)
    }.timeInMillis
  }.getOrNull()

  private fun nextMidnight(nowMillis: Long, timeZone: TimeZone): Long? = runCatching {
    Calendar.getInstance(timeZone).apply {
      timeInMillis = nowMillis
      add(Calendar.DAY_OF_MONTH, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 1)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis
  }.getOrNull()

  private val WEEKDAYS = arrayOf(
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일"
  )
}
