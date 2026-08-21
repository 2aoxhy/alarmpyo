import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  parseEnvironmentCacheEntry,
  parseEnvironmentSettings,
} from '../../application/environment/environment-codec';
import {
  ENVIRONMENT_CACHE_STORAGE_KEY,
  ENVIRONMENT_SETTINGS_STORAGE_KEY,
  type EnvironmentCacheEntry,
  type EnvironmentLocalRepository,
  type EnvironmentSettings,
} from '../../application/environment/environment-types';

export type EnvironmentKeyValueStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}>;

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createEnvironmentLocalRepository(
  storage: EnvironmentKeyValueStorage = AsyncStorage,
): EnvironmentLocalRepository {
  return {
    async readSettings() {
      try {
        return parseEnvironmentSettings(
          parseJson(await storage.getItem(ENVIRONMENT_SETTINGS_STORAGE_KEY)),
        );
      } catch {
        return null;
      }
    },

    async writeSettings(settings: EnvironmentSettings) {
      const parsed = parseEnvironmentSettings(settings);
      if (!parsed) throw new TypeError('Invalid environment settings.');
      await storage.setItem(
        ENVIRONMENT_SETTINGS_STORAGE_KEY,
        JSON.stringify(parsed),
      );
    },

    async readCache() {
      try {
        return parseEnvironmentCacheEntry(
          parseJson(await storage.getItem(ENVIRONMENT_CACHE_STORAGE_KEY)),
        );
      } catch {
        return null;
      }
    },

    async writeCache(entry: EnvironmentCacheEntry) {
      const parsed = parseEnvironmentCacheEntry(entry);
      if (!parsed) throw new TypeError('Invalid environment cache entry.');
      await storage.setItem(
        ENVIRONMENT_CACHE_STORAGE_KEY,
        JSON.stringify(parsed),
      );
    },

    async clear() {
      await Promise.all([
        storage.removeItem(ENVIRONMENT_SETTINGS_STORAGE_KEY),
        storage.removeItem(ENVIRONMENT_CACHE_STORAGE_KEY),
      ]);
    },
  };
}

export const environmentLocalRepository = createEnvironmentLocalRepository();
