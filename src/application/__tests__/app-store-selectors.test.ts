import { describe, expect, it } from 'vitest';

import { createDefaultAppData } from '../../services/app-data-service';
import { selectNoteForDate, selectShiftForDate } from '../app-store-selectors';

describe('app-store-selectors', () => {
  it('저장된 메모와 날짜별 근무를 읽기 전용으로 선택해요', () => {
    const data = createDefaultAppData('2026-08-09');
    data.notes['2026-08-09'] = '첫 근무';

    expect(selectNoteForDate(data, '2026-08-09')).toBe('첫 근무');
    expect(selectNoteForDate(data, '2026-08-10')).toBe('');
    expect(selectShiftForDate(data, '2026-08-09')?.id).toBe('day');
  });
});
