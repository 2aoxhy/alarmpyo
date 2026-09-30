import { Stack } from 'expo-router';

import { SetupSessionScreen } from '@/features/quick-setup/setup-session-screen';

export default function QuickSetupScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '근무표 설정' }} />
      <SetupSessionScreen mode="reconfigure" />
    </>
  );
}
