import { Pressable } from 'react-native';
import { Text } from 'tamagui';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * Nút CHỮ nhỏ nằm trong một dòng dữ liệu — "Sửa" cạnh phí giao nhận, "Thu cọc" cạnh cọc đã nhận.
 *
 * Không dùng `Button`: một nút có viền/nền đặt giữa dòng số làm vỡ nhịp của cả khối, và nó cao
 * 44 trong khi dòng chỉ cao 20. Vùng chạm vẫn đạt chuẩn nhờ `hitSlop`.
 *
 * Gương `<Button type="link" size="small">` mà web đặt ở đúng những chỗ này.
 */
export function InlineAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={space.sm}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {label}
      </Text>
    </Pressable>
  );
}
