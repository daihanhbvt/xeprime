import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { LegalDocLinks } from '@/features/legal/components/LegalDocLinks';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, iconSize, space } from '@/theme/tokens';

/** Ba kênh liên hệ, đúng thứ tự web bày chúng. */
const CHANNELS = ['hotline', 'email', 'hours'] as const;

/** Bốn mẩu cần gửi kèm để một yêu cầu xử lý được ngay lượt đầu. */
const CHECKLIST = ['tripCode', 'phone', 'evidence', 'expectation'] as const;

/**
 * Trung tâm hỗ trợ CÔNG KHAI — bản native của `/support`, không cần đăng nhập.
 *
 * Người đang mắc kẹt giữa chuyến (xe hỏng, không gọi được chủ xe, mất điện thoại đã đăng nhập) là
 * đúng nhóm cần kênh liên hệ nhất và cũng là nhóm ít có khả năng đăng nhập nhất. Vì vậy màn này
 * nằm NGOÀI cổng phiên, khác hẳn `/account/support` (hàng đợi yêu cầu của một người) và
 * `/manage/support` (trung tâm trợ giúp của gian hàng).
 *
 * Quy chế sàn viện dẫn thẳng địa chỉ này làm "cơ chế tiếp nhận phản ánh" — đổi đường dẫn là phải
 * sửa cả văn bản, nên nó giữ nguyên `/support` như web.
 *
 * Thứ tự khối là một quyết định, không phải một bố cục: **cấp cứu đứng TRƯỚC** kênh của XePrime,
 * vì có những việc gọi cho chúng tôi là sai thứ tự.
 */
export function PublicSupportScreen() {
  const t = useTranslations('Support');
  const router = useRouter();

  return (
    <>
      <AppHeader
        title={t('title')}
        onBack={() => goBackOr(router, ROUTES.explore.home())}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('subtitle')}
          </Text>

          {/*
            Cùng lý do với băng bản thảo ở màn pháp lý: một số hotline giả lọt ra ngoài thì người
            gặp sự cố gọi vào hư không. Gỡ băng này cùng lúc với việc điền kênh liên hệ thật.
          */}
          <Callout tone="warning">{t('draftNotice')}</Callout>

          <Callout tone="danger" title={t('emergency.heading')}>
            {t('emergency.body')}
          </Callout>

          <YStack gap={space.sm}>
            <BlockTitle>{t('channels.heading')}</BlockTitle>
            <Card>
              <YStack gap={space.sm}>
                {CHANNELS.map((key) => (
                  <YStack key={key} gap={2}>
                    <DataRow
                      label={t(`channels.${key}.label`)}
                      value={t(`channels.${key}.value`)}
                      strong
                    />
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {t(`channels.${key}.note`)}
                    </Text>
                  </YStack>
                ))}
              </YStack>
            </Card>
          </YStack>

          <YStack gap={space.sm}>
            <BlockTitle>{t('beforeContact.heading')}</BlockTitle>
            <Card>
              <YStack gap={space.xs}>
                {CHECKLIST.map((key) => (
                  <XStack key={key} ai="flex-start" gap={space.xs}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={iconSize.sm}
                      color={colors.success}
                    />
                    <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                      {t(`beforeContact.${key}`)}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </Card>
          </YStack>

          <YStack gap={space.sm}>
            <BlockTitle>{t('scope.heading')}</BlockTitle>
            <Card>
              <YStack gap={space.xs}>
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {t('scope.canDo')}
                </Text>
                {/*
                  Vế KHÔNG làm được in mờ hơn nhưng vẫn phải có: giao dịch hai bên tự làm ngoài
                  nền tảng là chỗ tranh chấp hay xảy ra nhất, và im lặng về nó là hứa hộ.
                */}
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('scope.cannotDo')}
                </Text>
              </YStack>
            </Card>
          </YStack>

          <YStack gap={space.sm}>
            <BlockTitle>{t('legal.heading')}</BlockTitle>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('legal.body')}
            </Text>
            <LegalDocLinks />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
