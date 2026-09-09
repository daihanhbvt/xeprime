import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { YStack } from 'tamagui';
import { colors, iconSize, radius, space } from '@/theme/tokens';

/** Nền tối mờ dưới hình trắng — đủ tương phản trên cả ảnh nền sáng lẫn nền tối. */
const SCRIM = 'rgba(0,0,0,0.45)';

const SIZE = {
  /** Ảnh nhỏ: logo gian hàng (72dp) — đĩa 26dp, đủ thấy mà không che hết tấm ảnh bên dưới. */
  sm: { pad: space.xs, glyph: iconSize.md },
  /** Ảnh lớn: ảnh bìa, ảnh đại diện xe. */
  md: { pad: space.sm, glyph: iconSize.lg },
} as const;

/**
 * Viên máy ảnh đè GIỮA một khung ảnh — dấu hiệu duy nhất nói khung này bấm được để đổi ảnh.
 *
 * **Giữa khung, không phải góc.** Bản trước của hồ sơ gian hàng treo nó ở góc dưới phải: trên một
 * dải ảnh bìa thì một chấm 24dp ở góc lẫn hẳn vào nội dung ảnh, và người dùng không biết
 * khung này bấm được — họ đi tìm một cái nút "Đổi ảnh" không tồn tại. Giữa khung là chỗ mắt rơi
 * vào đầu tiên và cũng là chỗ ngón tay chạm vào đầu tiên.
 *
 * `pointerEvents="none"`: chạm phải rơi vào `Pressable` bọc CẢ khung, không vào riêng viên này —
 * người dùng nhắm vào tấm ảnh chứ không nhắm vào một chấm 26dp.
 *
 * Ở `components/ui/` vì hai nơi đã cần đúng viên này (ô ảnh của biểu mẫu, ảnh bìa + logo gian
 * hàng) và chúng từng lệch nhau cả vị trí lẫn cỡ hình, dù cùng nói một việc. Màu nền mờ cũng
 * từng bị gõ lại ở cả hai file.
 */
export function ImageEditBadge({
  busy = false,
  size = 'md',
}: {
  /** Đang tải lên — đổi hình để khung ảnh tự nói ra là nó đang bận. */
  busy?: boolean;
  size?: keyof typeof SIZE;
}) {
  const skin = SIZE[size];

  return (
    <YStack style={StyleSheet.absoluteFill} ai="center" jc="center" pointerEvents="none">
      <YStack bg={SCRIM} br={radius.pill} p={skin.pad}>
        <Ionicons
          name={busy ? 'cloud-upload-outline' : 'camera'}
          size={skin.glyph}
          color={colors.textInverse}
        />
      </YStack>
    </YStack>
  );
}
