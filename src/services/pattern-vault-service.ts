import type {
  AppData,
  AppliedPatternSource,
  DayTimeOverride,
  PatternHistoryEntry,
  PatternShiftCode,
  PatternVaultEntry,
  RotationPattern,
} from '../models/app-data';
import { addDays, isValidDateKey } from '../utils/date';
import {
  getWorkPatternDisplayName,
  getWorkPatternKind,
} from '../utils/work-pattern';
import { resolveBaseShift, resolveEffectiveDay } from './pattern-engine';
import { isOfficialPatternId } from './official-pattern-ids';
import { matchesOfficialPatternContract } from './official-pattern-contract';
import type { ValidatedPatternDescriptor } from './shift-pattern-schema';

export const PATTERN_APPLICATION_HORIZON_DAYS = 42;
export const MAX_PATTERN_VAULT_ITEMS = 100;
export const MAX_PATTERN_HISTORY_ITEMS = 10;

const PATTERN_SHIFT_CODES = new Set<PatternShiftCode>([
  'DAY',
  'EVENING',
  'NIGHT',
  'OFF',
  'DAY_SUBSTITUTE',
  'NIGHT_SUBSTITUTE',
]);

const SHIFT_TYPE_ID_BY_PATTERN_CODE: Readonly<Record<PatternShiftCode, string>> = {
  DAY: 'day',
  EVENING: 'evening',
  NIGHT: 'night',
  OFF: 'off',
  DAY_SUBSTITUTE: 'substitute-day',
  NIGHT_SUBSTITUTE: 'substitute-night',
};

const PATTERN_CODE_BY_SHIFT_TYPE_ID = new Map<string, PatternShiftCode>(
  Object.entries(SHIFT_TYPE_ID_BY_PATTERN_CODE).map(([code, id]) => [
    id,
    code as PatternShiftCode,
  ]),
);

export type UserPatternInput = {
  /** 생략하면 새 사용자 패턴 ID를 생성합니다. 기존 사용자 패턴 편집 때만 전달합니다. */
  id?: string;
  name: string;
  author?: string | null;
  anchorDate: string;
  shiftCodes: readonly PatternShiftCode[];
};

export type PatternOverridePolicy =
  | { mode: 'preserve' }
  | { mode: 'clear-all' }
  | { mode: 'selective'; dateKeys: readonly string[] };

export type PatternApplicationInput = {
  patternId: string;
  effectiveDate: string;
  overridePolicy: PatternOverridePolicy;
};

export type PatternApplicationPreviewRow = {
  dateKey: string;
  currentShiftTypeId: string | null;
  currentStartMinutes: number | null;
  currentEndMinutes: number | null;
  nextShiftTypeId: string | null;
  nextStartMinutes: number | null;
  nextEndMinutes: number | null;
  changed: boolean;
  /** 예외 일정이 실제 표시를 덮더라도 그 아래 근무 순서가 달라지는지 보여 줍니다. */
  scheduledShiftChanged: boolean;
  hasDirectOverride: boolean;
  willClearDirectOverride: boolean;
};

export type PatternApplicationPreview = {
  patternId: string;
  effectiveDate: string;
  horizonEndDate: string;
  rows: PatternApplicationPreviewRow[];
  changedDateCount: number;
  directOverrideDateKeys: string[];
  clearedOverrideDateKeys: string[];
};

export type PatternApplicationPreviewResult =
  | { status: 'ready'; preview: PatternApplicationPreview }
  | {
      status: 'failure';
      reason: 'not-ready' | 'pattern-not-found' | 'invalid-date' | 'invalid-policy';
    };

export type PatternVaultSaveResult =
  | { status: 'saved'; patternId: string; created: boolean }
  | { status: 'unchanged'; patternId: string }
  | {
      status: 'failure';
      reason:
        | 'not-ready'
        | 'invalid-pattern'
        | 'source-conflict'
        | 'vault-full'
        | 'storage-failed';
    };

export type PatternVaultDeleteResult =
  | { status: 'deleted'; patternId: string }
  | { status: 'not-found'; patternId: string }
  | {
      status: 'failure';
      reason: 'not-ready' | 'pattern-in-use' | 'storage-failed';
    };

export type PatternApplyResult =
  | {
      status: 'success';
      patternId: string;
      historyId: string;
      clearedOverrideDateKeys: string[];
    }
  | {
      status: 'failure';
      reason:
        | 'not-ready'
        | 'pattern-not-found'
        | 'invalid-date'
        | 'invalid-policy'
        | 'invalid-schedule'
        | 'backup-failed'
        | 'save-failed'
        | 'sync-failed'
        | 'rollback-failed';
      rolledBack: boolean;
    };

export type PatternRollbackResult =
  | { status: 'success'; historyId: string }
  | { status: 'nothing-to-rollback' }
  | {
      status: 'failure';
      reason:
        | 'not-ready'
        | 'history-conflict'
        | 'invalid-schedule'
        | 'backup-failed'
        | 'save-failed'
        | 'sync-failed'
        | 'rollback-failed';
      rolledBack: boolean;
    };

type VaultMutationResult =
  | {
      status: 'saved';
      data: AppData;
      patternId: string;
      created: boolean;
    }
  | { status: 'unchanged'; data: AppData; patternId: string }
  | {
      status: 'failure';
      reason: 'invalid-pattern' | 'source-conflict' | 'vault-full';
    };

export type PatternApplicationMutationResult =
  | {
      status: 'ready';
      data: AppData;
      preview: PatternApplicationPreview;
      history: PatternHistoryEntry;
    }
  | Extract<PatternApplicationPreviewResult, { status: 'failure' }>;

export type PatternRollbackMutationResult =
  | { status: 'ready'; data: AppData; history: PatternHistoryEntry }
  | { status: 'nothing-to-rollback' }
  | { status: 'failure'; reason: 'history-conflict' };

export type PatternPersistenceOutcome = {
  primarySaved: boolean;
  operationSucceeded: boolean;
  partialFailure: boolean;
};

export type PatternPersistenceTransactionResult =
  | { status: 'success' }
  | {
      status: 'failure';
      reason:
        | 'backup-failed'
        | 'save-failed'
        | 'sync-failed'
        | 'rollback-failed';
      rolledBack: boolean;
    };

export function patternShiftCodeToShiftTypeId(code: PatternShiftCode): string {
  return SHIFT_TYPE_ID_BY_PATTERN_CODE[code];
}

function arePatternNamesEquivalent(
  left: Pick<RotationPattern, 'name' | 'shiftTypeIds'>,
  right: Pick<RotationPattern, 'name' | 'shiftTypeIds'>,
): boolean {
  return (
    left.name === right.name ||
    left.name === getWorkPatternDisplayName(right.shiftTypeIds, right.name) ||
    right.name === getWorkPatternDisplayName(left.shiftTypeIds, left.name)
  );
}

/**
 * 보관본 ID만 같고 내용이 갱신된 경우를 "사용 중"으로 오인하지 않습니다.
 * 적용일은 보관본에 포함되지 않으므로 현재 pattern의 scheduleStartDate는 비교하지 않습니다.
 */
export function isPatternVaultEntryApplied(
  data: AppData,
  entry: PatternVaultEntry,
): boolean {
  if (
    data.appliedPatternId !== entry.id ||
    data.appliedPatternSource !== entry.source ||
    (data.pattern.kind ?? getWorkPatternKind(data.pattern.shiftTypeIds)) !== 'rotation' ||
    data.pattern.anchorDate !== entry.anchorDate ||
    !arePatternNamesEquivalent(data.pattern, {
      name: entry.name,
      shiftTypeIds: entry.shiftCodes.map(patternShiftCodeToShiftTypeId),
    }) ||
    data.pattern.shiftTypeIds.length !== entry.shiftCodes.length
  ) {
    return false;
  }
  return entry.shiftCodes.every(
    (code, index) =>
      data.pattern.shiftTypeIds[index] === patternShiftCodeToShiftTypeId(code),
  );
}

/**
 * 패턴 적용과 되돌리기가 같은 안전 백업→본문 저장→동기화→실패 복구 순서를
 * 사용하도록 비동기 트랜잭션 경계를 한곳에 둡니다.
 */
export async function runPatternPersistenceTransaction({
  createSafetyBackup,
  persistCandidate,
  candidateSyncFailed,
  persistRollback,
}: {
  createSafetyBackup: () => Promise<void>;
  persistCandidate: () => Promise<PatternPersistenceOutcome>;
  candidateSyncFailed: () => boolean;
  persistRollback: () => Promise<PatternPersistenceOutcome>;
}): Promise<PatternPersistenceTransactionResult> {
  try {
    await createSafetyBackup();
  } catch {
    return { status: 'failure', reason: 'backup-failed', rolledBack: false };
  }

  const candidate = await persistCandidate();
  if (
    candidate.primarySaved &&
    candidate.operationSucceeded &&
    !candidate.partialFailure
  ) {
    return { status: 'success' };
  }
  if (!candidate.primarySaved) {
    return { status: 'failure', reason: 'save-failed', rolledBack: false };
  }

  const originalReason = candidateSyncFailed() ? 'sync-failed' : 'save-failed';
  const rollback = await persistRollback();
  const rolledBack = rollback.operationSucceeded;
  if (!rolledBack || rollback.partialFailure) {
    return { status: 'failure', reason: 'rollback-failed', rolledBack };
  }
  return { status: 'failure', reason: originalReason, rolledBack: true };
}

export function shiftTypeIdToPatternShiftCode(
  shiftTypeId: string,
): PatternShiftCode | null {
  return PATTERN_CODE_BY_SHIFT_TYPE_ID.get(shiftTypeId) ?? null;
}

export function createUserPatternId(now: Date, entropy: string): string {
  const safeEntropy = entropy.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return `user-${now.getTime().toString(36)}-${safeEntropy || 'local'}`;
}

function isValidPatternIdentity(value: string): boolean {
  return value.length >= 1 && value.length <= 100 && value.trim() === value;
}

function isValidPatternName(value: string): boolean {
  return value.length >= 1 && value.length <= 80 && value.trim() === value;
}

function isValidPatternAuthor(value: string | null): boolean {
  return value === null || (value.length >= 1 && value.length <= 80 && value.trim() === value);
}

function isValidShiftCodes(
  shiftCodes: readonly PatternShiftCode[],
): shiftCodes is readonly PatternShiftCode[] {
  return (
    shiftCodes.length >= 1 &&
    shiftCodes.length <= PATTERN_APPLICATION_HORIZON_DAYS &&
    shiftCodes.every((code) => PATTERN_SHIFT_CODES.has(code))
  );
}

function areVaultEntriesEqual(left: PatternVaultEntry, right: PatternVaultEntry): boolean {
  return (
    left.id === right.id &&
    left.source === right.source &&
    left.name === right.name &&
    left.author === right.author &&
    left.sourceVersion === right.sourceVersion &&
    left.anchorDate === right.anchorDate &&
    left.shiftCodes.length === right.shiftCodes.length &&
    left.shiftCodes.every((code, index) => code === right.shiftCodes[index])
  );
}

function upsertVaultEntry(current: AppData, entry: PatternVaultEntry): VaultMutationResult {
  const existingIndex = current.patternVault.findIndex((item) => item.id === entry.id);
  if (existingIndex < 0) {
    if (current.patternVault.length >= MAX_PATTERN_VAULT_ITEMS) {
      return { status: 'failure', reason: 'vault-full' };
    }
    return {
      status: 'saved',
      patternId: entry.id,
      created: true,
      data: { ...current, patternVault: [entry, ...current.patternVault] },
    };
  }

  const existing = current.patternVault[existingIndex];
  if (existing.source !== entry.source) {
    return { status: 'failure', reason: 'source-conflict' };
  }
  const updated = { ...entry, createdAt: existing.createdAt };
  if (areVaultEntriesEqual(existing, updated)) {
    return { status: 'unchanged', data: current, patternId: entry.id };
  }
  const patternVault = [...current.patternVault];
  patternVault[existingIndex] = updated;
  return {
    status: 'saved',
    patternId: entry.id,
    created: false,
    data: { ...current, patternVault },
  };
}

export function saveUserPatternMutation(
  current: AppData,
  input: UserPatternInput & { id: string },
  now: Date,
): VaultMutationResult {
  const author = input.author ?? null;
  if (
    !isValidPatternIdentity(input.id) ||
    isOfficialPatternId(input.id) ||
    !isValidPatternName(input.name) ||
    !isValidPatternAuthor(author) ||
    !isValidDateKey(input.anchorDate) ||
    !isValidShiftCodes(input.shiftCodes) ||
    Number.isNaN(now.getTime())
  ) {
    return { status: 'failure', reason: 'invalid-pattern' };
  }
  const timestamp = now.toISOString();
  return upsertVaultEntry(current, {
    id: input.id,
    source: 'user',
    name: input.name,
    author,
    sourceVersion: 1,
    anchorDate: input.anchorDate,
    shiftCodes: [...input.shiftCodes],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function importValidatedPatternMutation(
  current: AppData,
  descriptor: ValidatedPatternDescriptor,
  now: Date,
): VaultMutationResult {
  const source = descriptor.source === 'official' ? 'official' : 'imported';
  const verificationMatchesSource =
    (descriptor.source === 'official' &&
      descriptor.verification.status === 'official-verified') ||
    (descriptor.source === 'user' &&
      descriptor.verification.status === 'user-validated');
  const idMatchesSource = descriptor.source === 'official'
    ? isOfficialPatternId(descriptor.id)
    : !isOfficialPatternId(descriptor.id);
  const officialContractMatches =
    descriptor.source !== 'official' ||
    (isOfficialPatternId(descriptor.id) && matchesOfficialPatternContract({
      id: descriptor.id,
      name: descriptor.name,
      author: descriptor.author,
      sourceVersion: descriptor.sourceVersion,
      anchorDate: descriptor.anchorDate,
      shiftCodes: descriptor.shiftCodes,
    }));
  if (
    !verificationMatchesSource ||
    !idMatchesSource ||
    !officialContractMatches ||
    !isValidPatternIdentity(descriptor.id) ||
    !isValidPatternName(descriptor.name) ||
    !isValidPatternAuthor(descriptor.author) ||
    !Number.isSafeInteger(descriptor.sourceVersion) ||
    descriptor.sourceVersion < 1 ||
    !isValidDateKey(descriptor.anchorDate) ||
    !isValidShiftCodes(descriptor.shiftCodes) ||
    Number.isNaN(now.getTime())
  ) {
    return { status: 'failure', reason: 'invalid-pattern' };
  }
  const timestamp = now.toISOString();
  return upsertVaultEntry(current, {
    id: descriptor.id,
    source,
    name: descriptor.name,
    author: descriptor.author,
    sourceVersion: descriptor.sourceVersion,
    anchorDate: descriptor.anchorDate,
    shiftCodes: [...descriptor.shiftCodes],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function deletePatternMutation(
  current: AppData,
  patternId: string,
):
  | { status: 'deleted'; data: AppData; patternId: string }
  | { status: 'not-found'; data: AppData; patternId: string }
  | { status: 'failure'; reason: 'pattern-in-use' } {
  const index = current.patternVault.findIndex((entry) => entry.id === patternId);
  if (index < 0) return { status: 'not-found', data: current, patternId };
  if (
    current.appliedPatternId === patternId ||
    current.patternHistory.some(
      (history) =>
        history.patternId === patternId || history.previousPatternId === patternId,
    )
  ) {
    return { status: 'failure', reason: 'pattern-in-use' };
  }
  return {
    status: 'deleted',
    patternId,
    data: {
      ...current,
      patternVault: current.patternVault.filter((entry) => entry.id !== patternId),
    },
  };
}

function buildRotationPattern(
  entry: PatternVaultEntry,
  effectiveDate: string,
): RotationPattern {
  return {
    name: entry.name,
    anchorDate: entry.anchorDate,
    kind: 'rotation',
    scheduleStartDate: effectiveDate,
    shiftTypeIds: entry.shiftCodes.map(patternShiftCodeToShiftTypeId),
  };
}

function directEditDateKeysForHorizon(data: AppData, effectiveDate: string): string[] {
  const horizonEndDate = addDays(effectiveDate, PATTERN_APPLICATION_HORIZON_DAYS - 1);
  return Array.from(new Set([
    ...Object.keys(data.overrides),
    ...Object.keys(data.timeOverrides),
  ]))
    .filter((dateKey) => dateKey >= effectiveDate && dateKey <= horizonEndDate)
    .sort();
}

function resolveClearedDateKeys(
  directDateKeys: readonly string[],
  effectiveDate: string,
  policy: PatternOverridePolicy,
): string[] | null {
  if (policy.mode === 'preserve') return [];
  if (policy.mode === 'clear-all') return [...directDateKeys];
  const horizonEndDate = addDays(effectiveDate, PATTERN_APPLICATION_HORIZON_DAYS - 1);
  const unique = new Set<string>();
  for (const dateKey of policy.dateKeys) {
    if (
      !isValidDateKey(dateKey) ||
      dateKey < effectiveDate ||
      dateKey > horizonEndDate
    ) {
      return null;
    }
    unique.add(dateKey);
  }
  const direct = new Set(directDateKeys);
  return [...unique].filter((dateKey) => direct.has(dateKey)).sort();
}

function applyOverrideRemoval(
  data: AppData,
  dateKeys: readonly string[],
): {
  overrides: Record<string, string | null>;
  timeOverrides: Record<string, DayTimeOverride>;
  clearedOverrides: Record<string, string | null>;
  clearedTimeOverrides: Record<string, DayTimeOverride>;
} {
  const overrides = { ...data.overrides };
  const timeOverrides = { ...data.timeOverrides };
  const clearedOverrides: Record<string, string | null> = {};
  const clearedTimeOverrides: Record<string, DayTimeOverride> = {};
  for (const dateKey of dateKeys) {
    if (Object.prototype.hasOwnProperty.call(overrides, dateKey)) {
      clearedOverrides[dateKey] = overrides[dateKey];
      delete overrides[dateKey];
    }
    if (Object.prototype.hasOwnProperty.call(timeOverrides, dateKey)) {
      clearedTimeOverrides[dateKey] = { ...timeOverrides[dateKey] };
      delete timeOverrides[dateKey];
    }
  }
  return { overrides, timeOverrides, clearedOverrides, clearedTimeOverrides };
}

function sameResolvedShift(
  left: ReturnType<typeof resolveBaseShift>,
  right: ReturnType<typeof resolveBaseShift>,
): boolean {
  return (
    left?.id === right?.id &&
    left?.startMinutes === right?.startMinutes &&
    left?.endMinutes === right?.endMinutes &&
    left?.endsNextDay === right?.endsNextDay
  );
}

function buildPreview(
  current: AppData,
  candidate: AppData,
  input: PatternApplicationInput,
  directOverrideDateKeys: string[],
  clearedOverrideDateKeys: string[],
): PatternApplicationPreview {
  const cleared = new Set(clearedOverrideDateKeys);
  const direct = new Set(directOverrideDateKeys);
  const rows = Array.from({ length: PATTERN_APPLICATION_HORIZON_DAYS }, (_, index) => {
    const dateKey = addDays(input.effectiveDate, index);
    const currentScheduledShift = resolveBaseShift(current, dateKey);
    const nextScheduledShift = resolveBaseShift(candidate, dateKey);
    const currentShift = resolveEffectiveDay(current, dateKey).shift;
    const nextShift = resolveEffectiveDay(candidate, dateKey).shift;
    return {
      dateKey,
      currentShiftTypeId: currentShift?.id ?? null,
      currentStartMinutes: currentShift?.startMinutes ?? null,
      currentEndMinutes: currentShift?.endMinutes ?? null,
      nextShiftTypeId: nextShift?.id ?? null,
      nextStartMinutes: nextShift?.startMinutes ?? null,
      nextEndMinutes: nextShift?.endMinutes ?? null,
      changed: !sameResolvedShift(currentShift, nextShift),
      scheduledShiftChanged: !sameResolvedShift(
        currentScheduledShift,
        nextScheduledShift,
      ),
      hasDirectOverride: direct.has(dateKey),
      willClearDirectOverride: cleared.has(dateKey),
    } satisfies PatternApplicationPreviewRow;
  });
  return {
    patternId: input.patternId,
    effectiveDate: input.effectiveDate,
    horizonEndDate: addDays(
      input.effectiveDate,
      PATTERN_APPLICATION_HORIZON_DAYS - 1,
    ),
    rows,
    changedDateCount: rows.filter((row) => row.changed).length,
    directOverrideDateKeys,
    clearedOverrideDateKeys,
  };
}

function preparePatternApplication(
  current: AppData,
  input: PatternApplicationInput,
):
  | {
      status: 'ready';
      entry: PatternVaultEntry;
      pattern: RotationPattern;
      overrides: Record<string, string | null>;
      timeOverrides: Record<string, DayTimeOverride>;
      clearedOverrides: Record<string, string | null>;
      clearedTimeOverrides: Record<string, DayTimeOverride>;
      preview: PatternApplicationPreview;
    }
  | Extract<PatternApplicationPreviewResult, { status: 'failure' }> {
  const entry = current.patternVault.find((item) => item.id === input.patternId);
  if (!entry) return { status: 'failure', reason: 'pattern-not-found' };
  if (!isValidDateKey(input.effectiveDate)) {
    return { status: 'failure', reason: 'invalid-date' };
  }
  const directOverrideDateKeys = directEditDateKeysForHorizon(
    current,
    input.effectiveDate,
  );
  const clearedOverrideDateKeys = resolveClearedDateKeys(
    directOverrideDateKeys,
    input.effectiveDate,
    input.overridePolicy,
  );
  if (clearedOverrideDateKeys === null) {
    return { status: 'failure', reason: 'invalid-policy' };
  }
  const pattern = buildRotationPattern(entry, input.effectiveDate);
  const removed = applyOverrideRemoval(current, clearedOverrideDateKeys);
  const candidate: AppData = {
    ...current,
    pattern,
    overrides: removed.overrides,
    timeOverrides: removed.timeOverrides,
    appliedPatternSource: entry.source,
    appliedPatternId: entry.id,
  };
  return {
    status: 'ready',
    entry,
    pattern,
    ...removed,
    preview: buildPreview(
      current,
      candidate,
      input,
      directOverrideDateKeys,
      clearedOverrideDateKeys,
    ),
  };
}

export function previewPatternApplication(
  current: AppData,
  input: PatternApplicationInput,
): PatternApplicationPreviewResult {
  const prepared = preparePatternApplication(current, input);
  if (prepared.status === 'failure') return prepared;
  return { status: 'ready', preview: prepared.preview };
}

export function buildPatternApplicationMutation(
  current: AppData,
  input: PatternApplicationInput,
  now: Date,
  historyId: string,
): PatternApplicationMutationResult {
  const prepared = preparePatternApplication(current, input);
  if (prepared.status === 'failure') return prepared;
  if (
    Number.isNaN(now.getTime()) ||
    !isValidPatternIdentity(historyId) ||
    current.patternHistory.some((entry) => entry.id === historyId)
  ) {
    return { status: 'failure', reason: 'invalid-policy' };
  }
  const history: PatternHistoryEntry = {
    id: historyId,
    appliedAt: now.toISOString(),
    source: prepared.entry.source,
    patternId: prepared.entry.id,
    previousSource: current.appliedPatternSource,
    previousPatternId: current.appliedPatternId,
    previousPattern: {
      ...current.pattern,
      shiftTypeIds: [...current.pattern.shiftTypeIds],
    },
    nextPattern: {
      ...prepared.pattern,
      shiftTypeIds: [...prepared.pattern.shiftTypeIds],
    },
    clearedOverrides: { ...prepared.clearedOverrides },
    clearedTimeOverrides: Object.fromEntries(
      Object.entries(prepared.clearedTimeOverrides).map(([dateKey, value]) => [
        dateKey,
        { ...value },
      ]),
    ),
    overrideDateKeys: [...prepared.preview.clearedOverrideDateKeys],
  };
  return {
    status: 'ready',
    preview: prepared.preview,
    history,
    data: {
      ...current,
      pattern: prepared.pattern,
      overrides: prepared.overrides,
      timeOverrides: prepared.timeOverrides,
      patternHistory: [history, ...current.patternHistory].slice(
        0,
        MAX_PATTERN_HISTORY_ITEMS,
      ),
      appliedPatternSource: prepared.entry.source,
      appliedPatternId: prepared.entry.id,
    },
  };
}

function arePatternsEqual(left: RotationPattern, right: RotationPattern): boolean {
  return (
    (left.kind ?? getWorkPatternKind(left.shiftTypeIds)) ===
      (right.kind ?? getWorkPatternKind(right.shiftTypeIds)) &&
    arePatternNamesEquivalent(left, right) &&
    left.anchorDate === right.anchorDate &&
    (left.scheduleStartDate ?? left.anchorDate) ===
      (right.scheduleStartDate ?? right.anchorDate) &&
    left.shiftTypeIds.length === right.shiftTypeIds.length &&
    left.shiftTypeIds.every((id, index) => id === right.shiftTypeIds[index])
  );
}

export function buildPatternRollbackMutation(
  current: AppData,
): PatternRollbackMutationResult {
  const history = current.patternHistory[0];
  if (!history) return { status: 'nothing-to-rollback' };
  if (
    !arePatternsEqual(current.pattern, history.nextPattern) ||
    current.appliedPatternSource !== history.source ||
    current.appliedPatternId !== history.patternId
  ) {
    return { status: 'failure', reason: 'history-conflict' };
  }
  const laterDirectEditExists = history.overrideDateKeys.some(
    (dateKey) =>
      Object.prototype.hasOwnProperty.call(current.overrides, dateKey) ||
      Object.prototype.hasOwnProperty.call(current.timeOverrides, dateKey),
  );
  if (laterDirectEditExists) {
    return { status: 'failure', reason: 'history-conflict' };
  }
  return {
    status: 'ready',
    history,
    data: {
      ...current,
      pattern: {
        ...history.previousPattern,
        shiftTypeIds: [...history.previousPattern.shiftTypeIds],
      },
      overrides: { ...current.overrides, ...history.clearedOverrides },
      timeOverrides: {
        ...current.timeOverrides,
        ...Object.fromEntries(
          Object.entries(history.clearedTimeOverrides).map(([dateKey, value]) => [
            dateKey,
            { ...value },
          ]),
        ),
      },
      patternHistory: current.patternHistory.slice(1),
      appliedPatternSource: history.previousSource,
      appliedPatternId: history.previousPatternId,
    },
  };
}

export function isExternalPatternApplicationDataIsolated(
  before: AppData,
  after: AppData,
): boolean {
  return (
    Object.is(before.shiftTypes, after.shiftTypes) &&
    Object.is(before.alarmOverrides, after.alarmOverrides) &&
    Object.is(before.dayExceptions, after.dayExceptions) &&
    Object.is(before.notes, after.notes) &&
    Object.is(before.settings, after.settings) &&
    Object.is(before.payrollSettings, after.payrollSettings)
  );
}

export function sourceForPatternEntry(entry: PatternVaultEntry): AppliedPatternSource {
  return entry.source;
}
