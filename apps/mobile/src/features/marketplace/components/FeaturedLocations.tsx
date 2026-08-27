import { Image } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import { SectionError } from './SectionError';
import { SectionHeader } from './SectionHeader';

/** Số ô hiện ban đầu; "Xem tất cả" mở hết phần đã tải — cùng con số với web. */
const PREVIEW_COUNT = 5;
/** Ảnh địa điểm nằm ngang 3:2 — khung vuông cắt mất hai bên của một tấm ảnh phong cảnh. */
const THUMB_HEIGHT = 56;
const THUMB_WIDTH = Math.round(THUMB_HEIGHT * 1.5);

/**
 * "Địa điểm nổi bật" — tỉnh/thành đang có xe, số xe đếm thật ở backend.
 *
 * Xếp theo HÀNG NGANG chồng dọc như web: ảnh nhỏ bên trái, tên và số xe bên phải, mỗi mục một
 * dòng đầy. Băng cuộn ngang trước đó cắt tên tỉnh dài và giấu mất phần lớn danh sách sau mép
 * phải — trong khi đây là lối tắt lọc chính, không phải một dải trưng bày.
 *
 * Bấm một địa điểm lọc khối "Xe khả dụng" theo tỉnh đó — cùng hành vi với web.
 */
export function FeaturedLocations({ onPicked }: { onPicked?: () => void }) {
  const t = useTranslations('Marketplace.locations');
  const { pickProvince, destinations, destinationsLoading, destinationsError } =
    useSearchExperience();
  const [expanded, setExpanded] = useState(false);

  const all = destinations ?? [];
  // Cắt bớt cho gọn nhưng phải MỞ RA được — web có "Xem tất cả / Thu gọn", và không có nó thì
  // các tỉnh xếp sau ngưỡng là không có đường nào chạm tới từ khối này.
  const shown = expanded ? all : all.slice(0, PREVIEW_COUNT);

  // Chưa có xe nào công khai → ẩn hẳn khối, không hiện khung rỗng vô nghĩa.
  if (!destinationsLoading && !destinationsError && all.length === 0) return null;

  return (
    <YStack gap={layout.block}>
      <SectionHeader
        title={t('title')}
        subtitle={t('subtitle')}
        {...(all.length > PREVIEW_COUNT
          ? {
              action: {
                label: expanded ? t('collapse') : t('expand'),
                onPress: () => setExpanded((v) => !v),
              },
            }
          : {})}
      />

      {destinationsError ? (
        <SectionError title={t('loadError')} error={destinationsError} />
      ) : destinationsLoading ? (
        <YStack gap={space.sm}>
          {Array.from({ length: 3 }, (_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </YStack>
      ) : (
        <YStack gap={space.sm}>
          {shown.map((item) => (
            <Card
              key={item.provinceCode}
              lift="flat"
              padded={false}
              // Lọc theo MÃ tỉnh (khớp chính xác), không theo tên.
              onPress={() => {
                pickProvince(item.provinceCode);
                // Kết quả nằm phía TRÊN khối này — web cuộn về `#recommendations` vì cùng lý
                // do: đổi bộ lọc mà màn hình không nhúc nhích thì trông như cú bấm rơi vào hư không.
                onPicked?.();
              }}
              accessibilityLabel={item.provinceName}
            >
              <XStack ai="center" gap={space.md} p={space.sm}>
                <YStack
                  w={THUMB_WIDTH}
                  h={THUMB_HEIGHT}
                  br={radius.md}
                  bg={colors.surfaceMuted}
                  ov="hidden"
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : null}
                </YStack>

                <YStack f={1} gap={2}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
                    {item.provinceName}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('available', { count: item.vehicleCount })}
                  </Text>
                </YStack>
              </XStack>
            </Card>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
