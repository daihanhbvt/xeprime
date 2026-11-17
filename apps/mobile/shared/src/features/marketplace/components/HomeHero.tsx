import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { XP_TOKENS } from '@xeprime/ui';
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
import { useContentWidth } from '@/theme/use-content-width';
import { TABLET_MIN_WIDTH } from '@/theme/layout';
import { layout } from '@/theme/layout';

/** Tỉ lệ ảnh banner mobile của backend (780×450 từ 30/10/2026, PR #253) — cùng tỉ lệ web dùng dưới 640px. */
export const BANNER_RATIO = 780 / 450;
/** Tỉ lệ banner ở bố cục máy tính bảng — web ≤1024px (`BannerCarousel.module.css` `aspect-ratio: 1024 / 450`). */
export const BANNER_RATIO_TABLET = 1024 / 450;

/** Tỉ lệ banner theo bề ngang CỘT nội dung — dùng chung cho hero và mốc thanh tìm kiếm dính. */
export function bannerRatio(contentWidth: number): number {
  return contentWidth >= TABLET_MIN_WIDTH ? BANNER_RATIO_TABLET : BANNER_RATIO;
}

/** Nhịp tự chuyển slide — 6s, cùng `BannerCarousel` của web. */
const AUTO_ROTATE_MS = 6000;
/**
 * Chấm CHƯA chọn nằm đè lên ẢNH banner — trắng 55% như `BannerCarousel.module.css` web. Không token
 * nào mang độ mờ này (`color-glass*` là 5/10/32%), và nó đứng trên ảnh chứ không trên nền theme.
 */
const DOT_IDLE_ON_PHOTO = 'rgba(255, 255, 255, 0.55)';

/*
 * Thông số chuyển động lấy từ CÙNG token `--xp-motion-*` mà web dùng (`motion.module.css`) — banner
 * app "to nhỏ" đúng nhịp website: phóng tới 1.08 rồi lùi về trong một nhịp 40s (Ken Burns), chữ
 * trượt lên 40 + hiện dần trong 1s, so le 0.2s.
 */
const AMBIENT_SCALE = Number.parseFloat(XP_TOKENS['motion-scale-ambient']);
const AMBIENT_HALF_MS = (Number.parseFloat(XP_TOKENS['motion-duration-ambient']) * 1000) / 2;
const REVEAL_MS = Number.parseFloat(XP_TOKENS['motion-duration-reveal']) * 1000;
const REVEAL_DISTANCE = Number.parseFloat(XP_TOKENS['motion-distance-reveal']);
const STAGGER_MS = 200;

/**
 * Ảnh nền "thở" (Ken Burns) — bản native của `.kenBurns` web: chạy trên KHUNG chứa ảnh, không theo
 * từng slide, nên đổi slide không làm ảnh giật về 1. Chỉ động `transform` trên luồng UI.
 *
 * Tắt (màn mất tiêu điểm, app xuống nền, giảm chuyển động) ⇒ huỷ hoạt cảnh và lùi êm về 1 — không
 * đếm khung hình cho một màn không ai nhìn.
 */
function useKenBurns(enabled: boolean) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!enabled) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: duration.base });
      return;
    }
    scale.value = withRepeat(
      withTiming(AMBIENT_SCALE, { duration: AMBIENT_HALF_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(scale);
  }, [enabled, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/**
 * Một dòng chữ trượt lên + hiện dần — bản native của `.stagger > *` web (`xpFadeInUp`). Chạy một lần
 * khi gắn kết; giảm chuyển động ⇒ hiện ngay, đứng yên.
 */
function RevealLine({
  index,
  reducedMotion,
  children,
}: {
  index: number;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      (index + 1) * STAGGER_MS,
      withTiming(1, { duration: REVEAL_MS, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
    );
  }, [index, reducedMotion, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * REVEAL_DISTANCE }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

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
  const width = useContentWidth();
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

  const tablet = width >= TABLET_MIN_WIDTH;
  const height = width / bannerRatio(width);
  const kenBurns = useKenBurns(focused && appActive && !reducedMotion && !isLoading);

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
    return (
      <HeroFallback
        height={height}
        style={heroCorners}
        imageMotion={kenBurns}
        reducedMotion={reducedMotion}
      />
    );
  }

  return (
    <YStack style={heroCorners}>
      <Animated.View style={kenBurns}>
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
            <BannerSlide
              key={banner.id}
              banner={banner}
              width={width}
              height={height}
              tablet={tablet}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {/* Chấm như `BannerCarousel.module.css` (≤640px): trái-dưới, 10px, trắng 55% · vàng đang chọn. */}
      {banners.length > 1 ? (
        <XStack pos="absolute" bottom={10} left={16} gap={8} pointerEvents="none">
          {banners.map((banner, index) => (
            <SlideDot
              key={banner.id}
              active={index === active}
              activeColor={colors.primary}
              reducedMotion={reducedMotion}
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
  tablet,
}: {
  banner: PublicBanner;
  width: number;
  height: number;
  /** Bố cục máy tính bảng: ảnh bản tablet (đúng tỉ lệ 1024/450) như web ≤1024px. */
  tablet: boolean;
}) {
  const colors = useColors();
  // Backend trả ba cỡ ảnh; native luôn bắt đầu từ bản mobile rồi mới lùi dần — tải ảnh desktop
  // trên 4G chỉ để thu nhỏ lại là lãng phí đúng thứ người dùng phải trả tiền.
  // Máy tính bảng đi theo web ≤1024px: ảnh tablet, thiếu thì ảnh PC (cùng chuỗi lùi của web).
  const source = webAssetUrl(
    tablet
      ? (banner.tabletImageUrl ?? banner.imageUrl)
      : (banner.mobileImageUrl ?? banner.tabletImageUrl ?? banner.imageUrl),
  );

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
function HeroFallback({
  height,
  style,
  imageMotion,
  reducedMotion,
}: {
  height: number;
  style: ViewStyle;
  imageMotion: ReturnType<typeof useKenBurns>;
  reducedMotion: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Home.hero');

  return (
    <YStack w="100%" h={height} bg={colors.surfaceMuted} style={style}>
      {/* Neo phóng mép PHẢI (chủ thể ảnh nằm bên phải, chữ bên trái) — như `transform-origin` web. */}
      <Animated.View style={[StyleSheet.absoluteFill, KEN_BURNS_ORIGIN_RIGHT, imageMotion]}>
        <Image
          source={images.homeHeroFallback}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="right"
          accessibilityElementsHidden
        />
      </Animated.View>
      <LinearGradient
        colors={[colors.surface, 'transparent']}
        locations={[0.25, 0.8]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <YStack px={layout.padX} pt={space.lg} gap={space.xs} maxWidth="70%" accessibilityRole="header">
        <RevealLine index={0} reducedMotion={reducedMotion}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('title')}
          </Text>
        </RevealLine>
        <RevealLine index={1} reducedMotion={reducedMotion}>
          <Text col={colors.primary} fos={fontSize.h2} fow={fontWeight.bold}>
            {t('titleAccent')}
          </Text>
        </RevealLine>
        <RevealLine index={2} reducedMotion={reducedMotion}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('subtitle')}
          </Text>
        </RevealLine>
      </YStack>
    </YStack>
  );
}

const KEN_BURNS_ORIGIN_RIGHT = { transformOrigin: 'right center' } as const;

/**
 * Chấm chỉ báo slide — chấm đang chọn KÉO DÀI thành viên thuốc (10 → 24) thay vì chỉ đổi màu, kiểu
 * phân trang Swiper của hai trang mẫu: mắt bắt được lúc slide đổi. Chỉ động bề ngang của một khối
 * 10pt nên rẻ; giảm chuyển động ⇒ nhảy thẳng tới cỡ đích.
 */
function SlideDot({
  active,
  activeColor,
  reducedMotion,
}: {
  active: boolean;
  activeColor: string;
  reducedMotion: boolean;
}) {
  const width = useSharedValue(active ? DOT_ACTIVE_WIDTH : DOT_SIZE);
  useEffect(() => {
    const target = active ? DOT_ACTIVE_WIDTH : DOT_SIZE;
    width.value = reducedMotion ? target : withTiming(target, { duration: duration.base });
  }, [active, reducedMotion, width]);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  return (
    <Animated.View
      style={[
        style,
        {
          height: DOT_SIZE,
          borderRadius: radius.pill,
          backgroundColor: active ? activeColor : DOT_IDLE_ON_PHOTO,
        },
      ]}
    />
  );
}

const DOT_SIZE = 10;
const DOT_ACTIVE_WIDTH = 24;
