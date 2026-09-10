import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { badgeLineHeight } from './StatusBadge';

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
      /*
        Đệm dọc và hộp dòng lấy ĐÚNG luật của `StatusBadge`: trên thẻ xe hai viên đứng cạnh nhau
        trong cùng một hàng, và viên nào cao hơn thì cả hàng lệch theo nó.

        `lh` phải khai tường minh vì `fos` nhận một SỐ — không có nó, Tamagui rơi về hộp dòng của
        cỡ mặc định (24pt cho chữ 12pt) và viên "-15%" cao gần gấp rưỡi viên trạng thái bên cạnh.

        Đệm dọc 0 vì hộp dòng đã chừa 2pt trên/dưới glyph — xem PADDING_Y của StatusBadge.
      */
      py={0}
      ai="center"
    >
      <Text
        col={colors.onDiscount}
        fos={fontSize.label}
        lh={badgeLineHeight(fontSize.label)}
        fow={fontWeight.bold}
      >
        -{percent}%
      </Text>
    </XStack>
  );
}
