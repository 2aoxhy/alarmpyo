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
    body: '앱은 실행할 때 Expo의 EAS Update 서버에 HTTPS로 호환되는 업데이트가 있는지 확인할 수 있어요. 이 과정에서 기기 운영체제, 앱·런타임 버전, 프로젝트 식별자, 무작위 설치 토큰, IP 주소와 네트워크 요청, 업데이트 오류·성능 진단 정보를 Expo가 업데이트 제공·보안·오류 확인과 서비스 운영을 위해 처리할 수 있어요.',
  },
  {
    title: '공개 방침 페이지',
    body: '웹에서 공개 방침 페이지를 열 때에만 GitHub Pages가 서비스의 보안과 무결성을 유지하기 위해 방문자의 IP 주소를 기록·저장해요. 이 웹 호스팅 로그는 앱의 근무표·메모·알람 설정 전송이 아니며, 앱이 GitHub Pages에 자동 접속하지 않아요.',
  },
  {
    title: '수면 안내와 건강 정보',
    body: '수면 준비 시점은 기기에 저장된 근무 일정으로만 계산해요. 수면 패턴·수면 질·건강 상태나 신체 센서 정보를 입력받거나 측정·기록·전송하지 않아요. 의료기기가 아니며 질환을 진단·치료·치유·예방하지 않아요. 의료 조언이 필요하면 의료 전문가와 상담하세요.',
  },
  {
    title: '권한 사용',
    body: '알림, 정확한 알람, 전체 화면 알람, 진동, 부팅 후 알람 복구와 알람음 재생 권한은 근무 알람을 제시간에 전달하는 데 사용해요. 파일은 Android 시스템 선택 화면에서 사용자가 직접 고른 항목만 읽거나 저장해요.',
  },
  {
    title: '보관과 삭제',
    body: '설정에서 초기화하면 현재 근무표·메모·설정은 초기화되지만, 복구할 수 있도록 초기화 직전 자료를 앱 내부 안전 백업으로 남겨요. 앱을 삭제하면 현재 자료와 내부 안전 백업이 함께 삭제돼요. 외부로 내보낸 백업 파일은 저장한 위치에서 직접 삭제해야 해요. Expo가 처리하는 업데이트 기술 정보는 Expo의 보관·삭제 기준을 따라요.',
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
            시행일 2026년 8월 12일
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
