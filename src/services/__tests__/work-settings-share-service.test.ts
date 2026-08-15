import { describe, expect, it, vi } from 'vitest';

import { DAY_SHIFT_START_MINUTES } from '../../constants/shift-schedule';
import {
  createDefaultAppData,
  parseAppDataJson,
  resolveShiftFromAppData,
  serializeAppData,
} from '../app-data-service';
import {
  applyWorkSettingsPreview,
  applyWorkSettingsTransaction,
  doesWorkSettingsPreviewApplyEvening,
  exportWorkSettingsToJson,
  LEGACY_WORK_SETTINGS_SHARE_FORMAT,
  MAX_WORK_SETTINGS_SHARE_BYTES,
  previewWorkSettingsImport,
  WORK_SETTINGS_SHARE_FORMAT,
  WORK_SETTINGS_SHARE_FORMAT_VERSION,
} from '../work-settings-share-service';

function exportedDocument(): Record<string, unknown> {
  return JSON.parse(
    exportWorkSettingsToJson(createDefaultAppData('2026-07-13')),
  ) as Record<string, unknown>;
}

function workSettingsOf(document: Record<string, unknown>): Record<string, unknown> {
  return document.workSettings as Record<string, unknown>;
}

function legacyDocument(formatVersion: 1 | 2 | 3 | 4 | 5 | 6): Record<string, unknown> {
  const document = exportedDocument();
  document.format = LEGACY_WORK_SETTINGS_SHARE_FORMAT;
  document.formatVersion = formatVersion;
  const workSettings = workSettingsOf(document);
  workSettings.shiftTypes = (workSettings.shiftTypes as Record<string, unknown>[])
    .filter((shift) => shift.id !== 'evening');
  return document;
}

describe('근무 설정 공유 파일', () => {
  it('개인 데이터 없이 근무 방식과 근무 시각만 내보냅니다', () => {
    const data = createDefaultAppData('2026-07-13');
    data.notes['2026-07-14'] = '외부에 나가면 안 되는 메모';
    data.overrides['2026-07-14'] = 'night';
    data.timeOverrides['2026-07-14'] = {
      shiftTypeId: 'night',
      startMinutes: 1,
      endMinutes: 2,
      endsNextDay: false,
    };
    data.dayExceptions['2026-07-15'] = 'leave';
    data.settings.themeMode = 'dark';
    data.settings.scheduledNotificationCount = 3;

    const raw = exportWorkSettingsToJson(data);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const workSettings = workSettingsOf(parsed);

    expect(Object.keys(parsed)).toEqual(['format', 'formatVersion', 'workSettings']);
    expect(parsed.format).toBe(WORK_SETTINGS_SHARE_FORMAT);
    expect(parsed.formatVersion).toBe(WORK_SETTINGS_SHARE_FORMAT_VERSION);
    expect(Object.keys(workSettings)).toEqual(['pattern', 'shiftTypes']);
    for (const forbidden of [
      '외부에 나가면 안 되는 메모',
      '"notes"',
      '"overrides"',
      '"timeOverrides"',
      '"dayExceptions"',
      '"settings"',
      '"activityPlans"',
      '"datedActivityPlans"',
      '"activityCatalog"',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('근무 방식과 오후를 포함한 여섯 가지 근무 설정을 미리 봅니다', () => {
    const preview = previewWorkSettingsImport(JSON.stringify(exportedDocument()));

    expect(preview.summary.patternName).toBe('3조 2교대 (주주야야휴휴)');
    expect(preview.summary.patternKind).toBe('rotation');
    expect(preview.summary.anchorDate).toBe('2026-07-13');
    expect(preview.summary.scheduleStartDate).toBe('2026-07-13');
    expect(preview.summary.day.startMinutes).toBe(DAY_SHIFT_START_MINUTES);
    expect(preview.summary.night.endsNextDay).toBe(true);
    expect(preview.document.workSettings.shiftTypes.map((shift) => shift.id)).toEqual([
      'day',
      'evening',
      'night',
      'substitute-day',
      'substitute-night',
      'off',
    ]);
  });

  it('v7 파일은 1~42일 사용자 순서와 사용자가 붙인 이름을 보존합니다', () => {
    const source = createDefaultAppData('2026-07-13');
    source.pattern = {
      ...source.pattern,
      name: '우리 회사 5일 순서',
      shiftTypeIds: ['day', 'evening', 'night', 'off', 'off'],
    };

    const preview = previewWorkSettingsImport(exportWorkSettingsToJson(source));

    expect(preview.sourceFormatVersion).toBe(7);
    expect(preview.summary.patternName).toBe('우리 회사 5일 순서');
    expect(preview.document.workSettings.pattern.shiftTypeIds).toEqual([
      'day',
      'evening',
      'night',
      'off',
      'off',
    ]);
  });

  it('exact weekday 사용자 순서는 공유·적용·재로드에서도 요일 기준으로 정규화해요', () => {
    const source = createDefaultAppData('2026-07-13');
    source.pattern = {
      name: '사용자 주간 순서',
      anchorDate: '2026-07-15',
      scheduleStartDate: '2026-07-18',
      shiftTypeIds: ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
    };

    const raw = exportWorkSettingsToJson(source);
    const exported = JSON.parse(raw) as {
      workSettings: { pattern: Record<string, unknown> };
    };
    const preview = previewWorkSettingsImport(raw);
    const applied = applyWorkSettingsPreview(
      createDefaultAppData('2026-07-01'),
      preview,
    );
    const reloaded = parseAppDataJson(serializeAppData(applied)).data;

    expect(exported.workSettings.pattern).toMatchObject({
      name: '주간 고정',
      anchorDate: '2026-07-13',
      scheduleStartDate: '2026-07-18',
    });
    expect(preview.summary.patternKind).toBe('weekday');
    expect(resolveShiftFromAppData(reloaded, '2026-07-18')?.id).toBe('off');
    expect(resolveShiftFromAppData(reloaded, '2026-07-20')?.id).toBe('day');
  });

  it('UTF-8 BOM이 붙은 파일도 읽습니다', () => {
    const raw = exportWorkSettingsToJson(createDefaultAppData('2026-07-13'));

    expect(previewWorkSettingsImport(`\uFEFF${raw}`).summary.patternName).toBe(
      '3조 2교대 (주주야야휴휴)',
    );
  });

  it('v1 파일은 기준 날짜를 첫 근무일로 보완합니다', () => {
    const legacy = legacyDocument(1);
    const pattern = workSettingsOf(legacy).pattern as Record<string, unknown>;
    delete pattern.scheduleStartDate;

    const preview = previewWorkSettingsImport(JSON.stringify(legacy));

    expect(preview.sourceFormatVersion).toBe(1);
    expect(preview.document.formatVersion).toBe(WORK_SETTINGS_SHARE_FORMAT_VERSION);
    expect(preview.summary.scheduleStartDate).toBe('2026-07-13');
  });

  it('v3~v5의 제거된 활동 자료가 손상돼도 핵심 설정을 복원합니다', () => {
    const v3 = legacyDocument(3);
    workSettingsOf(v3).workBreakPlans = '손상된 이전 휴게표';

    const v4 = legacyDocument(4);
    workSettingsOf(v4).activityPlans = { day: '손상', night: null };

    const v5 = legacyDocument(5);
    workSettingsOf(v5).activityPlans = 123;
    workSettingsOf(v5).datedActivityPlans = ['손상'];

    for (const legacy of [v3, v4, v5]) {
      const preview = previewWorkSettingsImport(JSON.stringify(legacy));
      expect(preview.summary.patternName).toBe('3조 2교대 (주주야야휴휴)');
      expect(Object.keys(preview.document.workSettings)).toEqual([
        'pattern',
        'shiftTypes',
      ]);
    }
  });

  it('V04가 현재 계보 ID로 내보낸 v6도 새 형식으로 정규화합니다', () => {
    const legacy = legacyDocument(6);
    legacy.format = WORK_SETTINGS_SHARE_FORMAT;

    const preview = previewWorkSettingsImport(JSON.stringify(legacy));

    expect(preview.sourceFormatVersion).toBe(6);
    expect(preview.document.format).toBe(WORK_SETTINGS_SHARE_FORMAT);
    expect(preview.summary.evening).toMatchObject({
      id: 'evening',
      startMinutes: 15 * 60,
      endMinutes: 23 * 60,
    });
    expect(doesWorkSettingsPreviewApplyEvening(preview)).toBe(false);
  });

  it('현재 계보 ID의 실제 v6 파일은 합성 오후 기본값을 현재 설정에 덮어쓰지 않아요', () => {
    const document = legacyDocument(6);
    document.format = WORK_SETTINGS_SHARE_FORMAT;
    const sharedDay = (workSettingsOf(document).shiftTypes as Record<string, unknown>[])
      .find((shift) => shift.id === 'day')!;
    sharedDay.startMinutes = 8 * 60;
    sharedDay.endMinutes = 18 * 60;

    const current = createDefaultAppData('2026-07-01');
    const currentEvening = current.shiftTypes.find((shift) => shift.id === 'evening')!;
    Object.assign(currentEvening, {
      startMinutes: 14 * 60 + 10,
      endMinutes: 22 * 60 + 20,
      endsNextDay: false,
      alarmEnabled: true,
      alarmMinutesBefore: 95,
    });

    const preview = previewWorkSettingsImport(JSON.stringify(document));
    const applied = applyWorkSettingsPreview(current, preview);

    expect(preview.sourceFormatVersion).toBe(6);
    expect(applied.shiftTypes.find((shift) => shift.id === 'evening')).toBe(
      currentEvening,
    );
    expect(applied.shiftTypes.find((shift) => shift.id === 'day')).toMatchObject({
      startMinutes: 8 * 60,
      endMinutes: 18 * 60,
    });
  });

  it('v7 파일이 명시한 오후 설정은 현재 오후 설정에 정상 적용해요', () => {
    const source = createDefaultAppData('2026-08-01');
    const sourceEvening = source.shiftTypes.find((shift) => shift.id === 'evening')!;
    Object.assign(sourceEvening, {
      startMinutes: 13 * 60 + 30,
      endMinutes: 21 * 60 + 45,
      endsNextDay: false,
      alarmEnabled: true,
      alarmMinutesBefore: 100,
    });
    const current = createDefaultAppData('2026-07-01');
    const currentEvening = current.shiftTypes.find((shift) => shift.id === 'evening')!;
    currentEvening.startMinutes = 16 * 60;
    currentEvening.endMinutes = 23 * 60 + 30;

    const preview = previewWorkSettingsImport(exportWorkSettingsToJson(source));
    const applied = applyWorkSettingsPreview(current, preview);

    expect(doesWorkSettingsPreviewApplyEvening(preview)).toBe(true);
    expect(applied.shiftTypes.find((shift) => shift.id === 'evening')).toMatchObject({
      startMinutes: 13 * 60 + 30,
      endMinutes: 21 * 60 + 45,
      endsNextDay: false,
      alarmEnabled: true,
      alarmMinutesBefore: 100,
    });
  });

  it('새 계보 형식에 과거 버전을 섞은 파일은 거부합니다', () => {
    const mixedLineage = exportedDocument();
    mixedLineage.formatVersion = 5;

    expect(() =>
      previewWorkSettingsImport(JSON.stringify(mixedLineage)),
    ).toThrow('지원하지 않는 근무 설정 파일 버전');
  });

  it('v6 이하 파일에는 당시 지원한 3조 2교대와 주간 고정만 허용해요', () => {
    const legacy = legacyDocument(6);
    const pattern = workSettingsOf(legacy).pattern as Record<string, unknown>;
    pattern.name = '2조 2교대 (주야)';
    pattern.shiftTypeIds = ['day', 'night'];

    expect(() => previewWorkSettingsImport(JSON.stringify(legacy))).toThrow(
      '지원하는 근무 방식이 아닙니다',
    );
  });

  it('적용할 때 개인 일정과 휴대폰 설정을 유지합니다', () => {
    const current = createDefaultAppData('2026-07-01');
    current.notes['2026-07-14'] = '개인 메모';
    current.overrides['2026-07-14'] = 'night';
    current.timeOverrides['2026-07-14'] = {
      shiftTypeId: 'night',
      startMinutes: 20 * 60,
      endMinutes: 8 * 60,
      endsNextDay: true,
    };
    current.dayExceptions['2026-07-15'] = 'training';
    current.settings.themeMode = 'dark';
    current.settings.notificationsEnabled = true;

    const source = createDefaultAppData('2026-08-01');
    source.pattern.name = '주간 고정';
    source.pattern.shiftTypeIds = ['day', 'day', 'day', 'day', 'day', 'off', 'off'];
    const day = source.shiftTypes.find((shift) => shift.id === 'day')!;
    day.startMinutes = 6 * 60;
    day.endMinutes = 17 * 60;
    day.alarmMinutesBefore = 90;

    const applied = applyWorkSettingsPreview(
      current,
      previewWorkSettingsImport(exportWorkSettingsToJson(source)),
    );

    expect(applied.pattern).toEqual({
      ...source.pattern,
      // 주간 고정은 적용일이 속한 주의 월요일로 canonicalize해요.
      anchorDate: '2026-07-27',
    });
    expect(applied.shiftTypes.find((shift) => shift.id === 'day')).toMatchObject({
      startMinutes: 6 * 60,
      endMinutes: 17 * 60,
      alarmMinutesBefore: 90,
    });
    expect(applied.notes).toEqual(current.notes);
    expect(applied.overrides).toEqual(current.overrides);
    expect(applied.timeOverrides).toEqual(current.timeOverrides);
    expect(applied.dayExceptions).toEqual(current.dayExceptions);
    expect(applied.settings).toEqual(current.settings);
  });

  it('현재 형식에 허용되지 않는 항목이 있으면 거부합니다', () => {
    const document = exportedDocument();
    workSettingsOf(document).notes = { '2026-07-13': '숨은 메모' };

    expect(() => previewWorkSettingsImport(JSON.stringify(document))).toThrow(
      '허용되지 않는 항목',
    );
  });

  it('중첩 근무 설정의 추가 항목도 거부합니다', () => {
    const document = exportedDocument();
    const shifts = workSettingsOf(document).shiftTypes as Record<string, unknown>[];
    shifts[0].color = '#000000';

    expect(() => previewWorkSettingsImport(JSON.stringify(document))).toThrow(
      '허용되지 않는 항목',
    );
  });

  it('다른 형식과 지원하지 않는 버전을 거부합니다', () => {
    const wrongFormat = exportedDocument();
    wrongFormat.format = 'alarmpyo-backup';
    expect(() => previewWorkSettingsImport(JSON.stringify(wrongFormat))).toThrow(
      '알람표 근무 설정 파일이 아닙니다',
    );

    const wrongVersion = exportedDocument();
    wrongVersion.formatVersion = WORK_SETTINGS_SHARE_FORMAT_VERSION + 1;
    expect(() => previewWorkSettingsImport(JSON.stringify(wrongVersion))).toThrow(
      '지원하지 않는 근무 설정 파일 버전',
    );
  });

  it('지원하지 않는 반복 순서와 잘못된 시간을 거부합니다', () => {
    const wrongPattern = exportedDocument();
    const pattern = workSettingsOf(wrongPattern).pattern as Record<string, unknown>;
    pattern.shiftTypeIds = ['off'];
    expect(() => previewWorkSettingsImport(JSON.stringify(wrongPattern))).toThrow(
      '지원하는 근무 방식이 아닙니다',
    );

    const wrongTime = exportedDocument();
    const shifts = workSettingsOf(wrongTime).shiftTypes as Record<string, unknown>[];
    shifts[0].startMinutes = 1440;
    expect(() => previewWorkSettingsImport(JSON.stringify(wrongTime))).toThrow(
      '시작 시간 값이 올바르지 않습니다',
    );
  });

  it('이전 범위의 과도한 알람 선행 시간은 현재 기본값으로 보정합니다', () => {
    const legacyAlarmLead = exportedDocument();
    const shifts = workSettingsOf(legacyAlarmLead)
      .shiftTypes as Record<string, unknown>[];
    shifts[0].alarmMinutesBefore = 1440;

    expect(
      previewWorkSettingsImport(JSON.stringify(legacyAlarmLead)).summary.day
        .alarmMinutesBefore,
    ).toBe(110);

    shifts[0].alarmMinutesBefore = 7 * 24 * 60 + 1;
    expect(() => previewWorkSettingsImport(JSON.stringify(legacyAlarmLead))).toThrow(
      '알람 선행 시간 값이 올바르지 않습니다',
    );
  });

  it('256KB를 넘는 입력은 JSON 해석 전에 거부합니다', () => {
    const oversized = ' '.repeat(MAX_WORK_SETTINGS_SHARE_BYTES + 1);
    expect(() => previewWorkSettingsImport(oversized)).toThrow('256KB 이하여야 합니다');
  });

  it('적용 직전에 변조된 미리보기를 다시 검증합니다', () => {
    const current = createDefaultAppData('2026-07-13');
    const preview = previewWorkSettingsImport(JSON.stringify(exportedDocument()));
    (preview.document.workSettings as unknown as Record<string, unknown>).notes = {};

    expect(() => applyWorkSettingsPreview(current, preview)).toThrow(
      '허용되지 않는 항목',
    );
  });

  it('출발보다 늦은 기상 알람이 포함된 공유 설정은 적용하지 않아요', () => {
    const current = createDefaultAppData('2026-07-13');
    const source = createDefaultAppData('2026-08-01');
    const day = source.shiftTypes.find((shift) => shift.id === 'day')!;
    day.alarmMinutesBefore =
      current.settings.workRoutineProfiles.day.departMinutesBefore;
    const preview = previewWorkSettingsImport(
      exportWorkSettingsToJson(source),
    );

    expect(() => applyWorkSettingsPreview(current, preview)).toThrow(
      '기상 알람은 현재 출근 루틴의 출발 시각보다 빨라야 합니다',
    );
  });

  it('안전 백업을 마친 뒤에만 새 설정을 저장합니다', async () => {
    const current = createDefaultAppData('2026-07-13');
    const preview = previewWorkSettingsImport(JSON.stringify(exportedDocument()));
    const order: string[] = [];

    const result = await applyWorkSettingsTransaction({
      current,
      preview,
      createSafetyBackup: async () => {
        order.push('backup');
      },
      save: async () => {
        order.push('save');
        return true;
      },
    });

    expect(result).toEqual({ success: true });
    expect(order).toEqual(['backup', 'save']);
  });

  it('안전 백업에 실패하면 저장을 시작하지 않습니다', async () => {
    const current = createDefaultAppData('2026-07-13');
    const preview = previewWorkSettingsImport(JSON.stringify(exportedDocument()));
    const save = vi.fn(async () => true);

    const result = await applyWorkSettingsTransaction({
      current,
      preview,
      createSafetyBackup: async () => {
        throw new Error('저장 공간 부족');
      },
      save,
    });

    expect(result).toEqual({ success: false, reason: 'backup-failed' });
    expect(save).not.toHaveBeenCalled();
  });

  it('저장 전 안전 검사에서 거절하면 백업 세대를 회전하지 않아요', async () => {
    const current = createDefaultAppData('2026-07-13');
    const preview = previewWorkSettingsImport(JSON.stringify(exportedDocument()));
    const createSafetyBackup = vi.fn(async () => undefined);
    const save = vi.fn(async () => true);

    const result = await applyWorkSettingsTransaction({
      current,
      preview,
      createSafetyBackup,
      prepare: () => null,
      save,
    });

    expect(result).toEqual({ success: false, reason: 'save-failed' });
    expect(createSafetyBackup).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('저장 실패와 변조된 파일을 구분합니다', async () => {
    const current = createDefaultAppData('2026-07-13');
    const preview = previewWorkSettingsImport(JSON.stringify(exportedDocument()));
    const saveFailure = await applyWorkSettingsTransaction({
      current,
      preview,
      createSafetyBackup: async () => undefined,
      save: async () => false,
    });

    const tampered = previewWorkSettingsImport(JSON.stringify(exportedDocument()));
    (tampered.document.workSettings as unknown as Record<string, unknown>).notes = {};
    const createSafetyBackup = vi.fn(async () => undefined);
    const invalid = await applyWorkSettingsTransaction({
      current,
      preview: tampered,
      createSafetyBackup,
      save: async () => true,
    });

    expect(saveFailure).toEqual({ success: false, reason: 'save-failed' });
    expect(invalid).toEqual({ success: false, reason: 'invalid-file' });
    expect(createSafetyBackup).not.toHaveBeenCalled();
  });
});
