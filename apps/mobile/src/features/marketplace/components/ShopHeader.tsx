import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { ShopCover, ShopLogo, SHOP_LOGO } from '@/components/ui/ShopCover';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { PublicShop } from '../api';

/**
 * Đầu trang gian hàng công khai (MKT-05) — bản native của
 * `apps/web/src/features/marketplace/components/ShopHeader.tsx`.
 *
 * Cùng dữ liệu, cùng thứ tự: bìa → logo → tên → tỉnh · điểm đánh giá → gọi → giới thiệu → địa
 * chỉ. Chỉ dữ liệu CÔNG KHAI, không có gì phải đăng nhập mới xem được.
 *
 * Khác web ở nút gọi: web là `<a href="tel:">` nằm cùng hàng với tên; native đưa xuống thành
 * một nút đủ 44dp vì đây là hành động chính của trang này trên điện thoại — khách xem gian hàng
 * thường là để hỏi trước khi đặt.
 *
 * Bìa và logo lấy từ `ShopCover`/`ShopLogo` — CÙNG hiện thực với `ShopIdentityCard` bên khu
 * quản lý, vì khối đó là bản xem trước của chính màn này.
 */
export function ShopHeader({ shop }: { shop: PublicShop }) {
  const t = useTranslations('Shops.header');
  const fmt = useAppFormat();

  const rating = Number(shop.ratingAvg);
  const hasRating = shop.ratingCount > 0 && Number.isFinite(rating);

  return (
    <YStack>
      <ShopCover url={shop.coverUrl} />

      <YStack px={layout.screenX} gap={space.sm} mt={-SHOP_LOGO / 2}>
        <ShopLogo url={shop.logoUrl} name={shop.name} />

        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {shop.name}
          </Text>

          <XStack ai="center" gap={space.sm} flexWrap="wrap">
            {shop.provinceName ? (
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="location-outline" size={iconSize.xs} color={colors.textMuted} />
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {shop.provinceName}
                </Text>
              </XStack>
            ) : null}

            <XStack ai="center" gap={space.xs}>
              <Ionicons name="star" size={iconSize.xs} color={colors.primary} />
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {hasRating
                  ? t('rating', { avg: fmt.rating(rating), count: shop.ratingCount })
                  : t('noRating')}
              </Text>
            </XStack>
          </XStack>
        </YStack>

        {shop.phone ? (
          <XStack>
            <Button
              label={t('call', { phone: shop.phone })}
              variant="secondary"
              size="sm"
              icon="call-outline"
              block={false}
              onPress={() => void Linking.openURL(`tel:${shop.phone}`)}
            />
          </XStack>
        ) : null}

        {shop.bio ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {shop.bio}
          </Text>
        ) : null}

        {shop.address ? (
          <XStack ai="flex-start" gap={space.xs}>
            <Ionicons name="business-outline" size={iconSize.xs} color={colors.placeholder} />
            <Text col={colors.placeholder} fos={fontSize.bodySm} f={1}>
              {shop.address}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </YStack>
  );
}
