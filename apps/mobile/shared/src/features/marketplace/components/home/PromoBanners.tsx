import { KenBurns } from '@/components/motion/KenBurns';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import type { PublicBanner } from '../../api';
import { HomeCarousel } from './HomeCarousel';
import { webAssetUrl } from '@/lib/web-base-url';

/**
 * Thẻ CỐ ĐỊNH 340×140 (Figma MB `19771:51710`, token `promo-banner-mobile-*`), một thẻ mỗi lần, canh
 * giữa — như web ≤640px. Ảnh `cover` vào khung, có ảnh mobile riêng hay không.
 */
const PROMO_CARD = {
  width: toPx(XP_TOKENS['promo-banner-mobile-width']),
  height: toPx(XP_TOKENS['promo-banner-mobile-height']),
};
const PROMO_RATIO = PROMO_CARD.width / PROMO_CARD.height;
/** `.card` web: bo `border-radius-banner` (20 — Figma `21965:5289`). */
const CARD_RADIUS = toPx(XP_TOKENS['border-radius-banner']);

/**
 * Banner KHUYẾN MÃI giữa trang chủ (\`placement = promo\`) — admin quản lý, chữ và giá nằm sẵn
 * trong ảnh nên không có gì để dịch ngoài nhãn của khối.
 *
 * Ảnh hỏng bị loại khỏi băng chuyền; hỏng hết thì cả khối biến mất — cùng luật với web. Nơi gọi
 * không dựng khối khi chưa có banner nào.
 *
 * Banner CHỈ HIỂN THỊ, cùng quyết định với dải banner đầu trang (\`HomeHero\`): đích \`linkUrl\` là
 * địa chỉ của site web, app không mở trình duyệt ra ngoài.
 */
export function PromoBanners({ banners }: { banners: PublicBanner[] }) {
  const colors = useColors();
  const t = useTranslations('Home.promos');
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const { width } = useWindowDimensions();
  const visible = banners.filter((banner) => !broken.has(banner.id));
  if (visible.length === 0) return null;

  return (
    // MỘT banner mỗi lần (như web ≤640px): slide rộng trọn khung nội dung, thẻ 340×140 canh giữa —
    // thẻ kế nằm ngoài màn, người dùng vuốt sang.
    <HomeCarousel accessibilityLabel={t('label')} itemWidth={width - layout.screenX * 2}>
      {visible.map((banner) => (
        <YStack key={banner.id} w="100%" ai="center">
        <YStack
          w={PROMO_CARD.width}
          h={PROMO_CARD.height}
          br={CARD_RADIUS}
          ov="hidden"
          bg={colors.surfaceMuted}
        >
          {/* Ken Burns chậm như hero — chỉ transform, khung ngoài clip. */}
          <KenBurns style={{ width: '100%', height: '100%' }}>
          <Image
            source={{ uri: webAssetUrl(banner.mobileImageUrl ?? banner.imageUrl) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            accessibilityLabel={banner.altText}
            onError={() => setBroken((prev) => new Set(prev).add(banner.id))}
          />
          </KenBurns>
        </YStack>
        </YStack>
      ))}
    </HomeCarousel>
  );
}

/**
 * Giữ chỗ khối khuyến mãi lúc danh sách banner chưa về — cùng khung tỉ lệ ảnh mobile, nên khi
 * banner hiện ra phần dưới trang chủ không bị đẩy xuống.
 */
export function PromoBannersSkeleton() {
  return (
    <YStack w="100%" ai="center">
      <YStack w={PROMO_CARD.width} br={CARD_RADIUS} ov="hidden">
        <Skeleton aspectRatio={PROMO_RATIO} />
      </YStack>
    </YStack>
  );
}
