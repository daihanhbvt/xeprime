import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useFeaturedShops } from '../hooks/use-marketplace-data';
import type { PublicShopSummary } from '../api';
import { SectionError } from './SectionError';
import { SectionHeader } from './SectionHeader';

/** Đúng 4 gian hàng — nhiều hơn là thành danh bạ, không còn là "nổi bật". Cùng con số với web. */
const LIMIT = 4;

/**
 * "Gian hàng nổi bật" — shop đang hoạt động có xe công khai, sắp theo điểm đánh giá.
 * Điểm và số xe đều từ backend, không biên tập tay.
 *
 * `onOpenShop` vắng mặt = thẻ chỉ hiển thị; trang gian hàng (MKT-05) chưa dựng.
 */
export function FeaturedHosts({ onOpenShop }: { onOpenShop?: (slug: string) => void }) {
  const t = useTranslations('Marketplace.hosts');
  const { data, isLoading, isError, error } = useFeaturedShops(LIMIT);
  const shops = data?.shops ?? [];

  if (!isLoading && !isError && shops.length === 0) return null;

  return (
    <YStack gap={layout.block}>
      <SectionHeader title={t('title')} subtitle={t('subtitle')} />

      {isError ? (
        <SectionError title={t('loadError')} error={error} />
      ) : isLoading ? (
        <YStack gap={space.sm}>
          {Array.from({ length: 3 }, (_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </YStack>
      ) : (
        <YStack gap={space.sm}>
          {shops.map((shop) => (
            <HostRow
              key={shop.slug}
              shop={shop}
              {...(onOpenShop ? { onPress: () => onOpenShop(shop.slug) } : {})}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

function HostRow({ shop, onPress }: { shop: PublicShopSummary; onPress?: () => void }) {
  const t = useTranslations('Marketplace.hosts');
  const fmt = useAppFormat();

  const rating = Number(shop.ratingAvg);
  const hasRating = shop.ratingCount > 0 && Number.isFinite(rating);

  return (
    <Card lift="flat" {...(onPress ? { onPress, accessibilityLabel: shop.name } : {})}>
      <XStack ai="center" gap={space.md}>
        <Avatar name={shop.name} url={shop.logoUrl} size={44} />

        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
            {shop.name}
          </Text>
          <XStack ai="center" gap={space.xs}>
            {shop.provinceName ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {shop.provinceName}
              </Text>
            ) : null}
            <Text col={colors.placeholder} fos={fontSize.bodySm}>
              ·
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('vehicleCount', { count: shop.vehicleCount })}
            </Text>
          </XStack>
        </YStack>

        {hasRating ? (
          <XStack ai="center" gap={2}>
            <Ionicons name="star" size={13} color={colors.primary} />
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {fmt.rating(rating)}
            </Text>
          </XStack>
        ) : (
          <XStack bg={colors.successSurface} br={radius.sm} px={space.sm} py={2}>
            <Text col={colors.success} fos={fontSize.label} fow={fontWeight.medium}>
              {t('newBadge')}
            </Text>
          </XStack>
        )}
      </XStack>
    </Card>
  );
}
