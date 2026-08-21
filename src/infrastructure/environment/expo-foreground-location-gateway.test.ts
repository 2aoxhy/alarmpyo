import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  PermissionsAndroid: {
    PERMISSIONS: { ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION' },
    RESULTS: {
      DENIED: 'denied',
      GRANTED: 'granted',
      NEVER_ASK_AGAIN: 'never_ask_again',
    },
    check: vi.fn(),
    request: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { createExpoForegroundLocationGateway } from './expo-foreground-location-gateway';

function expoLocationPort() {
  return {
    getCurrentPositionAsync: vi.fn(async () => ({
      coords: { latitude: 37.5665, longitude: 126.978 },
    })),
    getForegroundPermissionsAsync: vi.fn(async () => ({
      granted: false,
      canAskAgain: true,
    })),
    requestForegroundPermissionsAsync: vi.fn(async () => ({
      granted: true,
      canAskAgain: true,
    })),
  };
}

describe('foreground coarse location gateway', () => {
  it('Android에서 Expo의 FINE+COARSE 요청 대신 COARSE만 요청합니다', async () => {
    const expoLocation = expoLocationPort();
    const androidCoarsePermission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => 'granted' as const),
    };
    const gateway = createExpoForegroundLocationGateway({
      platform: 'android',
      androidCoarsePermission,
      expoLocation: expoLocation as never,
    });

    await expect(gateway.getPermission()).resolves.toBe('undetermined');
    await expect(gateway.requestPermission()).resolves.toBe('granted');
    expect(androidCoarsePermission.check).toHaveBeenCalledOnce();
    expect(androidCoarsePermission.request).toHaveBeenCalledOnce();
    expect(expoLocation.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(expoLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('Android never ask again을 blocked로 전달합니다', async () => {
    const gateway = createExpoForegroundLocationGateway({
      platform: 'android',
      androidCoarsePermission: {
        check: vi.fn(async () => false),
        request: vi.fn(async () => 'never_ask_again' as const),
      },
      expoLocation: expoLocationPort() as never,
    });
    await expect(gateway.requestPermission()).resolves.toBe('blocked');
  });

  it('iOS는 Expo foreground 권한 계약을 유지합니다', async () => {
    const expoLocation = expoLocationPort();
    const androidRequest = vi.fn(async () => 'denied' as const);
    const gateway = createExpoForegroundLocationGateway({
      platform: 'ios',
      androidCoarsePermission: {
        check: vi.fn(async () => false),
        request: androidRequest,
      },
      expoLocation: expoLocation as never,
    });
    await expect(gateway.requestPermission()).resolves.toBe('granted');
    expect(expoLocation.requestForegroundPermissionsAsync).toHaveBeenCalledOnce();
    expect(androidRequest).not.toHaveBeenCalled();
  });
});
