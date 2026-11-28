import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, typeScale } from '@/theme/tokens';

/**
 * Thẻ XE ở đầu các tấm thao tác của lịch (Khoá xe, Đặt giá riêng…) - cùng khuôn thẻ xe Figma
 * "Vehicle Card New" (`24599:135744`) của màn tạo đơn: khung bo 16, đệm 12, ảnh 79×50 bo 8, tên
 * 16/24 đậm, viên biển số nền `bg/gray-50`. Thay cho dòng chữ trơn "Xe · Honda City · 30A…"
 * (người dùng 28/11/2026: "style lại thẻ xe, có ảnh, cho xịn").
 *
 * Chỉ HIỂN THỊ - không chạm. Thiếu ảnh (xe nội bộ chưa có ảnh, khoá mở từ chi tiết) thì ô xám có
 * hình xe nét; thiếu biển số thì bỏ viên.
 */
export const SheetVehicleCard = memo(function SheetVehicleCard({
  name,
  plate,
  imageUrl,
  recyclingKey,
  subtitle,
}: {
  name: string;
  plate?: string | null;
  imageUrl?: string | null;
  recyclingKey?: string;
  /** Dòng phụ dưới tên (vd. giá mặc định của xe). */
  subtitle?: string | null;
}) {
  const colors = useColors();
  /* Gọn như web: nền xám, không viền; tên + biển số một hàng, giá cam bên dưới (người dùng 28/11/2026). */
  return (
    <XStack ai="center" gap={12} p={8} br={12} bg={colors.surfaceMuted}>
      <YStack w={72} h={46} br={6} ov="hidden" bg={colors.surface}>
        <RemoteImage
          uri={imageUrl ?? null}
          {...(recyclingKey ? { recyclingKey } : {})}
          radius={6}
          fallback={<LineIcon name="car" size={iconSize.md} color={colors.placeholder} />}
        />
      </YStack>
      <YStack f={1} minWidth={0} gap={2}>
        <XStack ai="baseline" gap={8}>
          <Text flexShrink={1} col={colors.text} fos={15} lh={22} fow={fontWeight.semibold} numberOfLines={1}>
            {name}
          </Text>
          {plate ? (
            <Text flexShrink={0} col={colors.textMuted} fos={typeScale.label.fontSize} lh={22} numberOfLines={1}>
              {plate}
            </Text>
          ) : null}
        </XStack>
        {subtitle ? (
          <Text col={colors.primary} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.medium} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
});
