import {
  ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
  ENVIRONMENT_FRESH_CACHE_MS,
  ENVIRONMENT_LOCATION_TIMEOUT_MS,
  ENVIRONMENT_MANUAL_REFRESH_COOLDOWN_MS,
  ENVIRONMENT_STALE_CACHE_MS,
  type EnvironmentBriefingFailure,
  type EnvironmentBriefingPayload,
  type EnvironmentBriefingSnapshot,
  type EnvironmentBriefingStatus,
  type EnvironmentCacheEntry,
  type EnvironmentClock,
  type EnvironmentLocalRepository,
  type EnvironmentSettings,
  type EnvironmentBriefingGateway,
  type ForegroundLocationGateway,
  type ForegroundLocationPermission,
  type ManualEnvironmentRegion,
} from '../../application/environment/environment-types';
import {
  isSameKmaGrid,
  isValidKmaGrid,
  toKmaGrid,
} from '../../application/environment/kma-grid';

const INITIAL_SNAPSHOT: EnvironmentBriefingSnapshot = Object.freeze({
  status: 'permission-required',
  enabled: false,
  mode: null,
  regionName: null,
  payload: null,
  updatedAt: null,
  isRefreshing: false,
  permission: 'undetermined',
  failure: null,
  canRefresh: true,
});

export type EnvironmentBriefingControllerDependencies = Readonly<{
  repository: EnvironmentLocalRepository;
  gateway: EnvironmentBriefingGateway;
  location: ForegroundLocationGateway;
  clock: EnvironmentClock;
}>;

export type EnvironmentRefreshOptions = Readonly<{
  force?: boolean;
  manual?: boolean;
  reacquireLocation?: boolean;
}>;

export type EnvironmentBriefingController = Readonly<{
  getSnapshot(): EnvironmentBriefingSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  requestAutomaticLocation(): Promise<void>;
  selectManualRegion(region: ManualEnvironmentRegion): Promise<void>;
  refresh(options?: EnvironmentRefreshOptions): Promise<void>;
  disable(): Promise<void>;
  clearLocalData(): Promise<void>;
  dispose(): void;
}>;

function statusForPayload(
  payload: EnvironmentBriefingPayload,
): EnvironmentBriefingStatus {
  const weatherReady = payload.weather.status === 'ready';
  const airReady = payload.airQuality.status === 'ready';
  if (weatherReady && airReady) return 'ready';
  if (weatherReady || airReady) return 'partial';
  return 'unavailable';
}

function isUsableDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function getCacheAge(now: Date, entry: EnvironmentCacheEntry): number {
  const savedAt = Date.parse(entry.savedAt);
  return Number.isFinite(savedAt)
    ? Math.max(0, now.getTime() - savedAt)
    : Number.POSITIVE_INFINITY;
}

function mapGatewayFailure(error: unknown): EnvironmentBriefingFailure {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'not-configured') return 'not-configured';
    if (code === 'auth' || code === 'quota') {
      return 'provider-unavailable';
    }
  }
  return 'network';
}

function mapLocationFailure(error: unknown): EnvironmentBriefingFailure {
  void error;
  return 'location-unavailable';
}

export function createEnvironmentBriefingController(
  dependencies: EnvironmentBriefingControllerDependencies,
): EnvironmentBriefingController {
  let snapshot = INITIAL_SNAPSHOT;
  let settings: EnvironmentSettings | null = null;
  let cache: EnvironmentCacheEntry | null = null;
  let initializeWork: Promise<void> | null = null;
  let refreshWork: Promise<void> | null = null;
  let lastManualRefreshAt = Number.NEGATIVE_INFINITY;
  let refreshCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const emit = (next: EnvironmentBriefingSnapshot) => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  const patchSnapshot = (patch: Partial<EnvironmentBriefingSnapshot>) => {
    emit({ ...snapshot, ...patch });
  };

  const setPermissionRequired = (
    permission: ForegroundLocationPermission,
    failure: EnvironmentBriefingFailure | null,
  ) => {
    patchSnapshot({
      status: 'permission-required',
      enabled: settings !== null,
      mode: settings?.mode ?? null,
      regionName: settings?.regionName ?? null,
      payload: null,
      updatedAt: null,
      isRefreshing: false,
      permission,
      failure,
    });
  };

  const displayCache = (
    entry: EnvironmentCacheEntry,
    stale: boolean,
    failure: EnvironmentBriefingFailure | null = null,
  ) => {
    patchSnapshot({
      status: stale ? 'stale' : statusForPayload(entry.payload),
      enabled: true,
      mode: settings?.mode ?? null,
      regionName: entry.regionName,
      payload: entry.payload,
      updatedAt: entry.savedAt,
      isRefreshing: false,
      failure,
    });
  };

  const scheduleManualRefreshUnlock = () => {
    if (refreshCooldownTimer) clearTimeout(refreshCooldownTimer);
    refreshCooldownTimer = setTimeout(() => {
      refreshCooldownTimer = null;
      patchSnapshot({ canRefresh: true });
    }, ENVIRONMENT_MANUAL_REFRESH_COOLDOWN_MS);
  };

  const loadForSettings = async (nextSettings: EnvironmentSettings) => {
    const now = dependencies.clock.now();
    if (!isUsableDate(now)) throw new RangeError('Invalid environment clock.');
    const matchingCache =
      cache && isSameKmaGrid(cache.grid, nextSettings.grid) ? cache : null;
    if (matchingCache) {
      const age = getCacheAge(now, matchingCache);
      if (age <= ENVIRONMENT_FRESH_CACHE_MS) {
        displayCache(matchingCache, false);
        return;
      }
      if (age <= ENVIRONMENT_STALE_CACHE_MS) {
        displayCache(matchingCache, true);
      }
    }
    await refresh({ force: true, manual: false, reacquireLocation: true });
  };

  const initialize = async () => {
    if (initializeWork) return initializeWork;
    initializeWork = (async () => {
      const [storedSettings, storedCache] = await Promise.all([
        dependencies.repository.readSettings(),
        dependencies.repository.readCache(),
      ]);
      settings = storedSettings;
      cache = storedCache;
      if (!settings) {
        emit(INITIAL_SNAPSHOT);
        return;
      }
      let permission: ForegroundLocationPermission = 'undetermined';
      if (settings.mode === 'automatic') {
        permission = await dependencies.location.getPermission();
      }
      patchSnapshot({
        enabled: true,
        mode: settings.mode,
        regionName: settings.regionName,
        permission,
      });
      const now = dependencies.clock.now();
      const matchingCache =
        cache && isSameKmaGrid(cache.grid, settings.grid) ? cache : null;
      if (
        settings.mode === 'automatic' &&
        permission !== 'granted' &&
        (!matchingCache || getCacheAge(now, matchingCache) > ENVIRONMENT_STALE_CACHE_MS)
      ) {
        setPermissionRequired(permission, 'location-permission-denied');
        return;
      }
      if (
        settings.mode === 'automatic' &&
        permission !== 'granted' &&
        matchingCache
      ) {
        displayCache(matchingCache, true, 'location-permission-denied');
        return;
      }
      await loadForSettings(settings);
    })();
    try {
      await initializeWork;
    } finally {
      initializeWork = null;
    }
  };

  const requestAutomaticLocation = async () => {
    patchSnapshot({
      status: 'loading',
      isRefreshing: true,
      failure: null,
    });
    const permission = await dependencies.location.requestPermission();
    patchSnapshot({ permission });
    if (permission !== 'granted') {
      setPermissionRequired(permission, 'location-permission-denied');
      return;
    }
    let position;
    try {
      position = await dependencies.location.getApproximatePosition(
        ENVIRONMENT_LOCATION_TIMEOUT_MS,
      );
    } catch (error) {
      patchSnapshot({
        status: 'unavailable',
        enabled: settings !== null,
        isRefreshing: false,
        failure: mapLocationFailure(error),
      });
      return;
    }
    const grid = toKmaGrid(position.latitude, position.longitude);
    // Do not retain the raw position beyond this conversion.
    position = undefined;
    if (!grid) {
      patchSnapshot({
        status: 'unavailable',
        isRefreshing: false,
        failure: 'location-outside-korea',
      });
      return;
    }
    const nextSettings: EnvironmentSettings = {
      schemaVersion: ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
      mode: 'automatic',
      grid,
      regionName: '현재 위치',
    };
    try {
      await dependencies.repository.writeSettings(nextSettings);
    } catch {
      patchSnapshot({
        status: 'unavailable',
        isRefreshing: false,
        failure: 'storage',
      });
      return;
    }
    settings = nextSettings;
    await refresh({ force: true, manual: false, reacquireLocation: false });
  };

  const selectManualRegion = async (region: ManualEnvironmentRegion) => {
    const regionName = region.regionName.trim();
    if (!regionName || regionName.length > 80 || !isValidKmaGrid(region.grid)) {
      throw new TypeError('Invalid manual environment region.');
    }
    const nextSettings: EnvironmentSettings = {
      schemaVersion: ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
      mode: 'manual',
      grid: { nx: region.grid.nx, ny: region.grid.ny },
      regionName,
    };
    patchSnapshot({ status: 'loading', isRefreshing: true, failure: null });
    try {
      await dependencies.repository.writeSettings(nextSettings);
    } catch {
      patchSnapshot({
        status: 'unavailable',
        isRefreshing: false,
        failure: 'storage',
      });
      return;
    }
    settings = nextSettings;
    await refresh({ force: true, manual: false, reacquireLocation: false });
  };

  async function resolveAutomaticGrid(
    currentSettings: EnvironmentSettings,
  ): Promise<EnvironmentSettings | null> {
    const permission = await dependencies.location.getPermission();
    patchSnapshot({ permission });
    if (permission !== 'granted') {
      setPermissionRequired(permission, 'location-permission-denied');
      return null;
    }
    try {
      let position = await dependencies.location.getApproximatePosition(
        ENVIRONMENT_LOCATION_TIMEOUT_MS,
      );
      const grid = toKmaGrid(position.latitude, position.longitude);
      position = undefined as never;
      if (!grid) {
        patchSnapshot({
          status: 'unavailable',
          isRefreshing: false,
          failure: 'location-outside-korea',
        });
        return null;
      }
      if (isSameKmaGrid(grid, currentSettings.grid)) return currentSettings;
      const nextSettings = { ...currentSettings, grid };
      await dependencies.repository.writeSettings(nextSettings);
      settings = nextSettings;
      return nextSettings;
    } catch (error) {
      const now = dependencies.clock.now();
      if (
        cache &&
        isSameKmaGrid(cache.grid, currentSettings.grid) &&
        getCacheAge(now, cache) <= ENVIRONMENT_STALE_CACHE_MS
      ) {
        displayCache(cache, true, mapLocationFailure(error));
      } else {
        patchSnapshot({
          status: 'unavailable',
          isRefreshing: false,
          failure:
            error instanceof TypeError ? 'storage' : mapLocationFailure(error),
        });
      }
      return null;
    }
  }

  async function performRefresh(
    options: EnvironmentRefreshOptions,
  ): Promise<void> {
    if (!settings) {
      setPermissionRequired(snapshot.permission, null);
      return;
    }
    const now = dependencies.clock.now();
    if (!isUsableDate(now)) throw new RangeError('Invalid environment clock.');
    const manual = options.manual !== false;
    if (
      manual &&
      !options.force &&
      now.getTime() - lastManualRefreshAt < ENVIRONMENT_MANUAL_REFRESH_COOLDOWN_MS
    ) {
      return;
    }
    if (manual) {
      lastManualRefreshAt = now.getTime();
      patchSnapshot({ canRefresh: false });
      scheduleManualRefreshUnlock();
    }
    patchSnapshot({
      status: snapshot.payload ? snapshot.status : 'loading',
      enabled: true,
      mode: settings.mode,
      regionName: settings.regionName,
      isRefreshing: true,
      failure: null,
    });

    let requestSettings = settings;
    if (settings.mode === 'automatic' && options.reacquireLocation !== false) {
      const resolved = await resolveAutomaticGrid(settings);
      if (!resolved) return;
      requestSettings = resolved;
    }

    try {
      const payload = await dependencies.gateway.fetch(requestSettings.grid);
      const savedAt = dependencies.clock.now().toISOString();
      const entry: EnvironmentCacheEntry = {
        schemaVersion: ENVIRONMENT_BRIEFING_SCHEMA_VERSION,
        savedAt,
        grid: requestSettings.grid,
        regionName: requestSettings.regionName,
        payload,
      };
      cache = entry;
      try {
        await dependencies.repository.writeCache(entry);
      } catch {
        // A live provider result remains useful even when auxiliary caching fails.
      }
      patchSnapshot({
        status: statusForPayload(payload),
        enabled: true,
        mode: requestSettings.mode,
        regionName: requestSettings.regionName,
        payload,
        updatedAt: savedAt,
        isRefreshing: false,
        failure:
          statusForPayload(payload) === 'unavailable'
            ? 'provider-unavailable'
            : null,
      });
    } catch (error) {
      const fallback =
        cache && isSameKmaGrid(cache.grid, requestSettings.grid) ? cache : null;
      if (
        fallback &&
        getCacheAge(dependencies.clock.now(), fallback) <=
          ENVIRONMENT_STALE_CACHE_MS
      ) {
        displayCache(fallback, true, mapGatewayFailure(error));
        return;
      }
      patchSnapshot({
        status: 'unavailable',
        enabled: true,
        mode: requestSettings.mode,
        regionName: requestSettings.regionName,
        payload: null,
        updatedAt: null,
        isRefreshing: false,
        failure: mapGatewayFailure(error),
      });
    }
  }

  async function refresh(
    options: EnvironmentRefreshOptions = {},
  ): Promise<void> {
    if (refreshWork) return refreshWork;
    refreshWork = performRefresh(options);
    try {
      await refreshWork;
    } finally {
      refreshWork = null;
    }
  }

  const clearLocalData = async () => {
    await dependencies.repository.clear();
    settings = null;
    cache = null;
    emit(INITIAL_SNAPSHOT);
  };

  const disable = async () => {
    try {
      await clearLocalData();
    } catch {
      patchSnapshot({ failure: 'storage' });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    requestAutomaticLocation,
    selectManualRegion,
    refresh,
    disable,
    clearLocalData,
    dispose() {
      if (refreshCooldownTimer) clearTimeout(refreshCooldownTimer);
      refreshCooldownTimer = null;
      listeners.clear();
    },
  };
}
