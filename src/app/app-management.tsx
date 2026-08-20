import { router, Stack, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

import {
  AppText,
  ListRow,
  MenuDivider,
  MenuGroup,
  Screen,
} from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { getAppManagementPresentation } from '@/features/app-management/app-management-controller';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export default function AppManagementScreen() {
  const styles = useThemedStyles(createStyles);
  const { appUpdateLabel, playDistribution } = getAppManagementPresentation();

  return (
    <>
      <Stack.Screen options={{ title: '데이터·앱 정보' }} />
      <Screen contentStyle={styles.screen}>
        <AppText tone="secondary" style={styles.centerText}>
          자주 바꾸지 않는 관리 항목을 모았습니다.
        </AppText>

        <MenuGroup centered title="관리">
          <ListRow
            icon="download-outline"
            onPress={() => router.push('/data-settings')}
            subtitle="근무 설정 공유와 백업·복구를 관리합니다"
            title="데이터 관리"
          />
          <MenuDivider />
          <ListRow
            icon="sync"
            onPress={() => router.push('/app-update')}
            subtitle={
              playDistribution
                ? 'Google Play에서 최신 버전을 확인합니다'
                : '새 앱 설치 파일을 확인하고 안전하게 설치합니다'
            }
            title={playDistribution ? 'Google Play 업데이트' : '앱 업데이트'}
          />
          <MenuDivider />
          <ListRow
            icon="shield-outline"
            onPress={() => router.push('/privacy' as Href)}
            subtitle="저장·권한·데이터 처리 기준을 확인합니다"
            title="개인정보 처리방침"
          />
        </MenuGroup>

        <AppText tone="tertiary" style={styles.centerText} variant="caption">
          알람표 · {appUpdateLabel}
        </AppText>
      </Screen>
    </>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    screen: { gap: spacing.large },
    centerText: { textAlign: 'center' },
  });
