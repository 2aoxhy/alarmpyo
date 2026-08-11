import { describe, expect, it } from 'vitest';

import { EAS_CLI_PACKAGE } from '../run-eas-cli.mjs';
import { EXPO_DOCTOR_PACKAGE } from '../run-expo-doctor.mjs';

describe('릴리스 도구 버전 고정', () => {
  it('EAS CLI 버전을 고정해요', () => {
    expect(EAS_CLI_PACKAGE).toBe('eas-cli@21.7.0');
  });

  it('Expo Doctor 버전을 고정해요', () => {
    expect(EXPO_DOCTOR_PACKAGE).toBe('expo-doctor@1.20.1');
  });
});
