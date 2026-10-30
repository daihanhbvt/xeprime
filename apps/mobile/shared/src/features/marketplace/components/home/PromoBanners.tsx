import { Image } from 'expo-image';
import { useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { useColors } from '@/theme/ThemeProvider';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import type { PublicBanner } from '../../api';
import { HomeCarousel } from './HomeCarousel';
import { webAssetUrl } from '@/lib/web-base-url';

/**
 * Tỉ lệ khung của `PROMO_BANNER_SLOTS` bên web — ảnh mobile 680×400; banner không có ảnh mobile
 * thì hiện ảnh máy tính (1168×360) nguyên khung, như web dưới 640px.
 */
const MOBILE_RATIO = 680 / 400;
const DESKTOP_RATIO = 1168 / 360;
/** `.card` web: bo `border-radius-card`. */
const CARD_RADIUS = toPx(XP_TOKENS['border-radius-card']);

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
  const visible = banners.filter((banner) => !broken.has(banner.id));
  if (visible.length === 0) return null;

  return (
    <HomeCarousel accessibilityLabel={t('label')}>
      {visible.map((banner) => (
        <YStack
          key={banner.id}
          w="100%"
          aspectRatio={banner.mobileImageUrl ? MOBILE_RATIO : DESKTOP_RATIO}
          br={CARD_RADIUS}
          ov="hidden"
          bg={colors.surfaceMuted}
        >
          <Image
            source={{ uri: webAssetUrl(banner.mobileImageUrl ?? banner.imageUrl) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            accessibilityLabel={banner.altText}
            onError={() => setBroken((prev) => new Set(prev).add(banner.id))}
          />
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
    <YStack w="100%" br={CARD_RADIUS} ov="hidden">
      <Skeleton aspectRatio={MOBILE_RATIO} />
    </YStack>
  );
}
