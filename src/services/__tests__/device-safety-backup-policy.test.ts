import { describe, expect, it } from 'vitest';

import type { AppData } from '@/models/app-data';

import {
  selectNewestDeviceSafetyBackup,
  type DeviceSafetyBackup,
} from '../device-safety-backup-policy';

const data = {} as AppData;
const backup = (
  source: DeviceSafetyBackup['source'],
  exportedAt: string | null,
): DeviceSafetyBackup => ({ data, source, exportedAt });

describe('기기 안전 백업 선택', () => {
  it('임시 파일을 포함해 가장 최근 정상 백업을 선택해요', () => {
    expect(
      selectNewestDeviceSafetyBackup([
        backup('latest', '2026-07-16T12:00:00.000Z'),
        backup('pending', '2026-07-17T12:00:00.000Z'),
        backup('previous', '2026-07-15T12:00:00.000Z'),
      ])?.source,
    ).toBe('pending');
  });

  it('시각이 같으면 쓰기 중이던 최신 후보를 우선해요', () => {
    expect(
      selectNewestDeviceSafetyBackup([
        backup('previous', null),
        backup('latest', null),
        backup('pending', null),
      ])?.source,
    ).toBe('pending');
  });

  it('기기 시각이 바뀌어도 쓰기 단계가 가장 최신인 후보를 선택해요', () => {
    expect(
      selectNewestDeviceSafetyBackup([
        backup('latest', '2026-07-17T12:00:00.000Z'),
        backup('pending', '2026-07-16T12:00:00.000Z'),
      ])?.source,
    ).toBe('pending');
  });

  it('정상 후보가 없으면 null을 반환해요', () => {
    expect(selectNewestDeviceSafetyBackup([null, null])).toBeNull();
  });
});
