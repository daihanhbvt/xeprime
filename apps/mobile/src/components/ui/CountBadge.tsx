import { Text, YStack } from 'tamagui';
import { StyleSheet } from 'react-native';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Đường kính tối thiểu — một chữ số ra hình TRÒN, hai chữ số nở ngang thành viên thuốc. */
const SIZE = 20;

const TONE = {
  /** Đếm thứ người dùng TỰ đặt (bộ lọc đang bật) — nhấn thương hiệu, không phải cảnh báo. */
  primary: { bg: colors.primary, fg: colors.onPrimary },
  /** Đếm việc CẦN LÀM — đỏ, đúng `<Badge count>` mặc định của AntD bên web. */
  danger: { bg: colors.danger, fg: colors.textInverse },
} as const;

const styles = StyleSheet.create({
  /*
   * Ba thuộc tính này cùng làm MỘT việc: đưa con số về đúng tâm viên tròn.
   *
   * `ai`/`jc` của khung chỉ căn giữa Ô CHỮ, không căn giữa con số bên trong ô đó. Trên Android,
   * `includeFontPadding` mặc định bật và chèn thêm phần đệm ascender/descender của phông vào ô —
   * con số bị đẩy xuống dưới tâm, thấy rõ ở một viên chỉ 20pt. Tắt nó rồi mới căn dọc được.
   *
   * KHÔNG đặt `lineHeight`: nó dựng một hộp dòng riêng và tranh việc với `textAlignVertical`,
   * kết quả lệch theo phông của từng máy.
   */
  text: { includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' },
});

/**
 * Viên đếm tròn — bản native của `<Badge count>` bên web.
 *
 * Ở `components/ui/` vì đã có hai nơi dùng (số bộ lọc đang bật ở `ManageListShell`, số việc cần
 * làm ở hồ sơ xe) và cả hai phải ra CÙNG một hình; khác nhau đúng ở màu, và màu là NGỮ NGHĨA nên
 * nó là tham số chứ không phải chuyện mỗi nơi tự chọn.
 *
 * Không tự ẩn khi `count === 0`: "không có việc" và "chưa biết có việc hay không" là hai chuyện
 * khác nhau, và chỉ nơi gọi mới phân biệt được.
 */
export function CountBadge({ count, tone = 'primary' }: { count: number; tone?: keyof typeof TONE }) {
  const skin = TONE[tone];

  return (
    <YStack minWidth={SIZE} h={SIZE} px={space.xs} br={radius.pill} bg={skin.bg} ai="center" jc="center">
      <Text col={skin.fg} fos={fontSize.label} fow={fontWeight.bold} style={styles.text}>
        {count}
      </Text>
    </YStack>
  );
}
