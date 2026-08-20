import { useCallback, useEffect, useRef, useState } from 'react';

import type { PatternVaultEntry } from '../../models/app-data';
import { triggerNotificationFeedback } from '../feedback/feedback-controller';
import {
  fetchOfficialShiftPatternsOnDemand,
  type OfficialPatternFetchResult,
} from '../../services/official-shift-pattern-service';
import type { PatternVaultSaveResult } from '../../services/pattern-vault-service';
import {
  pickAndValidateShiftPatternFile,
  shareShiftPatternFile,
} from '../../services/shift-pattern-file-service';
import {
  serializeUserShiftPattern,
  ShiftPatternError,
  type ValidatedPatternDescriptor,
} from '../../services/shift-pattern-schema';

export type PatternLibraryRuntimeOperation =
  | 'file-import'
  | `official-save:${string}`
  | `share:${string}`;

export type PatternFileImportOutcome =
  | { status: 'cancelled' }
  | {
      status: 'completed';
      fileName: string;
      result: PatternVaultSaveResult;
    }
  | { status: 'error'; error: unknown };

export type PatternFileShareOutcome =
  | { status: 'completed'; fileName: string }
  | { status: 'error'; error: unknown };

export type UsePatternLibraryControllerOptions = {
  importValidatedPattern(
    descriptor: ValidatedPatternDescriptor,
  ): Promise<PatternVaultSaveResult>;
};

export function isPatternIntegrityError(error: unknown): boolean {
  return (
    error instanceof ShiftPatternError &&
    [
      'invalid-hash',
      'invalid-signature',
      'unknown-key',
      'official-contract-mismatch',
      'reserved-official-id',
    ].includes(error.code)
  );
}

export function patternImportErrorCopy(error: unknown): {
  title: string;
  message: string;
} {
  if (error instanceof ShiftPatternError) {
    if (isPatternIntegrityError(error)) {
      return {
        title: '패턴 안전성을 확인하지 못했습니다',
        message: `${error.message} 공식 패턴을 사용자 패턴으로 바꾸어 열지 않았습니다.`,
      };
    }
    return { title: '패턴 파일을 가져오지 못했습니다', message: error.message };
  }
  return {
    title: '패턴 파일을 가져오지 못했습니다',
    message: '파일을 확인한 뒤 다시 시도해야 합니다.',
  };
}

/**
 * Owns official-pattern networking, file pick/share, abort lifecycle, and
 * native feedback. The route remains a presentation and dialog boundary.
 */
export function usePatternLibraryController({
  importValidatedPattern,
}: UsePatternLibraryControllerOptions) {
  const [busyOperation, setBusyOperation] =
    useState<PatternLibraryRuntimeOperation | null>(null);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialResults, setOfficialResults] =
    useState<OfficialPatternFetchResult[] | null>(null);
  const initialFetchStarted = useRef(false);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const deferredAbortRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenActiveRef = useRef(false);

  const refreshOfficialPatterns = useCallback(
    async (source: 'entry' | 'manual') => {
      if (fetchControllerRef.current) return;
      const controller = new AbortController();
      fetchControllerRef.current = controller;
      setOfficialLoading(true);
      try {
        const results = await fetchOfficialShiftPatternsOnDemand({
          signal: controller.signal,
        });
        if (screenActiveRef.current) setOfficialResults(results);
        if (source === 'manual' && screenActiveRef.current) {
          const successCount = results.filter(
            (result) => result.status === 'ready',
          ).length;
          void triggerNotificationFeedback(
            successCount === results.length ? 'success' : 'warning',
          );
        }
      } finally {
        if (fetchControllerRef.current === controller) {
          fetchControllerRef.current = null;
        }
        if (screenActiveRef.current) setOfficialLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    screenActiveRef.current = true;
    if (deferredAbortRef.current) {
      clearTimeout(deferredAbortRef.current);
      deferredAbortRef.current = null;
    }
    if (!initialFetchStarted.current) {
      initialFetchStarted.current = true;
      void refreshOfficialPatterns('entry');
    }
    return () => {
      screenActiveRef.current = false;
      deferredAbortRef.current = setTimeout(() => {
        fetchControllerRef.current?.abort();
        fetchControllerRef.current = null;
      }, 0);
    };
  }, [refreshOfficialPatterns]);

  const saveOfficialPattern = useCallback(
    async (
      descriptor: ValidatedPatternDescriptor,
    ): Promise<PatternVaultSaveResult | null> => {
      if (busyOperation) return null;
      const operation: PatternLibraryRuntimeOperation =
        `official-save:${descriptor.id}`;
      setBusyOperation(operation);
      try {
        const result = await importValidatedPattern(descriptor);
        if (result.status === 'saved' || result.status === 'unchanged') {
          void triggerNotificationFeedback('success');
        }
        return result;
      } finally {
        setBusyOperation(null);
      }
    },
    [busyOperation, importValidatedPattern],
  );

  const importPatternFile = useCallback(async (): Promise<PatternFileImportOutcome> => {
    if (busyOperation) return { status: 'cancelled' };
    setBusyOperation('file-import');
    try {
      const picked = await pickAndValidateShiftPatternFile();
      if (!picked) return { status: 'cancelled' };
      const result = await importValidatedPattern(picked.pattern);
      if (result.status === 'saved' || result.status === 'unchanged') {
        void triggerNotificationFeedback('success');
      }
      return { status: 'completed', fileName: picked.fileName, result };
    } catch (error) {
      return { status: 'error', error };
    } finally {
      setBusyOperation(null);
    }
  }, [busyOperation, importValidatedPattern]);

  const sharePattern = useCallback(async (
    entry: PatternVaultEntry,
  ): Promise<PatternFileShareOutcome> => {
    if (busyOperation) return { status: 'error', error: new Error('busy') };
    const operation: PatternLibraryRuntimeOperation = `share:${entry.id}`;
    setBusyOperation(operation);
    try {
      const contents = serializeUserShiftPattern({
        id: entry.id,
        name: entry.name,
        author: entry.author,
        sourceVersion: entry.sourceVersion,
        anchorDate: entry.anchorDate,
        shiftCodes: [...entry.shiftCodes],
        createdAt: entry.createdAt,
      });
      const result = await shareShiftPatternFile(contents);
      return { status: 'completed', fileName: result.fileName };
    } catch (error) {
      return { status: 'error', error };
    } finally {
      setBusyOperation(null);
    }
  }, [busyOperation]);

  const notifySuccess = useCallback(
    () => triggerNotificationFeedback('success'),
    [],
  );

  return {
    busyOperation,
    importPatternFile,
    notifySuccess,
    officialLoading,
    officialResults,
    refreshOfficialPatterns,
    saveOfficialPattern,
    sharePattern,
  };
}

export type { OfficialPatternFetchResult, ValidatedPatternDescriptor };
