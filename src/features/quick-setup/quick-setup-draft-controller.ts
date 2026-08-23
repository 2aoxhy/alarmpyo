import AsyncStorage from '@react-native-async-storage/async-storage';

import type { QuickSetupDraftV1 } from './quick-setup-model';
import {
  clearQuickSetupDraft as clearStoredQuickSetupDraft,
  hasQuickSetupDraft as hasStoredQuickSetupDraft,
  readQuickSetupDraft as readStoredQuickSetupDraft,
  type QuickSetupDraftStorage,
  writeQuickSetupDraft as writeStoredQuickSetupDraft,
} from './quick-setup-draft-repository';

export type QuickSetupDraftSession = {
  /** 저장된 초안을 읽기 전에는 write를 받지 않습니다. */
  hydrate(): Promise<QuickSetupDraftV1 | null>;
  /** 완료가 시작됐거나 hydration 전이면 false를 반환합니다. */
  write(draft: QuickSetupDraftV1): Promise<boolean>;
  /** 먼저 접수된 write를 모두 마친 뒤 마지막으로 초안을 지웁니다. */
  complete(): Promise<void>;
};

export type QuickSetupDraftController = {
  createSession(): QuickSetupDraftSession;
  clear(): Promise<void>;
  hasDraft(): Promise<boolean>;
};

/**
 * 화면 수명과 저장소 수명을 분리한 순수 controller입니다.
 *
 * 모든 저장 작업은 하나의 queue를 공유합니다. 새 화면이 열리면 이전 화면의 늦은
 * write를 무효화하고, 완료는 이미 접수된 write 뒤에 clear를 배치한 뒤 이후 write를
 * 거절합니다. 따라서 느린 AsyncStorage 응답이 완료된 초안을 되살릴 수 없습니다.
 */
export function createQuickSetupDraftController(
  storage: QuickSetupDraftStorage,
): QuickSetupDraftController {
  let queue: Promise<void> = Promise.resolve();
  let generation = 0;

  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    createSession(): QuickSetupDraftSession {
      const sessionGeneration = ++generation;
      let hydrated = false;
      let closed = false;
      let hydration: Promise<QuickSetupDraftV1 | null> | null = null;
      let completion: Promise<void> | null = null;

      return {
        hydrate(): Promise<QuickSetupDraftV1 | null> {
          if (hydration) return hydration;
          hydration = enqueue(() => readStoredQuickSetupDraft(storage)).then(
            (saved) => {
              hydrated = true;
              return saved;
            },
            (error: unknown) => {
              hydrated = true;
              throw error;
            },
          );
          return hydration;
        },
        write(draft: QuickSetupDraftV1): Promise<boolean> {
          if (!hydrated || closed || sessionGeneration !== generation) {
            return Promise.resolve(false);
          }
          return enqueue(async () => {
            await writeStoredQuickSetupDraft(draft, storage);
            return true;
          });
        },
        complete(): Promise<void> {
          if (completion) return completion;
          closed = true;
          if (sessionGeneration === generation) generation += 1;
          completion = enqueue(() => clearStoredQuickSetupDraft(storage));
          return completion;
        },
      };
    },
    clear(): Promise<void> {
      generation += 1;
      return enqueue(() => clearStoredQuickSetupDraft(storage));
    },
    hasDraft(): Promise<boolean> {
      return enqueue(() => hasStoredQuickSetupDraft(storage));
    },
  };
}

/** 간편 설정 화면이 저장 구현을 직접 알지 않도록 하는 플랫폼 조합 경계입니다. */
export const quickSetupDraftController = createQuickSetupDraftController(AsyncStorage);
