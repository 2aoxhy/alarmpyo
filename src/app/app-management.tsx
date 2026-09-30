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
import { useGlobalPlayUpdate } from '@/features/update/global-play-update-controller';
import { PlayUpdateStatusBadge } from '@/features/update/play-update-status-badge';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export default function AppManagementScreen() {
  const styles = useThemedStyles(createStyles);
  const { badge } = useGlobalPlayUpdate();
  const { appUpdateLabel, appUpdateSubtitle, playDistribution } =
    getAppManagementPresentation(badge);

  return (
    <>
      <Stack.Screen options={{ title: '데이터·앱 정보' }} />
      <Screen contentStyle={styles.screen}>
        <MenuGroup centered title="관리">
          <ListRow
            icon="download-outline"
            onPress={() => router.push('/data-settings')}
            subtitle="근무표 공유 · 백업 · 복구"
            title="데이터 관리"
          />
          <MenuDivider />
          <ListRow
            icon="sync"
            onPress={() => router.push('/app-update')}
            subtitle={appUpdateSubtitle}
            title={playDistribution ? 'Google Play 업데이트' : '앱 업데이트'}
            trailing={playDistribution && badge ? <PlayUpdateStatusBadge badge={badge} /> : undefined}
          />
          <MenuDivider />
          <ListRow
            icon="shield-outline"
            onPress={() => router.push('/privacy' as Href)}
            subtitle="저장 · 권한 · 데이터 처리 기준"
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
