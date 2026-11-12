import Animated from 'react-native-reanimated';
import { useFloatLoop, useRevealSlideIn } from '@/components/motion/reveal-effects';
import { ScrollReveal } from '@/components/motion/ScrollReveal';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { CardHighlightContext, HighlightZoom } from '@/components/ui/HighlightZoom';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';
import type { CatalogItem } from '@/api/catalog';
import { webAssetUrl } from '@/lib/web-base-url';
import type { ExploreSearchParams } from '@/navigation/routes-base';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { HomeSectionHeading } from './HomeSectionHeading';
import { OutlineAction } from './GradientButton';
import { useContentWidth } from '@/theme/use-content-width';

/** Khung ảnh giữ tỉ lệ cố định để bốn ô cao bằng nhau; ảnh xe tách nền `contain` bên trong. */
const MEDIA_RATIO = 4 / 3;
/** Lưới 2 cột như bản vẽ Figma mobile. */
const GRID_GAP = space.md;

/**
 * Kiểu dáng được bật "Hiện ở trang chủ" — đúng thứ tự danh mục (API đã sắp theo `sortOrder`).
 * Lọc thêm ảnh cho chắc: thẻ thiếu ảnh là thẻ hỏng. Cùng luật `homeShowcaseBodyTypes` bên web.
 */
export function homeShowcaseBodyTypes(bodyTypes: readonly CatalogItem[]): CatalogItem[] {
  return bodyTypes.filter((item) => item.showOnHome && Boolean(item.showcaseImageUrl));
}

function isVehicleType(value: string | undefined): value is VehicleType {
  return (VEHICLE_TYPE_VALUES as readonly (string | undefined)[]).includes(value);
}

/** Kiểu dáng áp dụng cho đúng MỘT loại xe thì mang luôn loại xe đó; nhiều loại thì để trống. */
export function typeSearchParams(item: CatalogItem): ExploreSearchParams {
  const only = item.vehicleTypes.length === 1 ? item.vehicleTypes[0] : undefined;
  return { ...(isVehicleType(only) ? { vehicleType: only } : {}), bodyType: item.key };
}

interface VehicleTypesProps {
  items: readonly CatalogItem[];
  onOpenSearch: (params: ExploreSearchParams) => void;
}

/**
 * "Loại xe — Phù hợp cho mọi nhu cầu của bạn": mỗi thẻ là một KIỂU DÁNG của danh mục lọc, bấm là
 * sang kết quả đã lọc — cùng đích với web. Tên và thứ tự là của chính danh mục.
 *
 * Lưới 2 × 2 theo bản vẽ Figma mobile (người dùng chốt thay băng chuyền của web). "Xem tất cả" canh giữa dưới, sang tìm kiếm ô tô.
 */
export function VehicleTypes({ items, onOpenSearch }: VehicleTypesProps) {
  const t = useTranslations('Home.types');
  const width = useContentWidth();
  const tileWidth = Math.floor((width - layout.screenX * 2 - GRID_GAP) / 2);

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading kicker={t('kicker')} title={t('title')} />
      <XStack flexWrap="wrap" gap={GRID_GAP} accessibilityLabel={t('title')}>
        {items.map((item, index) => (
          // Mỗi ô tự hiện khi CHÍNH NÓ cuộn vào màn (lưới có thể dài hơn một màn).
          <ScrollReveal key={item.key} index={index}>
            <VehicleTypeTile
              index={index}
              item={item}
              width={tileWidth}
              onPress={() => onOpenSearch(typeSearchParams(item))}
            />
          </ScrollReveal>
        ))}
      </XStack>
      <OutlineAction
        label={t('viewAll')}
        onPress={() => onOpenSearch({ vehicleType: VEHICLE_TYPE.CAR })}
      />
    </YStack>
  );
}

/** Một ô loại xe — trạng thái nhấn = hover của web: ảnh phóng nhẹ + tên vàng, không nền/viền. */
function VehicleTypeTile({
  item,
  index,
  width,
  onPress,
}: {
  item: CatalogItem;
  index: number;
  width: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const [pressed, setPressed] = useState(false);
  // Ảnh xe (không bóng) trượt vào xen kẽ trái/phải + fade khi khối hiện, rồi bồng bềnh so le.
  const slideStyle = useRevealSlideIn(
    (index % 2) * 90,
    index % 2 === 0 ? -TILE_SLIDE_X : TILE_SLIDE_X,
  );
  const floatStyle = useFloatLoop(3, 3500, index * 450);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      style={{ width }}
    >
      <YStack w="100%" aspectRatio={MEDIA_RATIO} ov="hidden">
        {/* = web `.card:hover .image { scale(1.08) }`: nhấn thì ảnh xe to lên nhẹ, không nền/viền. */}
        <CardHighlightContext.Provider value={pressed}>
          <Animated.View style={[styles.fill, slideStyle]}>
            <Animated.View style={[styles.fill, floatStyle]}>
              <HighlightZoom scale={1.08}>
                <Image
                  source={{ uri: webAssetUrl(item.showcaseImageUrl) }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={150}
                />
              </HighlightZoom>
            </Animated.View>
          </Animated.View>
        </CardHighlightContext.Provider>
      </YStack>
      <YStack ai="center" gap={space.xs} pt={space.sm}>
        <Text
          col={pressed ? colors.primary : colors.text}
          fos={fontSize.body}
          fow={fontWeight.semibold}
          ta="center"
          numberOfLines={1}
        >
          {item.label}
        </Text>
        {item.showcaseExamples ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center" numberOfLines={1}>
            {item.showcaseExamples}
          </Text>
        ) : null}
      </YStack>
    </Pressable>
  );
}

/** Quãng trượt vào của ảnh loại xe (dp). */
const TILE_SLIDE_X = 28;

const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' } });
