import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LEGAL_DOC, LEGAL_EFFECTIVE_FROM } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useAppFormat } from '@/i18n/use-app-format';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

const POINTS = ['location', 'bank', 'masking', 'rights'] as const;

/**
 * Chính sách bảo vệ dữ liệu — bản TÓM TẮT chỉ-đọc dẫn tới văn bản thật ở `/legal/privacy`.
 * Bản native của `DataProtectionView`.
 *
 * Dấu tick là TRANG TRÍ, không phải control: repo chưa có API lưu consent, nên màn không dựng
 * checkbox cục bộ rồi báo "đã lưu" cho một thứ backend không lưu. Ghi chú `consentNote` nói
 * thẳng điều đó với người đọc — y hệt web.
 */
export function DataProtectionScreen() {
  const t = useTranslations('Account.dataProtection');
  const router = useRouter();
  const fmt = useAppFormat();
  const openLegalDoc = useOpenLegalDoc();

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('intro')}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <Card padded={false}>
            <LinearGradient
              colors={[colors.primaryLight, colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: space.md }}
            >
              <XStack ai="center" gap={space.sm}>
                <YStack f={1} minWidth={0} gap={space.xs}>
                  <Text
                    col={colors.primaryActive}
                    fos={fontSize.meta}
                    fow={fontWeight.semibold}
                    letterSpacing={0.8}
                  >
                    {t('badge').toLocaleUpperCase()}
                  </Text>
                  <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                    {t('heading')}
                  </Text>
                </YStack>
                <YStack w={44} h={44} br={radius.md} bg={colors.surface} ai="center" jc="center">
                  <Ionicons
                    name="shield-checkmark"
                    size={iconSize.lg}
                    color={colors.primaryActive}
                  />
                </YStack>
              </XStack>
            </LinearGradient>

            <YStack gap={space.md} p={space.md}>
              {POINTS.map((point) => (
                <XStack key={point} ai="flex-start" gap={space.sm}>
                  <YStack pt={1}>
                    <Ionicons name="checkbox" size={iconSize.sm} color={colors.success} />
                  </YStack>
                  <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                    {t(`points.${point}` as never)}
                  </Text>
                </XStack>
              ))}

              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('commitment')}
              </Text>
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('consentNote')}
              </Text>
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('lastUpdated', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}
              </Text>
            </YStack>
          </Card>

          <Button
            label={t('readPolicy')}
            icon="document-text-outline"
            onPress={() => openLegalDoc(LEGAL_DOC.PRIVACY)}
          />
        </YStack>
      </Screen>
    </>
  );
}
