import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';

import type {
  ForegroundApproximatePosition,
  ForegroundLocationGateway,
  ForegroundLocationPermission,
} from '../../application/environment/environment-types';

export type ForegroundLocationErrorCode = 'timeout' | 'unavailable';

export class ForegroundLocationError extends Error {
  readonly code: ForegroundLocationErrorCode;

  constructor(code: ForegroundLocationErrorCode) {
    super(`Foreground location failed: ${code}`);
    this.name = 'ForegroundLocationError';
    this.code = code;
  }
}

function mapPermission(
  permission: Pick<Location.LocationPermissionResponse, 'granted' | 'canAskAgain'>,
): ForegroundLocationPermission {
  if (permission.granted) return 'granted';
  return permission.canAskAgain ? 'denied' : 'blocked';
}

type AndroidCoarsePermissionPort = Readonly<{
  check(): Promise<boolean>;
  request(): Promise<'denied' | 'granted' | 'never_ask_again'>;
}>;

type ExpoForegroundLocationPort = Pick<
  typeof Location,
  | 'getCurrentPositionAsync'
  | 'getForegroundPermissionsAsync'
  | 'requestForegroundPermissionsAsync'
>;

export type ExpoForegroundLocationGatewayOptions = Readonly<{
  platform?: string;
  androidCoarsePermission?: AndroidCoarsePermissionPort;
  expoLocation?: ExpoForegroundLocationPort;
}>;

function createAndroidCoarsePermissionPort(): AndroidCoarsePermissionPort {
  const permission = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  return {
    check: () => PermissionsAndroid.check(permission),
    request: () => PermissionsAndroid.request(permission),
  };
}

function mapAndroidPermission(
  result: Awaited<ReturnType<AndroidCoarsePermissionPort['request']>>,
): ForegroundLocationPermission {
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new ForegroundLocationError('timeout')),
      timeoutMs,
    );
    work.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        reject(new ForegroundLocationError('unavailable'));
      },
    );
  });
}

export function createExpoForegroundLocationGateway(
  options: ExpoForegroundLocationGatewayOptions = {},
): ForegroundLocationGateway {
  const platform = options.platform ?? Platform.OS;
  const androidCoarsePermission =
    options.androidCoarsePermission ??
    (platform === 'android' ? createAndroidCoarsePermissionPort() : null);
  const expoLocation = options.expoLocation ?? Location;
  return {
    async getPermission() {
      if (platform === 'android') {
        try {
          return (await androidCoarsePermission!.check())
            ? 'granted'
            : 'undetermined';
        } catch {
          return 'undetermined';
        }
      }
      try {
        return mapPermission(await expoLocation.getForegroundPermissionsAsync());
      } catch {
        return 'undetermined';
      }
    },

    async requestPermission() {
      if (platform === 'android') {
        try {
          return mapAndroidPermission(await androidCoarsePermission!.request());
        } catch {
          return 'denied';
        }
      }
      try {
        return mapPermission(
          await expoLocation.requestForegroundPermissionsAsync(),
        );
      } catch {
        return 'denied';
      }
    },

    async getApproximatePosition(
      timeoutMs: number,
    ): Promise<ForegroundApproximatePosition> {
      const position = await withTimeout(
        expoLocation.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        timeoutMs,
      );
      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new ForegroundLocationError('unavailable');
      }
      // The raw values deliberately leave this adapter only as a return value.
      // The controller immediately quantizes them to a KMA grid and discards them.
      return { latitude, longitude };
    },
  };
}
