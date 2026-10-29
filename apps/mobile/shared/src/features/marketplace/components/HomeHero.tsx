import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { webAssetUrl } from '@/lib/web-base-url';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppActive } from '@/hooks/use-app-active';
import { useScreenFocused } from '@/hooks/use-screen-focused';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { duration } from '@/theme/motion';
import type { PublicBanner } from '../api';

/** Tỉ lệ ảnh banner mobile của backend (780×390) — cùng tỉ lệ web dùng dưới 640px. */
const BANNER_RATIO = 780 / 390;

/** Nhịp tự chuyển slide — 6s, cùng `BannerCarousel` của web. */
const AUTO_ROTATE_MS = 6000;
/**
 * Chấm CHƯA chọn nằm đè lên ẢNH banner — trắng 55% như `BannerCarousel.module.css` web. Không token
 * nào mang độ mờ này (`color-glass*` là 5/10/32%), và nó đứng trên ảnh chứ không trên nền theme.
 */
const DOT_IDLE_ON_PHOTO = 'rgba(255, 255, 255, 0.55)';

/**
 * Vùng banner trang chủ.
 *
 * Chiều cao do TỈ LỆ ảnh quyết định và giữ nguyên qua cả ba trạng thái (đang tải, có banner,
 * không banner) — nhờ vậy thẻ tìm kiếm đè bên dưới không nhảy khi dữ liệu về.
 *
 * Không có banner nào đang bật ⇒ khối mặc định CÙNG KHỔ: ảnh nền + tiêu đề của design v2
 * (`Home.hero`) — đúng như `HomeHero` bên web từ trang chủ v2. Có hay không có banner, trang
 * không đổi hình dạng.
 */
export function HomeHero({ banners, isLoading }: { banners: PublicBanner[]; isLoading: boolean }) {
  const colors = useColors();
  const t = useTranslations('Marketplace.banner');
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  /*
   * Bản sao của `active` để bộ đếm giờ đọc: `setInterval` giữ nguyên closure của lần đăng ký đầu,
   * nên đọc thẳng state trong đó là đọc mãi số 0 — vòng quay sẽ kẹt ở slide thứ hai.
   */
  const activeRef = useRef(0);

  const focused = useScreenFocused();
  // App xuống nền thì dừng vòng quay — không đếm giờ cho một màn không ai nhìn.
  const appActive = useAppActive();
  const reducedMotion = useReducedMotion();

  const height = width / BANNER_RATIO;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      activeRef.current = index;
      setActive(index);
      setDragging(false);
    },
    [width],
  );

  const goTo = useCallback(
    (index: number) => {
      activeRef.current = index;
      setActive(index);
      scrollRef.current?.scrollTo({ x: index * width, animated: true });
    },
    [width],
  );

  /*
   * Tự chuyển slide — dừng khi: người dùng đang tự vuốt, màn không còn tiêu điểm (Tabs giữ màn cũ
   * SỐNG, không dừng thì banner vẫn quay và vẫn vẽ lại sau lưng tab khác), người dùng bật giảm
   * chuyển động, hoặc chỉ còn một banner. Cùng bốn điều kiện `BannerCarousel` của web dừng, dịch
   * sang khái niệm native.
   */
  const count = banners.length;
  useEffect(() => {
    if (count <= 1 || dragging || !focused || !appActive || reducedMotion) return;

    const timer = setInterval(() => goTo((activeRef.current + 1) % count), AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, dragging, focused, appActive, reducedMotion, goTo]);

  // Web: banner tràn viền, góc vuông, thẻ tìm kiếm nằm NGAY dưới (không đè) — chấm vì vậy thấy được.
  const heroCorners: ViewStyle = { overflow: 'hidden' };

  if (isLoading) {
    return (
      <YStack style={heroCorners}>
        <Skeleton width="100%" height={height} />
      </YStack>
    );
  }

  if (count === 0) {
    return <HeroFallback height={height} style={heroCorners} />;
  }

  return (
    <YStack style={heroCorners}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setDragging(true)}
        // Vuốt hụt (thả tay mà không đủ đà) KHÔNG sinh `onMomentumScrollEnd` trên mọi máy — không
        // gỡ cờ ở đây thì một cú chạm nhỡ làm banner đứng im vĩnh viễn.
        onScrollEndDrag={() => setDragging(false)}
        onMomentumScrollEnd={onScroll}
        accessibilityLabel={t('carouselLabel')}
      >
        {banners.map((banner) => (
          <BannerSlide key={banner.id} banner={banner} width={width} height={height} />
        ))}
      </ScrollView>

      {/* Chấm như `BannerCarousel.module.css` (≤640px): trái-dưới, 10px, trắng 55% · vàng đang chọn. */}
      {banners.length > 1 ? (
        <XStack pos="absolute" bottom={10} left={16} gap={8} pointerEvents="none">
          {banners.map((banner, index) => (
            <YStack
              key={banner.id}
              w={10}
              h={10}
              br={radius.pill}
              bg={index === active ? colors.primary : DOT_IDLE_ON_PHOTO}
            />
          ))}
        </XStack>
      ) : null}
    </YStack>
  );
}

/**
 * `memo` không phải để tối ưu sớm — nó là điều kiện để vòng tự chạy không tốn gì.
 *
 * Mỗi nhịp 3s, `HomeHero` đổi state (`active`) và vẽ lại; không chặn ở đây thì cả ba tấm ảnh
 * `expo-image` cùng nhận prop mới mỗi ba giây trong khi không có gì của CHÚNG đổi. Ba prop vào
 * đều ổn định (đối tượng banner đến từ cache query, hai số đo từ bề rộng màn), nên `memo` bỏ
 * qua sạch và chỉ còn hàng chấm chỉ báo vẽ lại.
 */
const BannerSlide = memo(function BannerSlide({
  banner,
  width,
  height,
}: {
  banner: PublicBanner;
  width: number;
  height: number;
}) {
  const colors = useColors();
  // Backend trả ba cỡ ảnh; native luôn bắt đầu từ bản mobile rồi mới lùi dần — tải ảnh desktop
  // trên 4G chỉ để thu nhỏ lại là lãng phí đúng thứ người dùng phải trả tiền.
  const source = webAssetUrl(banner.mobileImageUrl ?? banner.tabletImageUrl ?? banner.imageUrl);

  // Chờ RIÊNG cho tấm ảnh, tách khỏi chờ API: danh sách về không có nghĩa là ẢNH về, và
  // `<Image>` vẽ ô rỗng cho tới byte cuối — trên banner tràn viền nó đọc ra như màn hình trắng.
  /*
   * Mờ dần do CHÍNH expo-image lo (`transition`). Bản cũ bọc ảnh trong `Animated.View` có
   * `opacity` đọc state JS qua worklet — trên máy thật lớp đó kẹt ở 0 nên banner chỉ còn ô nền
   * tối dù ảnh đã tải xong.
   */
  const image = (
    <YStack w={width} h={height} bg={colors.surfaceMuted}>
      <Image
        source={{ uri: source }}
        style={{ width, height }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={duration.base}
        accessibilityLabel={banner.altText}
      />
    </YStack>
  );

  // Banner chỉ hiển thị: đích của nó là link web, app không mở trình duyệt ra ngoài.
  return image;
});

/**
 * Khối mặc định khi chưa có banner — ảnh nền `hero-fallback` của web, chữ đè góc trái-trên như
 * bản vẽ mobile v2 (`19771:52810`). Lớp mờ trắng bên trái giữ chữ tối đọc được trên ảnh.
 */
function HeroFallback({ height, style }: { height: number; style: ViewStyle }) {
  const colors = useColors();
  const t = useTranslations('Home.hero');

  return (
    <YStack w="100%" h={height} bg={colors.surfaceMuted} style={style}>
      <Image
        source={images.homeHeroFallback}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="right"
        accessibilityElementsHidden
      />
      <LinearGradient
        colors={[colors.surface, 'transparent']}
        locations={[0.25, 0.8]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <YStack px={space.md} pt={space.lg} gap={space.xs} maxWidth="70%" accessibilityRole="header">
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        <Text col={colors.primary} fos={fontSize.h2} fow={fontWeight.bold}>
          {t('titleAccent')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('subtitle')}
        </Text>
      </YStack>
    </YStack>
  );
}
