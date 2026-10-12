import { useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { DriverLicenceVerifier } from './components/DriverLicenceVerifier';

/**
 * "Giấy tờ & Xác minh" của tài khoản khách — hiện chỉ có bằng lái (ADR 0057). Bản native của
 * `DriverLicencePage` bên web (`/account/documents`). Bước bằng lái khi đặt xe tự lái dùng cùng
 * bộ xác thực, nên nộp ở đâu thì chỗ kia cũng thấy.
 */
export function DriverLicenceScreen() {
  const t = useTranslations('DriverLicence.page');
  const tn = useTranslations('Navigation.account');
  const router = useRouter();

  return (
    <>
      <AppHeader
        title={tn('documents')}
        onBack={() => goBackOr(router, ROUTES.account.home())}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={layout.section}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('subtitle')}
          </Text>
          <YStack gap={space.sm}>
            <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
              {t('sectionTitle')}
            </Text>
            <DriverLicenceVerifier />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
