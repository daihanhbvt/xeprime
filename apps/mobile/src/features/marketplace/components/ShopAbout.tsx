import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STOREFRONT_KIND } from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { PublicShop } from '../api';

/**
 * Khối "gian hàng này là ai" — lời giới thiệu, địa chỉ, và bốn con số đáng tin.
 *
 * ## Con số RỖNG thì BỎ, không hiện 0
 *
 * "Tỉ lệ phản hồi 0%" của một gian hàng vừa mở nói sai hoàn toàn: họ chưa từng bỏ lỡ tin nào, họ
 * chỉ chưa nhận tin nào. Cũng vậy với "0,0 sao" khi chưa có đánh giá — đó là một lời buộc tội
 * dựng từ chỗ trống. Nên `responseRatePercent == null` và `ratingCount === 0` bị LOẠI khỏi danh
 * sách chứ không in ra số 0.
 *
 * Không có gì để kể VÀ không có số nào đáng trưng ⇒ không dựng thẻ rỗng.
 */
export function ShopAbout({ shop }: { shop: PublicShop }) {
  const t = useTranslations('Shops');
  const fmt = useAppFormat();

  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;
  const rating = Number(shop.ratingAvg);

  const stats = [
    { key: 'vehicles', value: fmt.count(shop.vehicleCount), label: t('stats.vehicles') },
    typeof shop.responseRatePercent === 'number'
      ? {
          key: 'responseRate',
          value: t('stats.responseRateValue', { percent: shop.responseRatePercent }),
          label: t('stats.responseRate'),
        }
      : null,
    {
      key: 'completedTrips',
      value: fmt.count(shop.completedTripCount),
      label: t('stats.completedTrips'),
    },
    shop.ratingCount > 0 && Number.isFinite(rating)
      ? { key: 'rating', value: fmt.rating(rating), label: t('stats.rating') }
      : null,
  ].filter((stat): stat is { key: string; value: string; label: string } => stat !== null);

  if (!shop.bio && !shop.address && stats.length === 0) return null;

  return (
    <Card>
      <YStack gap={space.md}>
        {shop.bio || shop.address ? (
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
              {t(isShop ? 'about.titleShop' : 'about.titlePersonal')}
            </Text>
            {shop.bio ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {shop.bio}
              </Text>
            ) : null}
            {shop.address ? (
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {t('about.address', { address: shop.address })}
              </Text>
            ) : null}
          </YStack>
        ) : null}

        {stats.length > 0 ? (
          <XStack flexWrap="wrap" gap={space.md} accessibilityLabel={t('stats.sectionLabel')}>
            {stats.map((stat) => (
              <YStack key={stat.key} gap={2} minWidth={96}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {stat.value}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {stat.label}
                </Text>
              </YStack>
            ))}
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}
