import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { DriverLicenceVerifier } from './DriverLicenceVerifier';

/**
 * Khối "Giấy tờ & Xác minh" ngay trong tab Tài khoản, dưới thẻ hồ sơ (design Account / Profile) —
 * bản native của `AccountDocumentsCard` bên web. Thay cho màn riêng `/account/documents` trước đây.
 * Bước bằng lái khi đặt xe dùng cùng bộ xác thực, nên nộp ở đâu thì chỗ kia cũng thấy (ADR 0057).
 */
export function AccountDocumentsSection() {
  const t = useTranslations('DriverLicence.page');
  const tn = useTranslations('Navigation.account');
  return (
    <YStack gap={space.sm}>
      <YStack gap={space.xs}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {tn('documents')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('subtitle')}
        </Text>
      </YStack>
      <DriverLicenceVerifier embedded />
    </YStack>
  );
}
