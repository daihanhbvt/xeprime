import { Ionicons } from '@/components/icons/Ionicons';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/motion/PressableScale';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { pressScale, scrollThrottle } from '@/theme/motion';
import { layout } from '@/theme/layout';
import { useResponsive } from '@/theme/use-responsive';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, market, radius, space } from '@/theme/tokens';
import { VehicleGalleryThumbs } from './VehicleGalleryThumbs';

/** Tỉ lệ ảnh 358 × 170 của bản vẽ mobile (web ≤640px `.slide { aspect-ratio: 358 / 170 }`). */
export const VEHICLE_PHOTO_RATIO = 358 / 170;

/** Khe giữa hai ảnh khi trượt — `.grid { gap: space-sm }` của web ≤640px. */
const SLIDE_GAP = space.sm;

/*
 * Hiệu ứng theo cuộn (chỉ khi nơi gọi truyền `scrollOffset` — trang chi tiết xe của khách):
 * kéo quá đỉnh thì giãn (scale 1 + kéo/cao ảnh, tối đa `GALLERY_MAX_STRETCH`); cuộn xuống thì
 * trôi chậm hơn nội dung (`GALLERY_PARALLAX`) và mờ dần.
 */
const GALLERY_PARALLAX = 0.4;
const GALLERY_MAX_STRETCH = 0.35;

/** Ảnh lệch khỏi tâm co về tỉ lệ này. */
const SLIDE_SIDE_SCALE = 0.92;
const SLIDE_SIDE_OPACITY = 0.6;

/** Một ảnh của thư viện, kèm nhãn góc chụp ("Nội thất"…) khi có. */
export interface VehicleGalleryPhoto {
  url: string;
  label?: string | null;
}

/** Một ảnh của băng chuyền: co + mờ theo khoảng cách tới tâm (chỉ transform/opacity). */
function GallerySlide({
  index,
  step,
  scrollX,
  still,
  children,
}: {
  index: number;
  step: number;
  scrollX: SharedValue<number>;
  still: boolean;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: 1, transform: [{ scale: 1 }] };
    const range = [(index - 1) * step, index * step, (index + 1) * step];
    return {
      opacity: interpolate(
        scrollX.value,
        range,
        [SLIDE_SIDE_OPACITY, 1, SLIDE_SIDE_OPACITY],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            scrollX.value,
            range,
            [SLIDE_SIDE_SCALE, 1, SLIDE_SIDE_SCALE],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Thư viện ảnh xe — băng chuyền ảnh thụt lề (vuốt ngang, ảnh hai bên co + mờ), bộ đếm "n/N" nổi
 * góc dưới-phải, dải ảnh nhỏ bên dưới, chạm ảnh mở trình xem toàn màn.
 *
 * Gốc là thư viện của trang chi tiết xe app KHÁCH (bản native của `ListingGallery` web ≤640px).
 * Tách ra 10/11/2026 để thẻ xe phía CHỦ XE dùng CÙNG bố cục (người dùng chốt: "các layout xe như
 * thế này thì lấy bên đó qua"). Mặc định giữ nguyên trang khách: cả bề ngang nội dung, lề
 * `layout.screenX`, đệm 12 trên/dưới. Trong một thẻ: truyền `width` (bề ngang thẻ đo lúc layout) +
 * `inset` (đệm thẻ) + `padded={false}`.
 *
 * Phần RIÊNG của nơi gọi đi qua `overlay` (vd. nút máy ảnh "Đổi ảnh" của chủ xe) — thư viện không
 * biết gì về yêu thích, đặt xe hay quyền sửa.
 */
export function VehicleGallery({
  name,
  photos,
  scrollOffset,
  width,
  inset = layout.screenX,
  padded = true,
  showLabels = false,
  overlay,
}: {
  /** Tên xe — cho nhãn trợ năng của từng ảnh. */
  name: string;
  /** Ảnh theo thứ tự hiển thị (ảnh bìa đầu tiên). Trùng URL tự gộp. */
  photos: readonly VehicleGalleryPhoto[];
  scrollOffset?: SharedValue<number> | undefined;
  /** Bề ngang vùng chứa (gồm cả lề). Vắng = bề ngang nội dung của màn. */
  width?: number | undefined;
  inset?: number;
  /** Đệm 12 trên/dưới như trang khách. Trong thẻ thì tắt — thẻ tự lo khoảng cách. */
  padded?: boolean;
  /** Vẽ nhãn góc chụp dưới các ô ảnh nhỏ (phía chủ xe). */
  showLabels?: boolean;
  /** Lớp phủ lên khung ảnh lớn (không chặn vuốt — tự đặt `pointerEvents` khi cần). */
  overlay?: ReactNode;
}) {
  const colors = useColors();
  const { contentWidth } = useResponsive();
  const [active, setActive] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const pagerRef = useRef<Animated.ScrollView>(null);
  // Vị trí cuộn ngang trên luồng UI — ảnh hai bên co nhẹ + mờ đi (hiệu ứng thẻ băng chuyền).
  const scrollX = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const onPagerScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });
  const tGallery = useTranslations('Listings.detail.gallery');
  const tStates = useTranslations('Common.states');

  // Ảnh chính đứng đầu và không lặp lại nếu nó cũng nằm trong thư viện.
  const unique = photos.filter(
    (photo, index) => photos.findIndex((other) => other.url === photo.url) === index,
  );
  const urls = unique.map((photo) => photo.url);
  const containerWidth = width ?? contentWidth;
  // Ảnh THỤT trong lề (web ≤640px `.slide`, Figma `19771:72122`): rộng = bề ngang trừ hai lề.
  const slideWidth = Math.max(containerWidth - inset * 2, 0);
  const height = slideWidth / VEHICLE_PHOTO_RATIO;
  // Mỗi trang cuộn = một ảnh + khe giữa hai ảnh.
  const step = slideWidth + SLIDE_GAP;

  const verticalStyle = useAnimatedStyle(() => {
    if (!scrollOffset || reduceMotion) return {};
    const y = scrollOffset.value;
    if (y < 0) {
      // Giãn khi kéo quá đỉnh — dịch nửa quãng kéo để mép trên ảnh bám theo ngón tay.
      return {
        transform: [
          { translateY: y / 2 },
          { scale: 1 + Math.min(-y / Math.max(height, 1), GALLERY_MAX_STRETCH) },
        ],
      };
    }
    return {
      opacity: interpolate(y, [0, height], [1, 0.4], Extrapolation.CLAMP),
      transform: [{ translateY: y * GALLERY_PARALLAX }],
    };
  });

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setActive(Math.round(event.nativeEvent.contentOffset.x / Math.max(step, 1)));
    },
    [step],
  );

  const jumpTo = useCallback(
    (index: number) => {
      setActive(index);
      pagerRef.current?.scrollTo({ x: index * step, animated: true });
    },
    [step],
  );

  const pad = padded ? 12 : 0;

  if (unique.length === 0) {
    return (
      <YStack px={inset} py={pad}>
        <YStack h={height} br={radius.control} bg={colors.surfaceMuted} ai="center" jc="center">
          <Ionicons name="car-sport-outline" size={48} color={colors.border} />
        </YStack>
        {overlay ? (
          <YStack pos="absolute" top={pad} left={inset} w={slideWidth} h={height}>
            {overlay}
          </YStack>
        ) : null}
      </YStack>
    );
  }

  return (
    // `.wrap` ≤640px: đệm 12 trên/dưới; dải ảnh nhỏ cách ảnh 8.
    <YStack py={pad} gap={space.sm}>
      <Animated.View style={verticalStyle}>
        <Animated.ScrollView
          ref={pagerRef}
          horizontal
          onScroll={onPagerScroll}
          scrollEventThrottle={scrollThrottle.frame}
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={{ paddingHorizontal: inset, gap: SLIDE_GAP }}
          onMomentumScrollEnd={onScroll}
        >
          {unique.map((photo, index) => (
            <GallerySlide
              key={photo.url}
              index={index}
              step={step}
              scrollX={scrollX}
              still={reduceMotion || unique.length < 2}
            >
              <PressableScale
                scaleTo={pressScale.card}
                onPress={() => setViewing(photo.url)}
                accessibilityRole="imagebutton"
                accessibilityLabel={
                  photo.label ?? tGallery('photoAlt', { name, index: index + 1 })
                }
              >
                <Image
                  source={{ uri: photo.url }}
                  style={{ width: slideWidth, height, borderRadius: radius.control }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={photo.url}
                  transition={150}
                />
              </PressableScale>
            </GallerySlide>
          ))}
        </Animated.ScrollView>

        {overlay ? (
          <YStack pos="absolute" top={0} left={inset} w={slideWidth} h={height}>
            {overlay}
          </YStack>
        ) : null}

        {/*
          Bộ đếm "n/N" nổi góc dưới-phải ảnh — `.counter` web ≤640px: nền đen 55% CỐ ĐỊNH (nó nằm
          trên ảnh, không trên nền trang), chữ `text-on-dark` 12.
        */}
        {unique.length > 1 ? (
          <XStack
            pos="absolute"
            bottom={space.sm}
            right={inset + space.sm}
            bg={market.photoScrim}
            br={radius.pill}
            px={space.sm}
            py={2}
            pointerEvents="none"
          >
            <Text col={market.onDark} fos={fontSize.bodySm}>
              {active + 1}/{unique.length}
            </Text>
          </XStack>
        ) : null}
      </Animated.View>

      {unique.length > 1 ? (
        <VehicleGalleryThumbs
          urls={urls}
          active={active}
          onSelect={jumpTo}
          width={containerWidth}
          inset={inset}
          {...(showLabels ? { labels: unique.map((photo) => photo.label ?? null) } : {})}
        />
      ) : null}

      <PhotoViewer
        url={viewing}
        unavailableLabel={tStates('imageUnavailable')}
        onClose={() => setViewing(null)}
      />
    </YStack>
  );
}
