import type { AppData } from '../../models/app-data';

export const selectPatternLibraryData = (store: { data: AppData }) => store.data;

export function arePatternLibraryDataEqual(a: AppData, b: AppData): boolean {
  return a.patternVault === b.patternVault && a.patternHistory === b.patternHistory &&
    a.pattern === b.pattern && a.appliedPatternId === b.appliedPatternId &&
    a.appliedPatternSource === b.appliedPatternSource;
}

export function arePatternPreviewDataEqual(a: AppData, b: AppData): boolean {
  return a.patternVault === b.patternVault && a.pattern === b.pattern &&
    a.shiftTypes === b.shiftTypes && a.overrides === b.overrides &&
    a.timeOverrides === b.timeOverrides && a.dayExceptions === b.dayExceptions;
}
