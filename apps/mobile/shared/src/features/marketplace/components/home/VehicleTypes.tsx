import { Image } from 'expo-image';
import { Pressable, useWindowDimensions } from 'react-native';
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
  const colors = useColors();
  const t = useTranslations('Home.types');
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - layout.screenX * 2 - GRID_GAP) / 2);

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading kicker={t('kicker')} title={t('title')} />
      <XStack flexWrap="wrap" gap={GRID_GAP} accessibilityLabel={t('title')}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => onOpenSearch(typeSearchParams(item))}
            accessibilityRole="link"
            accessibilityLabel={item.label}
            style={({ pressed }) => ({ width: tileWidth, opacity: pressed ? 0.7 : 1 })}
          >
            <YStack w="100%" aspectRatio={MEDIA_RATIO} ov="hidden">
              <Image
                source={{ uri: webAssetUrl(item.showcaseImageUrl) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={150}
              />
            </YStack>
            <YStack ai="center" gap={space.xs} pt={space.sm}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} ta="center" numberOfLines={1}>
                {item.label}
              </Text>
              {item.showcaseExamples ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center" numberOfLines={1}>
                  {item.showcaseExamples}
                </Text>
              ) : null}
            </YStack>
          </Pressable>
        ))}
      </XStack>
      <OutlineAction
        label={t('viewAll')}
        onPress={() => onOpenSearch({ vehicleType: VEHICLE_TYPE.CAR })}
      />
    </YStack>
  );
}
