import { memo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { CardHighlightOverlay, useCardHighlightBorder } from '@/components/ui/CardHighlight';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { PALETTES, fontSize, fontWeight, space } from '@/theme/tokens';
import { useFeaturedShops } from '../hooks/use-marketplace-data';
import type { PublicShopSummary } from '../api';
import { BrandMark } from '../../catalog/components/BrandMark';
import { HomeCardAvatar } from './home/HomeCardAvatar';
import { HomeCarousel } from './home/HomeCarousel';
import { ScrollReveal } from '@/components/motion/ScrollReveal';
import { STAR_ART } from './home/home-art';
import { HomeSectionHeading } from './home/HomeSectionHeading';
import { SectionError } from './SectionError';

/** Ba trang × ba thẻ — cùng con số với web; nhiều hơn là thành danh bạ, không còn là "nổi bật". */
const LIMIT = 9;
const CARD_RADIUS = toPx(XP_TOKENS['border-radius-card']);
/** Dãy logo hãng (Figma `21965:28698`): tối đa 3 logo 24px cách 2 + ô "+N" 20px. */
const BRAND_LOGO = 24;
const BRAND_MORE = 20;

/**
 * "Gian hàng nổi bật — Những chủ xe được khách đánh giá cao" (design v2, ADR 0062).
 *
 * Shop đang hoạt động có xe công khai, sắp theo điểm đánh giá (`/public/shops`). Điểm, số xe, số
 * chuyến đã hoàn thành và logo các hãng xe đều từ backend. Chưa có gian hàng nào thì ẩn cả khối.
 *
 * `onOpenShop` vắng mặt = thẻ chỉ hiển thị.
 */
function FeaturedHostsImpl({ onOpenShop }: { onOpenShop?: (slug: string) => void }) {
  const t = useTranslations('Home.owners');
  const { data, isLoading, isError, error } = useFeaturedShops(LIMIT);
  const shops = data?.shops ?? [];
  const [active, setActive] = useState(0);

  if (!isLoading && !isError && shops.length === 0) return null;

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading kicker={t('kicker')} title={t('title')} />

      {isError ? (
        <SectionError title={t('loadError')} error={error} />
      ) : isLoading ? (
        <YStack gap={space.sm}>
          {Array.from({ length: 2 }, (_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </YStack>
      ) : (
        // Dải thẻ tự hiện khi CHÍNH NÓ cuộn vào màn, không theo tiêu đề khối.
        <ScrollReveal>
        <HomeCarousel accessibilityLabel={t('title')} overhang onActiveChange={setActive}>
          {shops.map((shop, index) => (
            <HostCard
              key={shop.slug}
              shop={shop}
              active={index === active}
              {...(onOpenShop ? { onPress: () => onOpenShop(shop.slug) } : {})}
            />
          ))}
        </HomeCarousel>
        </ScrollReveal>
      )}
    </YStack>
  );
}

/** Thẻ gian hàng — bản native của `.card` trong `FeaturedHosts.module.css` web (≤640px). */
function HostCard({
  shop,
  active,
  onPress,
}: {
  shop: PublicShopSummary;
  active: boolean;
  onPress?: () => void;
}) {
  // Figma dark (`19879:66136`): thẻ gian hàng VẪN là thẻ sáng (nền trắng, chữ tối) trên nền tối.
  const colors = PALETTES.light.colors;
  const dark = false;
  // Figma dark: viền thẻ #414651, tên gian hàng vàng nhạt, mô tả xám sáng.
  const restBorder = dark ? colors.border : colors.surface;
  const nameColor = dark ? colors.primary : colors.text;
  const mutedColor = dark ? XP_TOKENS['color-text-on-dark-muted'] : colors.textMuted;
  const t = useTranslations('Home.owners');
  // Cùng một cách viết điểm "4,9 (12)" với thẻ xe — một câu, một bản dịch.
  const tCard = useTranslations('Listings.card');
  const fmt = useAppFormat();
  const rating = Number(shop.ratingAvg);
  const hasRating = (shop.ratingCount ?? 0) > 0 && Number.isFinite(rating);
  const completed = shop.completedTripCount ?? 0;
  // Figma: chữ 14px dòng 22.
  const bodyLine = 22;
  const [pressed, setPressed] = useState(false);
  // Thẻ đang ở giữa băng chuyền hoặc đang nhấn: trạng thái nổi DÙNG CHUNG (`CardHighlight`).
  const highlighted = active || pressed;
  const highlightBorder = useCardHighlightBorder();

  const body = (
    <YStack
      p={space.md}
      gap={12}
      br={CARD_RADIUS}
      bw={1}
      // Web: viền cùng màu nền thẻ — chỉ có bóng; khi nổi thì viền vàng chung.
      bc={highlighted ? highlightBorder : restBorder}
      bg={colors.surface}
      // Thẻ luôn sáng (kể cả giao diện tối) nên luôn mang bóng thẻ.
      style={elevation.card}
    >
      {highlighted ? <CardHighlightOverlay radius={CARD_RADIUS} /> : null}

      <XStack ai="flex-start" jc="space-between" gap={space.sm}>
        <XStack f={1} minWidth={0} ai="center" gap={12}>
        <HomeCardAvatar
          name={shop.name}
          url={shop.logoUrl}
          size={48}
          verified={shop.verified}
          markDisc={14}
          markIcon={10}
        />
        <YStack f={1} minWidth={0}>
          <Text col={nameColor} fos={fontSize.h4} lh={24} fow={fontWeight.semibold} numberOfLines={1}>
            {shop.name}
          </Text>
          <XStack ai="center" gap={6}>
            <Text col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
              {t('vehicleCount', { count: shop.vehicleCount })}
            </Text>
            {shop.provinceName ? (
              <>
                <YStack w={4} h={4} br={2} bg={colors.textMuted} />
                <XStack ai="center" gap={2} f={1} minWidth={0}>
                  <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                  <Text col={colors.textMuted} fos={fontSize.body} numberOfLines={1} flexShrink={1}>
                    {shop.provinceName}
                  </Text>
                </XStack>
              </>
            ) : null}
          </XStack>
        </YStack>
        </XStack>
        <BrandLogos brands={shop.brands ?? []} total={shop.brandCount ?? 0} />
      </XStack>

      {/* Giới thiệu: hai dòng, giữ chỗ hai dòng kể cả khi trống để chân các thẻ thẳng hàng. */}
      <Text
        col={mutedColor}
        fos={fontSize.body}
        lh={bodyLine}
        minHeight={bodyLine * 2}
        numberOfLines={2}
      >
        {shop.bio ?? ''}
      </Text>

      <XStack
        ai="center"
        jc="space-between"
        gap={12}
        pt={12}
        borderTopWidth={1}
        borderTopColor={dark ? colors.border : colors.background}
        mt="auto"
      >
        {/* Máy hẹp: điểm + lượt thuê XUỐNG DÒNG thay vì bị "Xem gian hàng" đè lên (người dùng báo 29/10/2026). */}
        <XStack ai="center" columnGap={12} rowGap={2} flexWrap="wrap" f={1} minWidth={0}>
          {hasRating ? (
            <XStack ai="center" gap={space.xs} flexShrink={0}>
              <Ionicons name="star" size={16} color={STAR_ART} />
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
                {tCard.rich('ratingValue', {
                  rating: fmt.rating(rating),
                  count: shop.ratingCount ?? 0,
                  muted: (chunks) => (
                    <Text col={colors.placeholder} fow={fontWeight.regular}>
                      {chunks}
                    </Text>
                  ),
                })}
              </Text>
            </XStack>
          ) : null}
          {completed > 0 ? (
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1} flexShrink={0}>
              {t.rich('rentals', {
                count: completed,
                label: (chunks) => (
                  <Text col={colors.placeholder} fow={fontWeight.regular}>
                    {chunks}
                  </Text>
                ),
              })}
            </Text>
          ) : null}
        </XStack>
        {onPress ? (
          <Text
            col={colors.primaryHover}
            fos={fontSize.body}
            fow={fontWeight.semibold}
            numberOfLines={1}
            flexShrink={0}
          >
            {t('viewShop')}
          </Text>
        ) : null}
      </XStack>
    </YStack>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="link"
      accessibilityLabel={t('viewShopAria', { name: shop.name })}
    >
      {body}
    </Pressable>
  );
}

/** Dãy logo hãng — bản native của `BrandLogos` web; hãng chưa có logo hiện chữ cái đầu (`BrandMark`). */
function BrandLogos({ brands, total }: { brands: PublicShopSummary['brands']; total: number }) {
  const colors = PALETTES.light.colors;
  const rest = total - brands.length;
  if (brands.length === 0) return null;
  return (
    <XStack ai="center" gap={2} accessibilityLabel={brands.map((b) => b.label).join(', ')}>
      {brands.map((b) => (
        <BrandMark key={b.label} label={b.label} iconUrl={b.iconUrl} size={BRAND_LOGO} />
      ))}
      {rest > 0 ? (
        <YStack minWidth={BRAND_MORE} h={BRAND_MORE} px={2} br={BRAND_MORE / 2} bg={colors.background} ai="center" jc="center">
          <Text col={colors.textPlaceholder} fos={fontSize.bodySm} lh={18}>
            +{rest}
          </Text>
        </YStack>
      ) : null}
    </XStack>
  );
}

/**
 * Bọc `memo`: trang chủ chạy lại vì đủ thứ (cuộn, ô tìm kiếm, banner) — khối này chỉ cần dựng lại
 * khi dữ liệu của nó đổi. Nơi gọi truyền hàm ỔN ĐỊNH (`useCallback`).
 */
export const FeaturedHosts = memo(FeaturedHostsImpl);
