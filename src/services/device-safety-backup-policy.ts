import type { AppData } from '../models/app-data';

export type DeviceSafetyBackup = {
  data: AppData;
  exportedAt: string | null;
  source: 'pending' | 'latest' | 'previous';
};

const BACKUP_SOURCE_PRIORITY: Record<DeviceSafetyBackup['source'], number> = {
  pending: 3,
  latest: 2,
  previous: 1,
};

export function selectNewestDeviceSafetyBackup(
  candidates: (DeviceSafetyBackup | null)[],
): DeviceSafetyBackup | null {
  return (
    candidates
      .filter((candidate): candidate is DeviceSafetyBackup => candidate !== null)
      .sort((left, right) => {
        return BACKUP_SOURCE_PRIORITY[right.source] - BACKUP_SOURCE_PRIORITY[left.source];
      })[0] ?? null
  );
}
