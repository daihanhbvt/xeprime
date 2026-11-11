import { Text, XStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { badgeLineHeight } from './StatusBadge';

/**
 * Viên "-N%" — bản native của `DiscountTag` bên web.
 *
 * Tách ra vì hai bề mặt cùng vẽ đúng một thứ: thẻ xe ngoài chợ và bảng ưu đãi cam kết thời hạn ở
 * bước Giá. Màu giảm giá là MỘT cặp token riêng (`discount`/`onDiscount`), không phải `danger` —
 * giảm giá là tin vui, không phải cảnh báo.
 */
export function DiscountTag({
  percent,
  size = 'md',
  variant = 'pill',
  active = false,
  best = false,
}: {
  percent: number;
  size?: 'sm' | 'md';
  /** `corner` — nhãn góc trên-phải của một ô chọn (gói thuê dài hạn), như web `variant="corner"`. */
  variant?: 'pill' | 'corner';
  /** Chỉ cho `corner`: ô đang được chọn ⇒ màu nhấn (vàng) thay cho màu ưu đãi (xanh). */
  active?: boolean;
  /** Chỉ cho `corner`: ưu đãi TỐT NHẤT trong nhóm ⇒ màu giảm giá (đỏ). `active` thắng nếu cả hai. */
  best?: boolean;
}) {
  const colors = useColors();
  if (variant === 'corner') {
    // Ô cha cần `overflow: hidden` + `position: relative` để nhãn ôm sát góc trên-phải.
    return (
      <XStack
        pointerEvents="none"
        pos="absolute"
        top={0}
        right={0}
        zIndex={1}
        px={space.xs}
        bg={active ? colors.primary : best ? colors.discount : colors.success}
        borderBottomLeftRadius={radius.sm}
      >
        <Text
          col={active ? colors.onPrimary : best ? colors.onDiscount : colors.textInverse}
          fos={fontSize.meta}
          lh={badgeLineHeight(fontSize.meta)}
          fow={fontWeight.semibold}
        >
          -{percent}%
        </Text>
      </XStack>
    );
  }
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
