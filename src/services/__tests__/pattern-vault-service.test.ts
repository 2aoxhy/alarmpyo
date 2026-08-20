import { describe, expect, it, vi } from 'vitest';

import type {
  AppData,
  PatternShiftCode,
} from '../../models/app-data';
import {
  createDefaultAppData,
  canonicalizeAppData,
  parseAppDataJson,
  serializeAppData,
} from '../app-data-service';
import {
  buildPatternApplicationMutation,
  buildPatternRollbackMutation,
  deletePatternMutation,
  importValidatedPatternMutation,
  isExternalPatternApplicationDataIsolated,
  isPatternVaultEntryApplied,
  patternShiftCodeToShiftTypeId,
  previewPatternApplication,
  runPatternPersistenceTransaction,
  saveUserPatternMutation,
  shiftTypeIdToPatternShiftCode,
} from '../pattern-vault-service';
import type { ValidatedPatternDescriptor } from '../shift-pattern-schema';
import { resolveBaseShift } from '../pattern-engine';

const NOW = new Date('2026-08-20T03:00:00.000Z');
const EFFECTIVE_DATE = '2026-08-20';

function withUserPattern(
  data: AppData,
  overrides: Partial<{
    id: string;
    name: string;
    author: string | null;
    anchorDate: string;
    shiftCodes: PatternShiftCode[];
  }> = {},
): AppData {
  const saved = saveUserPatternMutation(
    data,
    {
      id: overrides.id ?? 'user-pattern',
      name: overrides.name ?? '사용자 패턴',
      author: overrides.author ?? null,
      anchorDate: overrides.anchorDate ?? '2026-08-01',
      shiftCodes: overrides.shiftCodes ?? ['NIGHT'],
    },
    NOW,
  );
  if (saved.status === 'failure') throw new Error(saved.reason);
  return saved.data;
}

function applyUserPattern(
  data: AppData,
  policy: Parameters<typeof buildPatternApplicationMutation>[1]['overridePolicy'],
  historyId = 'history-1',
) {
  return buildPatternApplicationMutation(
    data,
    {
      patternId: 'user-pattern',
      effectiveDate: EFFECTIVE_DATE,
      overridePolicy: policy,
    },
    NOW,
    historyId,
  );
}

function validatedDescriptor(
  overrides: Partial<ValidatedPatternDescriptor> = {},
): ValidatedPatternDescriptor {
  return {
    id: 'imported-pattern',
    source: 'user',
    name: '가져온 패턴',
    author: null,
    sourceVersion: 1,
    anchorDate: '2026-08-01',
    shiftCodes: ['DAY', 'OFF'],
    verification: {
      status: 'user-validated',
      algorithm: 'SHA256',
      keyId: null,
      contentSha256: 'a'.repeat(64),
    },
    ...overrides,
  } as ValidatedPatternDescriptor;
}

describe('pattern-vault-service', () => {
  it('외부 대문자 코드 6종을 안정적인 내부 ID와 왕복 변환합니다', () => {
    const pairs = [
      ['DAY', 'day'],
      ['EVENING', 'evening'],
      ['NIGHT', 'night'],
      ['OFF', 'off'],
      ['DAY_SUBSTITUTE', 'substitute-day'],
      ['NIGHT_SUBSTITUTE', 'substitute-night'],
    ] as const;
    for (const [code, id] of pairs) {
      expect(patternShiftCodeToShiftTypeId(code)).toBe(id);
      expect(shiftTypeIdToPatternShiftCode(id)).toBe(code);
    }
    expect(shiftTypeIdToPatternShiftCode('legacy-custom')).toBeNull();
  });

  it('사용자 패턴은 1~42일만 허용하고 공식 ID 선점을 차단합니다', () => {
    const data = createDefaultAppData(EFFECTIVE_DATE);
    expect(withUserPattern(data).patternVault).toHaveLength(1);
    expect(withUserPattern(data, { shiftCodes: Array(42).fill('DAY') }).patternVault[0].shiftCodes)
      .toHaveLength(42);
    expect(saveUserPatternMutation(data, {
      id: 'empty',
      name: '빈 패턴',
      anchorDate: EFFECTIVE_DATE,
      shiftCodes: [],
    }, NOW)).toEqual({ status: 'failure', reason: 'invalid-pattern' });
    expect(saveUserPatternMutation(data, {
      id: 'too-long',
      name: '긴 패턴',
      anchorDate: EFFECTIVE_DATE,
      shiftCodes: Array(43).fill('DAY') as PatternShiftCode[],
    }, NOW)).toEqual({ status: 'failure', reason: 'invalid-pattern' });
    expect(saveUserPatternMutation(data, {
      id: 'humantss_a',
      name: '공식 ID 선점',
      anchorDate: EFFECTIVE_DATE,
      shiftCodes: ['DAY'],
    }, NOW)).toEqual({ status: 'failure', reason: 'invalid-pattern' });
    expect(saveUserPatternMutation(data, {
      id: 'long-name',
      name: '가'.repeat(81),
      anchorDate: EFFECTIVE_DATE,
      shiftCodes: ['DAY'],
    }, NOW)).toEqual({ status: 'failure', reason: 'invalid-pattern' });
  });

  it('같은 ID의 보관본 내용이 바뀌면 현재 적용 상태로 오인하지 않습니다', () => {
    const data = withUserPattern(createDefaultAppData(EFFECTIVE_DATE), {
      name: '사용 중 패턴',
      shiftCodes: ['DAY', 'OFF'],
    });
    const applied = buildPatternApplicationMutation(
      data,
      {
        patternId: 'user-pattern',
        effectiveDate: EFFECTIVE_DATE,
        overridePolicy: { mode: 'preserve' },
      },
      NOW,
      'active-history',
    );
    expect(applied.status).toBe('ready');
    if (applied.status !== 'ready') return;
    expect(isPatternVaultEntryApplied(applied.data, applied.data.patternVault[0])).toBe(true);

    const updated = saveUserPatternMutation(
      applied.data,
      {
        id: 'user-pattern',
        name: '사용 중 패턴',
        anchorDate: '2026-08-01',
        shiftCodes: ['NIGHT', 'OFF'],
      },
      new Date('2026-08-20T04:00:00.000Z'),
    );
    expect(updated.status).toBe('saved');
    if (updated.status !== 'saved') return;
    expect(isPatternVaultEntryApplied(updated.data, updated.data.patternVault[0])).toBe(false);
    expect(updated.data.pattern.shiftTypeIds).toEqual(['day', 'off']);
  });

  it('preset 표시명 정규화 뒤에도 활성 상태와 되돌리기 계약을 유지합니다', () => {
    const data = withUserPattern(createDefaultAppData(EFFECTIVE_DATE), {
      id: 'preset-sequence',
      name: '회사 패턴 이름',
      shiftCodes: ['DAY', 'DAY', 'NIGHT', 'NIGHT', 'OFF', 'OFF'],
    });
    const applied = buildPatternApplicationMutation(
      data,
      {
        patternId: 'preset-sequence',
        effectiveDate: EFFECTIVE_DATE,
        overridePolicy: { mode: 'preserve' },
      },
      NOW,
      'preset-history',
    );
    expect(applied.status).toBe('ready');
    if (applied.status !== 'ready') return;
    const persisted = canonicalizeAppData(applied.data);
    const entry = persisted.patternVault.find((item) => item.id === 'preset-sequence')!;
    expect(persisted.pattern.name).not.toBe(entry.name);
    expect(isPatternVaultEntryApplied(persisted, entry)).toBe(true);
    expect(buildPatternRollbackMutation(persisted).status).toBe('ready');
  });

  it('V12 허용 코드 6종과 휴무-only 패턴을 실제 AppData로 저장합니다', () => {
    const sixCodes = withUserPattern(createDefaultAppData(EFFECTIVE_DATE), {
      shiftCodes: [
        'DAY',
        'EVENING',
        'NIGHT',
        'OFF',
        'DAY_SUBSTITUTE',
        'NIGHT_SUBSTITUTE',
      ],
    });
    const sixApplied = applyUserPattern(sixCodes, { mode: 'preserve' });
    expect(sixApplied.status).toBe('ready');
    if (sixApplied.status !== 'ready') return;
    expect(canonicalizeAppData(sixApplied.data).pattern.shiftTypeIds).toEqual([
      'day',
      'evening',
      'night',
      'off',
      'substitute-day',
      'substitute-night',
    ]);

    const allOff = withUserPattern(createDefaultAppData(EFFECTIVE_DATE), {
      shiftCodes: ['OFF'],
    });
    const offApplied = applyUserPattern(allOff, { mode: 'preserve' }, 'all-off-history');
    expect(offApplied.status).toBe('ready');
    if (offApplied.status !== 'ready') return;
    expect(canonicalizeAppData(offApplied.data).pattern.shiftTypeIds).toEqual(['off']);
  });

  it('주간 고정과 같은 배열도 보관 패턴에서는 기준일 회전으로 유지합니다', () => {
    const data = withUserPattern(createDefaultAppData(EFFECTIVE_DATE), {
      shiftCodes: ['DAY', 'DAY', 'DAY', 'DAY', 'DAY', 'OFF', 'OFF'],
    });
    const applied = applyUserPattern(data, { mode: 'preserve' }, 'weekday-shape-history');
    expect(applied.status).toBe('ready');
    if (applied.status !== 'ready') return;
    const persisted = canonicalizeAppData(applied.data);
    expect(persisted.pattern.kind).toBe('rotation');
    expect(resolveBaseShift(persisted, EFFECTIVE_DATE)?.id).toBe('off');
  });

  it('검증된 descriptor만 가져오고 80자 작성자 계약을 보존합니다', () => {
    const data = createDefaultAppData(EFFECTIVE_DATE);
    const imported = importValidatedPatternMutation(
      data,
      validatedDescriptor({ author: '작'.repeat(80) }),
      NOW,
    );
    expect(imported.status).toBe('saved');
    if (imported.status !== 'saved') return;
    expect(imported.data.patternVault[0]).toMatchObject({
      id: 'imported-pattern',
      source: 'imported',
      author: '작'.repeat(80),
    });

    const mismatched = validatedDescriptor({
      source: 'official',
      verification: {
        status: 'user-validated',
        algorithm: 'SHA256',
        keyId: null,
        contentSha256: 'b'.repeat(64),
      },
    });
    expect(importValidatedPatternMutation(data, mismatched, NOW)).toEqual({
      status: 'failure',
      reason: 'invalid-pattern',
    });
    expect(importValidatedPatternMutation(
      data,
      validatedDescriptor({ id: 'humantss_a' }),
      NOW,
    )).toEqual({ status: 'failure', reason: 'invalid-pattern' });

    const official = validatedDescriptor({
      id: 'humantss_a',
      source: 'official',
      name: '휴먼TSS A',
      author: '알람표',
      anchorDate: '2026-08-01',
      shiftCodes: ['NIGHT', 'NIGHT', 'OFF', 'OFF', 'DAY', 'DAY'],
      verification: {
        status: 'official-verified',
        algorithm: 'ECDSA_P256_SHA256',
        keyId: 'alarmpyo-official-patterns-v1',
        contentSha256: 'c'.repeat(64),
      },
    });
    const savedOfficial = importValidatedPatternMutation(data, official, NOW);
    expect(savedOfficial.status).toBe('saved');
    expect(importValidatedPatternMutation(data, {
      ...official,
      shiftCodes: ['DAY'],
    }, NOW)).toEqual({ status: 'failure', reason: 'invalid-pattern' });
  });

  it('향후 42일 비교는 예외 일정이 합성된 실제 EffectiveDay를 사용합니다', () => {
    const data = withUserPattern({
      ...createDefaultAppData(EFFECTIVE_DATE),
      dayExceptions: { [EFFECTIVE_DATE]: 'leave' },
    });
    const result = previewPatternApplication(data, {
      patternId: 'user-pattern',
      effectiveDate: EFFECTIVE_DATE,
      overridePolicy: { mode: 'preserve' },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.preview.rows).toHaveLength(42);
    expect(result.preview.horizonEndDate).toBe('2026-09-30');
    expect(result.preview.rows[0]).toMatchObject({
      changed: false,
      scheduledShiftChanged: true,
      currentShiftTypeId: 'exception-leave',
      nextShiftTypeId: 'exception-leave',
    });
  });

  it('전체 제거는 직접 근무와 날짜별 시간을 함께 기록하고 나머지 개인 자료를 보존합니다', () => {
    const outside = '2026-10-01';
    const source = withUserPattern({
      ...createDefaultAppData(EFFECTIVE_DATE),
      overrides: {
        [EFFECTIVE_DATE]: null,
        '2026-08-21': 'night',
        [outside]: 'day',
      },
      timeOverrides: {
        '2026-08-21': {
          shiftTypeId: 'night',
          startMinutes: 20 * 60,
          endMinutes: 6 * 60,
          endsNextDay: true,
        },
        '2026-08-22': {
          shiftTypeId: 'night',
          startMinutes: 21 * 60,
          endMinutes: 5 * 60,
          endsNextDay: true,
        },
        [outside]: {
          shiftTypeId: 'day',
          startMinutes: 8 * 60,
          endMinutes: 17 * 60,
          endsNextDay: false,
        },
      },
      notes: { [EFFECTIVE_DATE]: '보존할 메모' },
      dayExceptions: { '2026-08-21': 'training' },
      alarmOverrides: { '2026-08-22': { mode: 'disabled' } },
    });
    const result = applyUserPattern(source, { mode: 'clear-all' });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect(result.preview.clearedOverrideDateKeys).toEqual([
      EFFECTIVE_DATE,
      '2026-08-21',
      '2026-08-22',
    ]);
    expect(result.data.overrides).toEqual({ [outside]: 'day' });
    expect(result.data.timeOverrides).toEqual({
      [outside]: source.timeOverrides[outside],
    });
    expect(result.history.clearedOverrides).toEqual({
      [EFFECTIVE_DATE]: null,
      '2026-08-21': 'night',
    });
    expect(result.history.clearedTimeOverrides).toEqual({
      '2026-08-21': source.timeOverrides['2026-08-21'],
      '2026-08-22': source.timeOverrides['2026-08-22'],
    });
    expect(isExternalPatternApplicationDataIsolated(source, result.data)).toBe(true);
    expect(result.data.notes).toBe(source.notes);
    expect(result.data.dayExceptions).toBe(source.dayExceptions);
    expect(result.data.alarmOverrides).toBe(source.alarmOverrides);
    expect(result.data.shiftTypes).toBe(source.shiftTypes);
    expect(result.data.settings).toBe(source.settings);
  });

  it('날짜별 선택은 선택한 직접 수정만 제거합니다', () => {
    const source = withUserPattern({
      ...createDefaultAppData(EFFECTIVE_DATE),
      overrides: {
        [EFFECTIVE_DATE]: 'off',
        '2026-08-21': 'day',
      },
    });
    const result = applyUserPattern(source, {
      mode: 'selective',
      dateKeys: ['2026-08-21'],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data.overrides).toEqual({ [EFFECTIVE_DATE]: 'off' });
    expect(result.history.clearedOverrides).toEqual({ '2026-08-21': 'day' });
  });

  it('되돌리기는 null·기존 직접 근무와 시간 원본을 정확히 복원합니다', () => {
    const source = withUserPattern({
      ...createDefaultAppData(EFFECTIVE_DATE),
      overrides: {
        [EFFECTIVE_DATE]: null,
        '2026-08-21': 'night',
      },
      timeOverrides: {
        '2026-08-21': {
          shiftTypeId: 'night',
          startMinutes: 20 * 60,
          endMinutes: 6 * 60,
          endsNextDay: true,
        },
      },
    });
    const applied = applyUserPattern(source, { mode: 'clear-all' });
    expect(applied.status).toBe('ready');
    if (applied.status !== 'ready') return;
    const rolledBack = buildPatternRollbackMutation(applied.data);
    expect(rolledBack.status).toBe('ready');
    if (rolledBack.status !== 'ready') return;
    expect(rolledBack.data.pattern).toEqual(source.pattern);
    expect(rolledBack.data.overrides).toEqual(source.overrides);
    expect(rolledBack.data.timeOverrides).toEqual(source.timeOverrides);
    expect(rolledBack.data.appliedPatternSource).toBe('legacy');
    expect(rolledBack.data.appliedPatternId).toBeNull();
    expect(rolledBack.data.patternHistory).toEqual([]);
  });

  it('적용 뒤 같은 날짜를 다시 직접 수정하면 되돌리기로 덮어쓰지 않습니다', () => {
    const source = withUserPattern({
      ...createDefaultAppData(EFFECTIVE_DATE),
      overrides: { [EFFECTIVE_DATE]: null },
      timeOverrides: {
        '2026-08-21': {
          shiftTypeId: 'day',
          startMinutes: 8 * 60,
          endMinutes: 17 * 60,
          endsNextDay: false,
        },
      },
    });
    const applied = applyUserPattern(source, { mode: 'clear-all' });
    expect(applied.status).toBe('ready');
    if (applied.status !== 'ready') return;

    expect(buildPatternRollbackMutation({
      ...applied.data,
      overrides: { ...applied.data.overrides, [EFFECTIVE_DATE]: null },
    })).toEqual({ status: 'failure', reason: 'history-conflict' });
    expect(buildPatternRollbackMutation({
      ...applied.data,
      timeOverrides: {
        ...applied.data.timeOverrides,
        '2026-08-21': { ...source.timeOverrides['2026-08-21'] },
      },
    })).toEqual({ status: 'failure', reason: 'history-conflict' });
    expect(buildPatternRollbackMutation({
      ...applied.data,
      timeOverrides: {
        ...applied.data.timeOverrides,
        [EFFECTIVE_DATE]: {
          shiftTypeId: 'night',
          startMinutes: 22 * 60,
          endMinutes: 6 * 60,
          endsNextDay: true,
        },
      },
    })).toEqual({ status: 'failure', reason: 'history-conflict' });
  });

  it('적용 이력은 최신 10건만 유지하고 참조 중인 패턴 삭제를 차단합니다', () => {
    let data = withUserPattern(createDefaultAppData(EFFECTIVE_DATE));
    for (let index = 0; index < 11; index += 1) {
      const result = applyUserPattern(data, { mode: 'preserve' }, `history-${index}`);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      data = result.data;
    }
    expect(data.patternHistory.map((entry) => entry.id)).toEqual([
      'history-10',
      'history-9',
      'history-8',
      'history-7',
      'history-6',
      'history-5',
      'history-4',
      'history-3',
      'history-2',
      'history-1',
    ]);
    expect(deletePatternMutation(data, 'user-pattern')).toEqual({
      status: 'failure',
      reason: 'pattern-in-use',
    });
  });

  it('최근 이력의 이전 패턴 참조도 삭제하지 않고 되돌릴 수 있습니다', () => {
    let data = withUserPattern(createDefaultAppData(EFFECTIVE_DATE), {
      id: 'pattern-a',
      name: '패턴 A',
      shiftCodes: ['DAY'],
    });
    data = withUserPattern(data, {
      id: 'pattern-b',
      name: '패턴 B',
      shiftCodes: ['NIGHT'],
    });
    const first = buildPatternApplicationMutation(data, {
      patternId: 'pattern-a',
      effectiveDate: EFFECTIVE_DATE,
      overridePolicy: { mode: 'preserve' },
    }, NOW, 'apply-a');
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    const second = buildPatternApplicationMutation(first.data, {
      patternId: 'pattern-b',
      effectiveDate: EFFECTIVE_DATE,
      overridePolicy: { mode: 'preserve' },
    }, new Date(NOW.getTime() + 1_000), 'apply-b');
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') return;

    expect(second.data.appliedPatternId).toBe('pattern-b');
    expect(deletePatternMutation(second.data, 'pattern-a')).toEqual({
      status: 'failure',
      reason: 'pattern-in-use',
    });
    const rollback = buildPatternRollbackMutation(second.data);
    expect(rollback.status).toBe('ready');
    if (rollback.status !== 'ready') return;
    expect(rollback.data.appliedPatternId).toBe('pattern-a');
    expect(rollback.data.pattern.name).toBe('패턴 A');
  });

  it('수동 패턴 변경 뒤에는 충돌한 이력을 되돌리지 않습니다', () => {
    const source = withUserPattern(createDefaultAppData(EFFECTIVE_DATE));
    const applied = applyUserPattern(source, { mode: 'preserve' });
    expect(applied.status).toBe('ready');
    if (applied.status !== 'ready') return;
    expect(buildPatternRollbackMutation({
      ...applied.data,
      pattern: { ...applied.data.pattern, name: '수동 변경' },
    })).toEqual({ status: 'failure', reason: 'history-conflict' });
  });

  it('v21 적용 이력의 복구 원본을 strict parser로 왕복 보존합니다', () => {
    const source = withUserPattern({
      ...createDefaultAppData(EFFECTIVE_DATE),
      overrides: { [EFFECTIVE_DATE]: null },
    });
    const applied = applyUserPattern(source, { mode: 'clear-all' });
    expect(applied.status).toBe('ready');
    if (applied.status !== 'ready') return;
    const parsed = parseAppDataJson(serializeAppData(applied.data)).data;
    expect(parsed.patternHistory).toEqual(applied.data.patternHistory);
    expect(parsed.appliedPatternId).toBe('user-pattern');

    const legacyV21 = JSON.parse(serializeAppData(createDefaultAppData(EFFECTIVE_DATE)));
    delete legacyV21.appliedPatternId;
    expect(parseAppDataJson(JSON.stringify(legacyV21)).data.appliedPatternId).toBeNull();

    const corrupted = JSON.parse(serializeAppData(applied.data));
    corrupted.patternHistory[0].overrideDateKeys = [];
    expect(() => parseAppDataJson(JSON.stringify(corrupted))).toThrow(
      '변경 원본이 날짜 목록과 맞지 않습니다.',
    );
  });

  it('AppData 백업에서도 공식 예약 ID와 출처 위조를 거부합니다', () => {
    const spoofed = JSON.parse(serializeAppData(createDefaultAppData(EFFECTIVE_DATE)));
    spoofed.patternVault = [{
      id: 'humantss_a',
      source: 'user',
      name: '위조 패턴',
      author: null,
      sourceVersion: 1,
      anchorDate: '2026-08-01',
      shiftCodes: ['DAY'],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }];
    expect(() => parseAppDataJson(JSON.stringify(spoofed))).toThrow(
      '공식 ID와 출처가 맞지 않습니다.',
    );

    spoofed.patternVault[0] = {
      ...spoofed.patternVault[0],
      source: 'official',
      name: '변조된 공식 패턴',
    };
    expect(() => parseAppDataJson(JSON.stringify(spoofed))).toThrow(
      '공식 패턴 계약이 올바르지 않습니다.',
    );
  });
});

describe('pattern persistence transaction', () => {
  const success = {
    primarySaved: true,
    operationSucceeded: true,
    partialFailure: false,
  };

  it('안전 백업 실패와 본문 저장 실패를 구분합니다', async () => {
    const persistCandidate = vi.fn(async () => success);
    await expect(runPatternPersistenceTransaction({
      createSafetyBackup: async () => { throw new Error('backup'); },
      persistCandidate,
      candidateSyncFailed: () => false,
      persistRollback: async () => success,
    })).resolves.toEqual({
      status: 'failure',
      reason: 'backup-failed',
      rolledBack: false,
    });
    expect(persistCandidate).not.toHaveBeenCalled();

    await expect(runPatternPersistenceTransaction({
      createSafetyBackup: async () => undefined,
      persistCandidate: async () => ({
        primarySaved: false,
        operationSucceeded: false,
        partialFailure: false,
      }),
      candidateSyncFailed: () => false,
      persistRollback: async () => success,
    })).resolves.toEqual({
      status: 'failure',
      reason: 'save-failed',
      rolledBack: false,
    });
  });

  it('알람 동기화 부분 실패 후 원상복구 성공을 구분합니다', async () => {
    await expect(runPatternPersistenceTransaction({
      createSafetyBackup: async () => undefined,
      persistCandidate: async () => ({ ...success, partialFailure: true }),
      candidateSyncFailed: () => true,
      persistRollback: async () => success,
    })).resolves.toEqual({
      status: 'failure',
      reason: 'sync-failed',
      rolledBack: true,
    });
  });

  it('복구 저장의 부분 실패를 별도 보고합니다', async () => {
    await expect(runPatternPersistenceTransaction({
      createSafetyBackup: async () => undefined,
      persistCandidate: async () => ({ ...success, partialFailure: true }),
      candidateSyncFailed: () => false,
      persistRollback: async () => ({ ...success, partialFailure: true }),
    })).resolves.toEqual({
      status: 'failure',
      reason: 'rollback-failed',
      rolledBack: true,
    });
  });
});
