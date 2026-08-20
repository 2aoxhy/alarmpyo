import { describe, expect, it } from 'vitest';

import {
  createExistingWorkPatternDraft,
  createInitialWorkPatternDraft,
} from '../work-pattern-draft';
import { createWorkPatternEditorController } from '../work-pattern-editor-controller';
import { createDefaultAppData } from '../../../services/app-data-service';

describe('WorkPatternEditorController', () => {
  it('keeps initial and edit modes on the same draft rules without changing stored data', () => {
    const data = createDefaultAppData('2026-08-21');
    const initial = createInitialWorkPatternDraft({
      shiftTypes: data.shiftTypes,
      today: '2026-08-21',
    });
    const editing = createExistingWorkPatternDraft({ data, today: '2026-08-21' });
    const initialController = createWorkPatternEditorController('initial');
    const editController = createWorkPatternEditorController('edit');

    const selectedInitial = initialController.selectPreset(initial, 'two-team-two-shift');
    const selectedEdit = editController.selectPreset(editing, 'two-team-two-shift');

    expect(selectedInitial.mode).toBe('initial-setup');
    expect(selectedEdit.mode).toBe('existing-schedule');
    expect(selectedInitial.presetId).toBe(selectedEdit.presetId);
    expect(selectedInitial.sequence).toEqual(selectedEdit.sequence);
    expect(data.pattern).toEqual(createDefaultAppData('2026-08-21').pattern);
  });

  it('clears initial alarm intent on schedule edits but preserves edit-mode preference', () => {
    const data = createDefaultAppData('2026-08-21');
    const initial = {
      ...createInitialWorkPatternDraft({ shiftTypes: data.shiftTypes, today: '2026-08-21' }),
      alarmsWanted: true,
    };
    const editing = {
      ...createExistingWorkPatternDraft({ data, today: '2026-08-21' }),
      alarmsWanted: true,
    };

    expect(
      createWorkPatternEditorController('initial').changeTime(initial, 'day', 'start', '07:00')
        .alarmsWanted,
    ).toBe(false);
    expect(
      createWorkPatternEditorController('edit').changeTime(editing, 'day', 'start', '07:00')
        .alarmsWanted,
    ).toBe(true);
  });
});
