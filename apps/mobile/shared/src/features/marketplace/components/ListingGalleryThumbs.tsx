import { useEffect, useMemo, useRef } from 'react';
import { PixelRatio, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useTranslations } from 'use-intl';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Số ô vừa khít bề rộng nội dung — một xe thường có 5 ảnh, nên 5 ảnh thì không ô nào bị cắt. */
export const GALLERY_THUMBS_PER_VIEW = 5;
/**
 * Chặn dưới / trên của bề rộng một ô (dp). Màn rất hẹp: không co dưới 56 nữa mà để dải cuộn ngang;
 * màn rộng (máy tính bảng): không phình quá 88 thành ảnh to vô nghĩa.
 */
export const GALLERY_THUMB_MIN_WIDTH = 56;
export const GALLERY_THUMB_MAX_WIDTH = 88;
/** Ô 4:3 nằm ngang như ảnh xe. */
const THUMB_RATIO = 4 / 3;
const THUMB_GAP = space.sm;
const THUMB_BORDER = 2;
/** Ảnh không chọn mờ đi để ô đang xem nổi lên. */
const INACTIVE_OPACITY = 0.55;

/**
 * Bề rộng một ô để `GALLERY_THUMBS_PER_VIEW` ô + khe lấp đúng bề rộng nội dung, kẹp trong
 * [min, max]. Làm tròn XUỐNG theo điểm ảnh thật của máy: làm tròn lên dù nửa điểm ảnh cũng đủ để
 * ô thứ năm lòi ra ngoài và dải tự bật cuộn.
 */
export function galleryThumbWidth(contentWidth: number, pixelRatio: number): number {
  const fit =
    (contentWidth - (GALLERY_THUMBS_PER_VIEW - 1) * THUMB_GAP) / GALLERY_THUMBS_PER_VIEW;
  const clamped = Math.min(GALLERY_THUMB_MAX_WIDTH, Math.max(GALLERY_THUMB_MIN_WIDTH, fit));
  return Math.floor(clamped * pixelRatio) / pixelRatio;
}

/**
 * Dải ảnh nhỏ dưới ảnh chính của trang chi tiết xe. Web desktop trưng lưới 1 lớn + 4 nhỏ; trên
 * điện thoại khung trượt chỉ hiện một ảnh nên khách không biết còn ảnh khác — dải này cho thấy cả
 * bộ ảnh trong một cái liếc. Lề trái/phải bằng lề nội dung của màn (`layout.screenX`), 5 ô vừa khít
 * giữa hai lề; chỉ cuộn ngang khi nhiều hơn 5 ảnh (hoặc màn quá hẹp để giữ cỡ tối thiểu). Chạm ô để
 * nhảy ảnh chính; ảnh chính lướt thì ô đang xem tự cuộn vào tầm nhìn. Một ảnh thì không vẽ gì.
 */
export function ListingGalleryThumbs({
  urls,
  active,
  onSelect,
}: {
  urls: string[];
  active: number;
  onSelect: (index: number) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Listings.detail.gallery');
  const scrollRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  const contentWidth = windowWidth - 2 * layout.screenX;
  const thumbWidth = useMemo(
    () => galleryThumbWidth(contentWidth, PixelRatio.get()),
    [contentWidth],
  );
  const thumbHeight = Math.round((thumbWidth / THUMB_RATIO) * PixelRatio.get()) / PixelRatio.get();
  const step = thumbWidth + THUMB_GAP;
  const stripWidth = urls.length * thumbWidth + Math.max(0, urls.length - 1) * THUMB_GAP;
  const scrollable = stripWidth > contentWidth;

  useEffect(() => {
    if (!scrollable) return;
    // Canh ô đang xem về giữa-trái: lùi một ô để khách thấy còn ảnh phía trước.
    const x = Math.max(0, (active - 1) * step);
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [active, scrollable, step]);

  if (urls.length <= 1) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      scrollEnabled={scrollable}
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={t('pager')}
      contentContainerStyle={styles.row}
    >
      {urls.map((url, index) => {
        const selected = index === active;
        return (
          <Pressable
            key={url}
            onPress={() => onSelect(index)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t('goTo', { index: index + 1, total: urls.length })}
            hitSlop={4}
            style={[
              styles.thumb,
              {
                width: thumbWidth,
                height: thumbHeight,
                backgroundColor: colors.surfaceMuted,
                opacity: selected ? 1 : INACTIVE_OPACITY,
              },
            ]}
          >
            {/* Giải mã đúng cỡ ô — không kéo ảnh gốc vào bộ nhớ. */}
            <Image
              source={{ uri: url, width: thumbWidth, height: thumbHeight }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={url}
              allowDownscaling
              transition={100}
            />
            {/*
              Viền vàng là lớp PHỦ lên ảnh, không phải `borderWidth` của ô: viền trong suốt ở ô không
              chọn vẫn chiếm 2dp nên ảnh lùi vào, mép ô cuối trông lệch khỏi lề nội dung.
            */}
            {selected ? (
              <View pointerEvents="none" style={[styles.ring, { borderColor: colors.primary }]} />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: THUMB_GAP,
    paddingHorizontal: layout.screenX,
    // Chỉ đệm trên: phía dưới đã có khoảng đệm đầu của phần thân trang.
    paddingTop: space.sm,
  },
  thumb: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
    borderWidth: THUMB_BORDER,
  },
});
