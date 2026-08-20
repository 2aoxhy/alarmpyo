import { describe, expect, it } from 'vitest';

import {
  createLatestStorageValueCoordinator as createFacadeLatestCoordinator,
  createSerializedMutationCoordinator as createFacadeMutationCoordinator,
  createSerializedStorageWriter as createFacadeWriter,
} from '../../../services/app-storage-service';
import {
  createLatestStorageValueCoordinator,
  createSerializedMutationCoordinator,
  createSerializedStorageWriter,
  type StorageAdapter,
} from '../serialized-storage';

describe('직렬 저장 facade 위임', () => {
  it('기존 서비스 export는 분리한 구현을 그대로 제공합니다', () => {
    expect(createFacadeWriter).toBe(createSerializedStorageWriter);
    expect(createFacadeMutationCoordinator).toBe(
      createSerializedMutationCoordinator,
    );
    expect(createFacadeLatestCoordinator).toBe(
      createLatestStorageValueCoordinator,
    );
  });

  it('실패한 쓰기 뒤에도 다음 쓰기와 remove 대체값 순서를 보존합니다', async () => {
    const writes: string[] = [];
    let failFirst = true;
    const storage: StorageAdapter = {
      getItem: async () => null,
      setItem: async (key, value) => {
        writes.push(`${key}:${value}`);
        if (failFirst) {
          failFirst = false;
          throw new Error('첫 쓰기 실패');
        }
      },
    };
    const writer = createSerializedStorageWriter(storage);

    await expect(writer.write('primary', 'A')).rejects.toThrow('첫 쓰기 실패');
    await expect(writer.write('primary', 'B')).resolves.toBeUndefined();
    await expect(writer.remove('pending')).resolves.toBeUndefined();

    expect(writes).toEqual(['primary:A', 'primary:B', 'pending:']);
  });

  it('실패한 mutation revision을 완료하고 다음 작업을 계속합니다', async () => {
    const coordinator = createSerializedMutationCoordinator();

    await expect(
      coordinator.run(async (revision) => {
        expect(revision).toBe(1);
        throw new Error('복구 트랜잭션 실패');
      }),
    ).rejects.toThrow('복구 트랜잭션 실패');
    await expect(
      coordinator.run(async (revision) => revision),
    ).resolves.toBe(2);

    expect(coordinator.getRequestedRevision()).toBe(2);
    expect(coordinator.getCompletedRevision()).toBe(2);
  });
});
