import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LEGAL_DOC, LEGAL_EFFECTIVE_FROM, ownerResourcesOfKind } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useAppFormat } from '@/i18n/use-app-format';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { ResourceList } from './components/ResourceList';

/** Hai văn bản nói về chính sách đang có hiệu lực — cùng cặp web trưng ở khối "Cập nhật chính sách". */
const POLICY_DOCS = [LEGAL_DOC.MARKETPLACE_RULES, LEGAL_DOC.TERMS] as const;

/**
 * Cẩm nang cho thuê xe — nội dung TĨNH, không gọi API nào. Bản native của `HostGuideView`.
 *
 * Hai khối y như web: danh sách cẩm nang (PDF từ manifest `OWNER_RESOURCES` dùng chung) và "Cập
 * nhật chính sách". Khối thứ hai trỏ tới hai văn bản pháp lý THẬT của sàn với ngày hiệu lực đọc
 * từ `LEGAL_EFFECTIVE_FROM` — nguồn duy nhất trong repo nói được "bản nào đang có hiệu lực".
 */
export function HostGuideScreen() {
  const t = useTranslations('Account.hostGuide');
  const tLegal = useTranslations('Legal.docs');
  const router = useRouter();
  const fmt = useAppFormat();
  const openLegalDoc = useOpenLegalDoc();

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <ResourceList resources={ownerResourcesOfKind('guide')} />

          <Card>
            <YStack gap={space.sm}>
              <XStack ai="center" gap={space.xs}>
                <YStack w={8} h={8} br={radius.pill} bg={colors.primary} />
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('policyHeading')}
                </Text>
              </XStack>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('policyBody', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}
              </Text>

              <YStack>
                {POLICY_DOCS.map((doc, index) => (
                  <Pressable
                    key={doc}
                    onPress={() => openLegalDoc(doc)}
                    accessibilityRole="link"
                    accessibilityLabel={tLegal(`${doc}.title` as never)}
                    style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                  >
                    {index > 0 ? <YStack h={1} bg={colors.borderSubtle} /> : null}
                    <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
                      <YStack f={1} minWidth={0} gap={2}>
                        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                          {tLegal(`${doc}.title` as never)}
                        </Text>
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {tLegal(`${doc}.summary` as never)}
                        </Text>
                      </YStack>
                      <Ionicons
                        name="chevron-forward"
                        size={iconSize.sm}
                        color={colors.placeholder}
                      />
                    </XStack>
                  </Pressable>
                ))}
              </YStack>
            </YStack>
          </Card>
        </YStack>
      </Screen>
    </>
  );
}
