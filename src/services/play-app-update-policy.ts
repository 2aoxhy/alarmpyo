export type PlayUpdateInstallStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'canceled';

export type PlayUpdateState =
  | 'unsupported'
  | 'idle'
  | 'available'
  | 'in-progress'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'canceled';

export type PlayUpdateStatus = {
  availableVersionCode: number;
  bytesDownloaded: number;
  errorCode: number;
  flexibleAllowed: boolean;
  installStatus: PlayUpdateInstallStatus;
  state: PlayUpdateState;
  supported: boolean;
  totalBytesToDownload: number;
  updateAvailable: boolean;
};

const INSTALL_STATUSES = new Set<PlayUpdateInstallStatus>([
  'unknown',
  'pending',
  'downloading',
  'downloaded',
  'installing',
  'installed',
  'failed',
  'canceled',
]);
const UPDATE_STATES = new Set<PlayUpdateState>([
  'unsupported',
  'idle',
  'available',
  'in-progress',
  'downloaded',
  'installing',
  'installed',
  'failed',
  'canceled',
]);

export const UNSUPPORTED_PLAY_UPDATE_STATUS: Readonly<PlayUpdateStatus> = {
  availableVersionCode: 0,
  bytesDownloaded: 0,
  errorCode: 0,
  flexibleAllowed: false,
  installStatus: 'unknown',
  state: 'unsupported',
  supported: false,
  totalBytesToDownload: 0,
  updateAvailable: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export function normalizePlayUpdateStatus(value: unknown): PlayUpdateStatus {
  if (!isRecord(value) || value.supported !== true) {
    return { ...UNSUPPORTED_PLAY_UPDATE_STATUS };
  }
  return {
    availableVersionCode: nonNegativeInteger(value.availableVersionCode),
    bytesDownloaded: nonNegativeInteger(value.bytesDownloaded),
    errorCode:
      typeof value.errorCode === 'number' && Number.isSafeInteger(value.errorCode)
        ? value.errorCode
        : 0,
    flexibleAllowed: value.flexibleAllowed === true,
    installStatus: INSTALL_STATUSES.has(value.installStatus as PlayUpdateInstallStatus)
      ? (value.installStatus as PlayUpdateInstallStatus)
      : 'unknown',
    state: UPDATE_STATES.has(value.state as PlayUpdateState)
      ? (value.state as PlayUpdateState)
      : 'failed',
    supported: true,
    totalBytesToDownload: nonNegativeInteger(value.totalBytesToDownload),
    updateAvailable: value.updateAvailable === true,
  };
}

export function normalizeStartedPlayUpdateStatus(value: unknown): PlayUpdateStatus {
  const result = isRecord(value) ? value : {};
  const status = normalizePlayUpdateStatus(result.status);
  if (result.started !== true || status.state !== 'available') return status;
  return {
    ...status,
    installStatus:
      status.installStatus === 'unknown' ? 'pending' : status.installStatus,
    state: 'in-progress',
  };
}

export function getPlayUpdateProgress(status: PlayUpdateStatus): number | null {
  if (status.totalBytesToDownload <= 0) return null;
  return Math.min(
    100,
    Math.max(
      0,
      Math.round((status.bytesDownloaded / status.totalBytesToDownload) * 100),
    ),
  );
}

export function canDismissPlayUpdate(status: PlayUpdateStatus): boolean {
  return status.state === 'available' || status.state === 'failed';
}

export function shouldPollPlayUpdate(status: PlayUpdateStatus): boolean {
  return (
    status.state === 'in-progress' ||
    status.state === 'installing' ||
    status.installStatus === 'pending' ||
    status.installStatus === 'downloading' ||
    status.installStatus === 'installing'
  );
}

export function shouldShowPlayUpdate(
  status: PlayUpdateStatus,
  dismissedVersionCode: number | null,
): boolean {
  if (!status.supported || status.availableVersionCode <= 0) return false;
  if (
    status.state === 'in-progress' ||
    status.state === 'downloaded' ||
    status.state === 'installing'
  ) {
    return true;
  }
  return (
    status.updateAvailable &&
    status.availableVersionCode !== dismissedVersionCode
  );
}
