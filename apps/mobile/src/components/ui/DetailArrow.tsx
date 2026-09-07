import { Ionicons } from '@expo/vector-icons';
import { XStack } from 'tamagui';
import { IconButton } from './IconButton';
import { colors, iconSize, space } from '@/theme/tokens';

/**
 * Mũi tên "mở chi tiết" NỔI ở góc thẻ — một vùng chạm riêng, đặt tuyệt đối.
 *
 * Dùng khi thẻ có phần thân đã bắt chạm cho việc khác (ảnh mở trình xem, một hàng con mở màn
 * khác): lúc đó cần một đích riêng cho "mở cả thẻ". Thẻ mà TOÀN BỘ bề mặt đã là đích thì dùng
 * {@link DetailChevron} — thêm một nút chồng lên chỉ là lối vào thứ hai cho đúng một việc.
 */
export function DetailArrow({
  label,
  onPress,
  inset = -space.sm,
}: {
  label: string;
  onPress: () => void;
  inset?: number;
}) {
  return (
    <XStack pos="absolute" top={inset} right={inset} zi={1} accessible={false}>
      <IconButton
        icon="chevron-forward"
        label={label}
        onPress={onPress}
        tone="plain"
        size={iconSize.md}
      />
    </XStack>
  );
}

/**
 * Mũi tên `>` ĐI KÈM nội dung — dấu hiệu "hàng/thẻ này mở ra được", không phải một nút.
 *
 * Không bắt chạm và không có nhãn khả truy cập: đích chạm là cả thẻ, và nó đã mang
 * `accessibilityLabel` của mình. Thêm một nút nữa ở đây là đọc màn hình phải nghe hai lần cùng
 * một việc, còn ngón tay thì có hai đích cho cùng một đích đến.
 *
 * Đặt CUỐI hàng cuối cùng (cạnh tổng tiền, cạnh nhãn phụ), không phải góc trên: góc trên là chỗ
 * của nhãn trạng thái, và một mũi tên tuyệt đối ở đó chồng lên nó — chính là lý do các thẻ này
 * từng phải đổi sang nút có chữ.
 */
export function DetailChevron({ size = iconSize.sm }: { size?: number }) {
  return (
    <Ionicons
      name="chevron-forward"
      size={size}
      color={colors.textMuted}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
