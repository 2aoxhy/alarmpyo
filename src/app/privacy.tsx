import { Stack } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { useAppDialog } from '@/components/app-dialog';
import { AppButton, AppText, Card, Screen } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';

const POLICY_SECTIONS = [
  {
    title: '처리하는 정보',
    body: '알람표는 계정을 만들지 않으며 광고·분석 도구를 사용하지 않아요. 근무표, 알람 설정, 메모, 화면 설정은 이 기기의 앱 저장 공간에 보관해요.',
  },
  {
    title: '외부 전송',
    body: '근무 데이터는 자동으로 외부 서버에 전송하지 않아요. 백업이나 근무 설정 공유를 직접 선택한 경우에만 사용자가 고른 앱 또는 저장 위치로 파일을 전달해요.',
  },
  {
    title: '업데이트 통신',
    body: 'Google Play 배포판의 업데이트는 Google Play에서 처리해요. 현재 앱에는 Expo 업데이트 주소나 직접 APK 배포 주소가 연결되어 있지 않아 별도 업데이트 서버에 접속하지 않아요.',
  },
  {
    title: '권한 사용',
    body: '알림, 정확한 알람, 전체 화면 알람, 진동, 부팅 후 알람 복구와 알람음 재생 권한은 근무 알람을 제시간에 전달하는 데 사용해요. 파일은 Android 시스템 선택 화면에서 사용자가 직접 고른 항목만 읽거나 저장해요.',
  },
  {
    title: '보관과 삭제',
    body: '앱 안의 정보는 사용자가 초기화하거나 앱을 삭제할 때까지 기기에 보관해요. 설정의 데이터 메뉴에서 모든 정보를 초기화할 수 있어요. 외부로 내보낸 백업 파일은 사용자가 저장한 위치에서 직접 삭제해야 해요.',
  },
  {
    title: '아동과 계정',
    body: '알람표는 계정 생성 기능이 없고 아동을 대상으로 개인정보를 수집하지 않아요.',
  },
] as const;

export default function PrivacyScreen() {
  const { showDialog } = useAppDialog();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  const openContactEmail = async () => {
    try {
      await Linking.openURL('mailto:2aox.hy@gmail.com');
    } catch {
      showDialog(
        '이메일 앱을 열지 못했어요',
        '팝업을 닫은 뒤 화면의 문의 이메일을 길게 눌러 복사하거나, 이메일 앱에서 직접 입력해 주세요.',
      );
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: '개인정보 처리방침' }} />
      <Screen contentStyle={styles.screen}>
        <View style={styles.header}>
          <AppText accessibilityRole="header" variant="title">
            개인정보 처리방침
          </AppText>
          <AppText color={palette.inkMuted} style={styles.centerText}>
            알람표가 데이터를 저장하고 사용하는 기준을 안내해요.
          </AppText>
        </View>

        <Card style={styles.policyCard}>
          {POLICY_SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <AppText accessibilityRole="header" variant="heading">
                {section.title}
              </AppText>
              <AppText color={palette.inkMuted}>{section.body}</AppText>
            </View>
          ))}
        </Card>

        <Card density="compact" style={styles.contactCard}>
          <AppText accessibilityRole="header" variant="label">
            문의와 시행일
          </AppText>
          <AppText color={palette.inkMuted}>
            개인정보 보호 책임자는 개발자 2aox.hy(윤강현)예요.
          </AppText>
          <AppText
            accessibilityLabel="문의 이메일 2aox.hy@gmail.com. 길게 눌러 복사할 수 있어요."
            color={palette.inkMuted}
            selectable>
            문의 이메일 · 2aox.hy@gmail.com
          </AppText>
          <AppButton
            label="이메일 문의하기"
            onPress={() => void openContactEmail()}
            size="compact"
            variant="secondary"
          />
          <AppText color={palette.inkSoft} variant="caption">
            시행일 2026년 8월 9일
          </AppText>
        </Card>
      </Screen>
    </>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    screen: { gap: spacing.large },
    header: { alignItems: 'center', gap: spacing.small },
    centerText: { textAlign: 'center' },
    policyCard: { gap: spacing.large },
    section: { gap: spacing.small },
    contactCard: { gap: spacing.small },
  });
