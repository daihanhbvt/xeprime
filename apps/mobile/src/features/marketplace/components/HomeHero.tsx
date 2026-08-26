import { useCallback, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { duration, easing } from '@/theme/motion';
import type { PublicBanner } from '../api';

/** Tỉ lệ ảnh banner mobile của backend (780×390) — cùng tỉ lệ web dùng dưới 640px. */
const BANNER_RATIO = 780 / 390;

/**
 * Vùng banner trang chủ.
 *
 * Chiều cao do TỈ LỆ ảnh quyết định và giữ nguyên qua cả ba trạng thái (đang tải, có banner,
 * không banner) — nhờ vậy thẻ tìm kiếm đè bên dưới không nhảy khi dữ liệu về.
 *
 * Không có banner nào đang bật thì để một nền trơn, KHÔNG viết chữ thay thế: tiêu đề của web
 * là phần dành cho SEO (`<h1>` ẩn thị giác), native không có nhu cầu đó, và một dòng chữ lớn
 * nằm giữa chỗ đáng ra là ảnh trông như trang bị lỗi.
 */
export function HomeHero({
  banners,
  isLoading,
}: {
  banners: PublicBanner[];
  isLoading: boolean;
}) {
  const t = useTranslations('Marketplace.banner');
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);

  const height = width / BANNER_RATIO;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setActive(Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)));
    },
    [width],
  );

  if (isLoading) {
    return <Skeleton width="100%" height={height} />;
  }

  if (banners.length === 0) {
    return <YStack w="100%" h={height} bg={colors.surfaceMuted} />;
  }

  return (
    <YStack>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        accessibilityLabel={t('carouselLabel')}
      >
        {banners.map((banner) => (
          <BannerSlide key={banner.id} banner={banner} width={width} height={height} />
        ))}
      </ScrollView>

      {/*
        Chỉ báo nằm TRONG khung ảnh và lùi lên trên phần thẻ tìm kiếm đè xuống (`space.xl`),
        nếu không nó bị thẻ che mất và người dùng không biết đang ở slide thứ mấy.

        Nền TRẮNG chứ không phải lớp phủ tối: ảnh banner phần lớn đã tối sẵn, thêm một mảng đen
        mờ nữa là chấm và con số chìm vào ảnh. Trắng đục tách khỏi mọi ảnh, và chấm đang chọn
        dùng luôn màu thương hiệu.

        Một banner thì không có gì để chỉ — ẩn hẳn.
      */}
      {banners.length > 1 ? (
        <XStack
          pos="absolute"
          bottom={space.xl + space.sm}
          right={space.md}
          ai="center"
          gap={space.xs}
          bg={colors.surface}
          br={radius.pill}
          px={space.sm}
          py={space.xs}
        >
          {banners.map((banner, index) => (
            <YStack
              key={banner.id}
              w={index === active ? space.md : space.xs}
              h={space.xs}
              br={radius.pill}
              bg={index === active ? colors.primary : colors.border}
            />
          ))}
          <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold} marginLeft={2}>
            {active + 1}/{banners.length}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  );
}

function BannerSlide({
  banner,
  width,
  height,
}: {
  banner: PublicBanner;
  width: number;
  height: number;
}) {
  // Backend trả ba cỡ ảnh; native luôn bắt đầu từ bản mobile rồi mới lùi dần — tải ảnh desktop
  // trên 4G chỉ để thu nhỏ lại là lãng phí đúng thứ người dùng phải trả tiền.
  const source = banner.mobileImageUrl ?? banner.tabletImageUrl ?? banner.imageUrl;

  // Chờ RIÊNG cho tấm ảnh, tách khỏi chờ API: danh sách về không có nghĩa là ẢNH về, và
  // `<Image>` vẽ ô rỗng cho tới byte cuối — trên banner tràn viền nó đọc ra như màn hình trắng.
  const [loaded, setLoaded] = useState(false);
  const fade = useAnimatedStyle(() => ({
    opacity: withTiming(loaded ? 1 : 0, {
      duration: duration.base,
      easing: Easing.bezier(...easing.standard),
    }),
  }));

  const image = (
    <YStack w={width} h={height} bg={colors.surfaceMuted}>
      {loaded ? null : (
        <YStack pos="absolute" top={0} left={0} right={0} bottom={0}>
          <Skeleton width="100%" height={height} />
        </YStack>
      )}

      <Animated.View style={fade}>
        <Image
          source={{ uri: source }}
          style={{ width, height }}
          resizeMode="cover"
          accessibilityLabel={banner.altText}
          onLoad={() => setLoaded(true)}
          // Ảnh hỏng: dừng nhịp thở — chạy mãi là hứa một tấm ảnh không bao giờ tới.
          onError={() => setLoaded(true)}
        />
      </Animated.View>
    </YStack>
  );

  if (!banner.linkUrl) return image;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={banner.altText}
      onPress={() => {
        // Đích banner là URL do admin nhập, có thể trỏ ra ngoài app — mở bằng trình duyệt hệ
        // thống. Không mở được (đường dẫn hỏng) thì im lặng: banner là mục marketing, không
        // đáng dựng một hộp thoại lỗi chắn trang chủ.
        void Linking.openURL(banner.linkUrl as string).catch(() => undefined);
      }}
    >
      {image}
    </Pressable>
  );
}
