import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Viên "-N%" — bản native của `DiscountTag` bên web.
 *
 * Tách ra vì hai bề mặt cùng vẽ đúng một thứ: thẻ xe ngoài chợ và bảng ưu đãi cam kết thời hạn ở
 * bước Giá. Màu giảm giá là MỘT cặp token riêng (`discount`/`onDiscount`), không phải `danger` —
 * giảm giá là tin vui, không phải cảnh báo.
 */
export function DiscountTag({ percent, size = 'md' }: { percent: number; size?: 'sm' | 'md' }) {
  return (
    <XStack
      bg={colors.discount}
      br={radius.sm}
      px={size === 'sm' ? space.xs : space.sm}
      py={2}
      ai="center"
    >
      <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
        -{percent}%
      </Text>
    </XStack>
  );
}
