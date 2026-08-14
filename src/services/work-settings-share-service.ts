import {
  DEFAULT_ALARM_MINUTES_BEFORE,
  LEGACY_MAX_ALARM_MINUTES_BEFORE,
  MAX_ALARM_MINUTES_BEFORE,
  type AppData,
  type RotationPattern,
  type ShiftType,
} from '../models/app-data';
import { createDefaultWorkShift } from '../application/app-data-defaults';
import { isValidDateKey } from '../utils/date';
import { stripOptionalUtf8Bom } from '../utils/json';
import { getUtf8ByteLength } from '../utils/utf8';
import {
  createWorkPatternFromReference,
  getWorkPatternDisplayName,
  getWorkPatternPresetId,
  isBaseWorkShiftId,
  isValidCustomPatternSequence,
  type WorkPatternKind,
} from '../utils/work-pattern';
import { canBuildWorkRoutinePlan } from './work-routine-planner';

export const WORK_SETTINGS_SHARE_FORMAT = 'alarmpyo-work-settings' as const;
export const LEGACY_WORK_SETTINGS_SHARE_FORMAT =
  'today-shift-work-settings' as const;
export const WORK_SETTINGS_SHARE_FORMAT_VERSION = 7 as const;
const LEGACY_WORK_SETTINGS_SHARE_FORMAT_VERSIONS = [1, 2, 3, 4, 5, 6] as const;
type WorkSettingsShareFormatVersion =
  | (typeof LEGACY_WORK_SETTINGS_SHARE_FORMAT_VERSIONS)[number]
  | typeof WORK_SETTINGS_SHARE_FORMAT_VERSION;
export const MAX_WORK_SETTINGS_SHARE_BYTES = 256 * 1024;

const SHARED_SHIFT_IDS = [
  'day',
  'evening',
  'night',
  'substitute-day',
  'substitute-night',
  'off',
] as const;
const LEGACY_SHARED_SHIFT_IDS = SHARED_SHIFT_IDS.filter((id) => id !== 'evening');

type SharedShiftId = (typeof SHARED_SHIFT_IDS)[number];
type UnknownRecord = Record<string, unknown>;

export type SharedShiftSettings = Pick<
  ShiftType,
  | 'id'
  | 'startMinutes'
  | 'endMinutes'
  | 'endsNextDay'
  | 'isOff'
  | 'alarmEnabled'
  | 'alarmMinutesBefore'
> & { id: SharedShiftId };

export type WorkSettingsShareDocument = {
  format: typeof WORK_SETTINGS_SHARE_FORMAT;
  formatVersion: typeof WORK_SETTINGS_SHARE_FORMAT_VERSION;
  workSettings: {
    pattern: RotationPattern;
    shiftTypes: SharedShiftSettings[];
  };
};

export type WorkSettingsSharePreview = {
  document: WorkSettingsShareDocument;
  sourceFormatVersion: WorkSettingsShareFormatVersion;
  summary: {
    patternKind: WorkPatternKind;
    patternName: string;
    anchorDate: string;
    scheduleStartDate: string;
    day: SharedShiftSettings;
    evening: SharedShiftSettings;
    night: SharedShiftSettings;
    substituteDay: SharedShiftSettings;
    substituteNight: SharedShiftSettings;
  };
};

export type WorkSettingsApplyResult =
  | { success: true }
  | {
      success: false;
      reason: 'not-ready' | 'invalid-file' | 'backup-failed' | 'save-failed';
    };

export class WorkSettingsShareValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkSettingsShareValidationError';
  }
}

export function doesWorkSettingsPreviewApplyEvening(
  preview: Pick<WorkSettingsSharePreview, 'sourceFormatVersion'>,
): boolean {
  return preview.sourceFormatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new WorkSettingsShareValidationError(`${label} 형식이 올바르지 않아요.`);
  }
  return value;
}

function exactKeys(value: UnknownRecord, expected: readonly string[], label: string) {
  const expectedSet = new Set(expected);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    actual.some((key) => !expectedSet.has(key))
  ) {
    throw new WorkSettingsShareValidationError(
      `${label}에 허용되지 않는 항목이 있거나 필요한 항목이 없어요.`,
    );
  }
}

function legacyWorkSettingsKeys(
  value: UnknownRecord,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  if (
    value.pattern === undefined ||
    value.shiftTypes === undefined ||
    Object.keys(value).some((key) => !allowedSet.has(key))
  ) {
    throw new WorkSettingsShareValidationError(
      '공유 근무 설정에 허용되지 않는 항목이 있거나 필요한 항목이 없어요.',
    );
  }
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new WorkSettingsShareValidationError(`${label} 값이 올바르지 않아요.`);
  }
  return value;
}

function integerInRange(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new WorkSettingsShareValidationError(`${label} 값이 올바르지 않아요.`);
  }
  return value as number;
}

function nullableMinutes(value: unknown, label: string): number | null {
  if (value === null) return null;
  return integerInRange(value, label, 0, 24 * 60 - 1);
}

function parseShiftSettings(value: unknown, index: number): SharedShiftSettings {
  const item = record(value, `${index + 1}번째 근무 설정`);
  exactKeys(
    item,
    [
      'id',
      'startMinutes',
      'endMinutes',
      'endsNextDay',
      'isOff',
      'alarmEnabled',
      'alarmMinutesBefore',
    ],
    `${index + 1}번째 근무 설정`,
  );

  if (typeof item.id !== 'string' || !SHARED_SHIFT_IDS.includes(item.id as SharedShiftId)) {
    throw new WorkSettingsShareValidationError(`${index + 1}번째 근무 ID가 올바르지 않아요.`);
  }

  const id = item.id as SharedShiftId;
  const isOff = requiredBoolean(item.isOff, `${id} 휴무 여부`);
  const startMinutes = nullableMinutes(item.startMinutes, `${id} 시작 시간`);
  const endMinutes = nullableMinutes(item.endMinutes, `${id} 종료 시간`);
  const endsNextDay = requiredBoolean(item.endsNextDay, `${id} 다음 날 종료 여부`);
  const alarmEnabled = requiredBoolean(item.alarmEnabled, `${id} 알람 사용 여부`);
  const rawAlarmMinutesBefore = integerInRange(
    item.alarmMinutesBefore,
    `${id} 알람 선행 시간`,
    0,
    LEGACY_MAX_ALARM_MINUTES_BEFORE,
  );
  // 같은 파일 형식의 이전 계약은 최대 7일까지 허용했어요. 기존 공유 파일을
  // 읽지 못하게 만들지 않고, 현재 네이티브 계약 안의 기본값으로 안전하게 보정해요.
  const alarmMinutesBefore = rawAlarmMinutesBefore > MAX_ALARM_MINUTES_BEFORE
    ? DEFAULT_ALARM_MINUTES_BEFORE
    : rawAlarmMinutesBefore;

  if (id === 'off') {
    if (
      !isOff ||
      startMinutes !== null ||
      endMinutes !== null ||
      endsNextDay ||
      alarmEnabled ||
      alarmMinutesBefore !== 0
    ) {
      throw new WorkSettingsShareValidationError('휴무 설정이 올바르지 않아요.');
    }
  } else {
    if (isOff || startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      throw new WorkSettingsShareValidationError(`${id} 근무 시간이 올바르지 않아요.`);
    }
    if (endsNextDay !== (endMinutes < startMinutes)) {
      throw new WorkSettingsShareValidationError(`${id} 종료일 설정이 근무 시간과 맞지 않아요.`);
    }
  }

  return {
    id,
    startMinutes,
    endMinutes,
    endsNextDay,
    isOff,
    alarmEnabled,
    alarmMinutesBefore,
  };
}

function parsePattern(
  value: unknown,
  formatVersion: WorkSettingsShareFormatVersion,
): { pattern: RotationPattern; kind: WorkPatternKind } {
  const item = record(value, '근무 방식');
  exactKeys(
    item,
    formatVersion === 1
      ? ['name', 'anchorDate', 'shiftTypeIds']
      : ['name', 'anchorDate', 'scheduleStartDate', 'shiftTypeIds'],
    '근무 방식',
  );
  if (typeof item.name !== 'string') {
    throw new WorkSettingsShareValidationError('근무 방식 이름이 올바르지 않아요.');
  }
  if (typeof item.anchorDate !== 'string' || !isValidDateKey(item.anchorDate)) {
    throw new WorkSettingsShareValidationError('기준 날짜가 올바르지 않아요.');
  }
  const scheduleStartDate =
    formatVersion === 1
      ? item.anchorDate
      : item.scheduleStartDate;
  if (typeof scheduleStartDate !== 'string' || !isValidDateKey(scheduleStartDate)) {
    throw new WorkSettingsShareValidationError('첫 근무일이 올바르지 않아요.');
  }
  if (!Array.isArray(item.shiftTypeIds) || item.shiftTypeIds.some((id) => typeof id !== 'string')) {
    throw new WorkSettingsShareValidationError('근무 반복 순서가 올바르지 않아요.');
  }
  const shiftTypeIds = [...item.shiftTypeIds] as string[];
  const presetId = getWorkPatternPresetId(shiftTypeIds);
  const currentPatternValid =
    shiftTypeIds.every(isBaseWorkShiftId) &&
    (presetId !== 'custom' || isValidCustomPatternSequence(shiftTypeIds));
  const legacyPatternValid =
    (presetId === 'three-team-two-shift' || presetId === 'weekday') &&
    item.name === getWorkPatternDisplayName(shiftTypeIds, item.name);
  if (
    (formatVersion < WORK_SETTINGS_SHARE_FORMAT_VERSION && !legacyPatternValid) ||
    (formatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION && !currentPatternValid)
  ) {
    throw new WorkSettingsShareValidationError('알람표에서 지원하는 근무 방식이 아니에요.');
  }
  const normalizedKind = presetId === 'weekday' ? 'weekday' : 'rotation';
  const pattern =
    formatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION && presetId === 'weekday'
      ? createWorkPatternFromReference({
          presetId: 'weekday',
          referenceDate: scheduleStartDate,
          scheduleStartDate,
        })
      : {
          name: getWorkPatternDisplayName(shiftTypeIds, item.name),
          anchorDate: item.anchorDate,
          scheduleStartDate,
          shiftTypeIds,
        };
  return {
    kind: normalizedKind,
    pattern,
  };
}

function validateDocument(value: unknown): WorkSettingsSharePreview {
  const root = record(value, '근무 설정 파일');
  exactKeys(root, ['format', 'formatVersion', 'workSettings'], '근무 설정 파일');
  const legacyFormat = root.format === LEGACY_WORK_SETTINGS_SHARE_FORMAT;
  if (root.format !== WORK_SETTINGS_SHARE_FORMAT && !legacyFormat) {
    throw new WorkSettingsShareValidationError('알람표 근무 설정 파일이 아니에요.');
  }
  const currentVersion = root.formatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION;
  // V04는 현재 계보 ID로 v6를 내보냈어요. v7 승격 후에도 실제
  // 배포판이 만든 v6를 읽어야 기존 사용자가 공유한 설정을 복원할 수 있어요.
  const previousCurrentVersion = root.formatVersion === 6;
  const legacyVersion = LEGACY_WORK_SETTINGS_SHARE_FORMAT_VERSIONS.includes(
    root.formatVersion as (typeof LEGACY_WORK_SETTINGS_SHARE_FORMAT_VERSIONS)[number],
  );
  if (
    (legacyFormat && !legacyVersion) ||
    (!legacyFormat && !currentVersion && !previousCurrentVersion)
  ) {
    throw new WorkSettingsShareValidationError('지원하지 않는 근무 설정 파일 버전이에요.');
  }
  const formatVersion = root.formatVersion as WorkSettingsShareFormatVersion;

  const workSettings = record(root.workSettings, '공유 근무 설정');
  const expectedWorkSettingKeys =
    formatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION
      ? ['pattern', 'shiftTypes']
      : formatVersion === 5
        ? ['pattern', 'shiftTypes', 'activityPlans', 'datedActivityPlans']
      : formatVersion === 4
        ? ['pattern', 'shiftTypes', 'activityPlans']
        : formatVersion === 3
        ? ['pattern', 'shiftTypes', 'workBreakPlans']
        : ['pattern', 'shiftTypes'];
  if (formatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION) {
    exactKeys(workSettings, expectedWorkSettingKeys, '공유 근무 설정');
  } else {
    // 제거된 활동 필드가 손상되거나 누락돼도 핵심 근무 설정 복원을 막지 않아요.
    legacyWorkSettingsKeys(workSettings, expectedWorkSettingKeys);
  }
  const { kind, pattern } = parsePattern(workSettings.pattern, formatVersion);
  const expectedShiftIds =
    formatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION
      ? SHARED_SHIFT_IDS
      : LEGACY_SHARED_SHIFT_IDS;
  if (!Array.isArray(workSettings.shiftTypes) || workSettings.shiftTypes.length !== expectedShiftIds.length) {
    throw new WorkSettingsShareValidationError('공유할 근무 종류가 모두 들어 있지 않아요.');
  }
  const parsedShiftTypes = workSettings.shiftTypes.map(parseShiftSettings);
  const shiftTypes =
    formatVersion === WORK_SETTINGS_SHARE_FORMAT_VERSION
      ? parsedShiftTypes
      : [
          parsedShiftTypes[0],
          sharedShiftFromShiftType({
            ...createDefaultWorkShift('evening'),
            id: 'evening',
          }),
          ...parsedShiftTypes.slice(1),
        ];
  const byId = new Map(shiftTypes.map((shift) => [shift.id, shift]));
  if (
    byId.size !== SHARED_SHIFT_IDS.length ||
    SHARED_SHIFT_IDS.some((id) => !byId.has(id)) ||
    expectedShiftIds.some((id) => !parsedShiftTypes.some((shift) => shift.id === id))
  ) {
    throw new WorkSettingsShareValidationError('공유 근무 종류가 중복됐거나 누락됐어요.');
  }

  const document: WorkSettingsShareDocument = {
    format: WORK_SETTINGS_SHARE_FORMAT,
    formatVersion: WORK_SETTINGS_SHARE_FORMAT_VERSION,
    workSettings: { pattern, shiftTypes },
  };
  return {
    document,
    sourceFormatVersion: formatVersion,
    summary: {
      patternKind: kind,
      patternName: pattern.name,
      anchorDate: pattern.anchorDate,
      scheduleStartDate: pattern.scheduleStartDate ?? pattern.anchorDate,
      day: byId.get('day')!,
      evening: byId.get('evening')!,
      night: byId.get('night')!,
      substituteDay: byId.get('substitute-day')!,
      substituteNight: byId.get('substitute-night')!,
    },
  };
}

function sharedShiftFromShiftType(
  shift: ShiftType & { id: SharedShiftId },
): SharedShiftSettings {
  return {
    id: shift.id,
    startMinutes: shift.startMinutes,
    endMinutes: shift.endMinutes,
    endsNextDay: shift.endsNextDay,
    isOff: shift.isOff,
    alarmEnabled: shift.alarmEnabled,
    alarmMinutesBefore: shift.alarmMinutesBefore,
  };
}

function sharedShiftFromAppData(data: AppData, id: SharedShiftId): SharedShiftSettings {
  const shift = data.shiftTypes.find((item) => item.id === id);
  if (!shift) {
    throw new WorkSettingsShareValidationError(`${id} 근무 설정을 찾을 수 없어요.`);
  }
  return sharedShiftFromShiftType({ ...shift, id });
}

export function exportWorkSettingsToJson(data: AppData): string {
  const document: WorkSettingsShareDocument = {
    format: WORK_SETTINGS_SHARE_FORMAT,
    formatVersion: WORK_SETTINGS_SHARE_FORMAT_VERSION,
    workSettings: {
      pattern: {
        name: data.pattern.name,
        anchorDate: data.pattern.anchorDate,
        scheduleStartDate: data.pattern.scheduleStartDate ?? data.pattern.anchorDate,
        shiftTypeIds: [...data.pattern.shiftTypeIds],
      },
      shiftTypes: SHARED_SHIFT_IDS.map((id) => sharedShiftFromAppData(data, id)),
    },
  };
  // 공유 파일도 가져오기 미리보기와 같은 canonical 문서를 내보내 mode 모호성을 남기지 않아요.
  const normalizedDocument = validateDocument(document).document;
  const contents = JSON.stringify(normalizedDocument, null, 2);
  if (getUtf8ByteLength(contents) > MAX_WORK_SETTINGS_SHARE_BYTES) {
    throw new WorkSettingsShareValidationError('근무 설정 파일이 허용 크기를 넘었어요.');
  }
  return contents;
}

export function previewWorkSettingsImport(raw: string): WorkSettingsSharePreview {
  if (getUtf8ByteLength(raw) > MAX_WORK_SETTINGS_SHARE_BYTES) {
    throw new WorkSettingsShareValidationError('근무 설정 파일은 256KB 이하여야 해요.');
  }
  let value: unknown;
  try {
    value = JSON.parse(stripOptionalUtf8Bom(raw));
  } catch {
    throw new WorkSettingsShareValidationError('근무 설정 파일을 읽을 수 없어요.');
  }
  return validateDocument(value);
}

export function applyWorkSettingsPreview(
  current: AppData,
  preview: WorkSettingsSharePreview,
): AppData {
  // 미리보기 객체가 화면에 머무는 동안 변경돼도 적용 전에 다시 검증해요.
  const validatedPreview = validateDocument(preview.document);
  const validated = validatedPreview.document.workSettings;
  const sharedById = new Map(validated.shiftTypes.map((shift) => [shift.id, shift]));
  // document는 미리보기에서 항상 canonical v7로 정규화되므로 원본 계보는
  // preview의 provenance를 사용해야 구형 파일의 합성 evening을 구분할 수 있어요.
  const applyEvening = doesWorkSettingsPreviewApplyEvening(preview);
  const shiftTypes = current.shiftTypes.map((shift) => {
    if (shift.id === 'evening' && !applyEvening) return shift;
    const shared = sharedById.get(shift.id as SharedShiftId);
    if (!shared) return shift;
    return {
      ...shift,
      startMinutes: shared.startMinutes,
      endMinutes: shared.endMinutes,
      endsNextDay: shared.endsNextDay,
      isOff: shared.isOff,
      alarmEnabled: shared.alarmEnabled,
      alarmMinutesBefore: shared.alarmMinutesBefore,
    };
  });
  const routinesCompatible = shiftTypes
    .filter((shift) =>
      SHARED_SHIFT_IDS.includes(shift.id as SharedShiftId) && !shift.isOff,
    )
    .every((shift) =>
      canBuildWorkRoutinePlan(
        shift,
        current.settings.workRoutineProfiles,
      ),
    );
  if (!routinesCompatible) {
    throw new WorkSettingsShareValidationError(
      '공유된 기상 알람은 현재 출근 루틴의 출발 시각보다 빨라야 해요.',
    );
  }

  const next: AppData = {
    ...current,
    pattern: {
      name: validated.pattern.name,
      anchorDate: validated.pattern.anchorDate,
      scheduleStartDate:
        validated.pattern.scheduleStartDate ?? validated.pattern.anchorDate,
      shiftTypeIds: [...validated.pattern.shiftTypeIds],
    },
    shiftTypes,
  };
  return next;
}

export async function applyWorkSettingsTransaction({
  current,
  preview,
  createSafetyBackup,
  prepare,
  save,
}: {
  current: AppData;
  preview: WorkSettingsSharePreview;
  createSafetyBackup: () => Promise<unknown>;
  prepare?: (next: AppData) => AppData | null;
  save: (next: AppData) => Promise<boolean>;
}): Promise<WorkSettingsApplyResult> {
  let next: AppData;
  try {
    next = applyWorkSettingsPreview(current, preview);
  } catch {
    return { success: false, reason: 'invalid-file' };
  }

  if (prepare) {
    try {
      const prepared = prepare(next);
      if (prepared === null) return { success: false, reason: 'save-failed' };
      next = prepared;
    } catch {
      return { success: false, reason: 'save-failed' };
    }
  }

  try {
    await createSafetyBackup();
  } catch {
    return { success: false, reason: 'backup-failed' };
  }

  try {
    return (await save(next))
      ? { success: true }
      : { success: false, reason: 'save-failed' };
  } catch {
    return { success: false, reason: 'save-failed' };
  }
}
