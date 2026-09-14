import { Text, YStack } from 'tamagui';
import { StyleSheet } from 'react-native';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Đường kính tối thiểu — một chữ số ra hình TRÒN, hai chữ số nở ngang thành viên thuốc.
 *
 * `sm` dành cho viên ĐÈ LÊN một biểu tượng (chuông, tin nhắn ở thanh trên). Ở đó biểu tượng chỉ
 * 18pt: một viên 20pt to hơn cả thứ nó chú thích, đọc ra như hai biểu tượng cạnh nhau chứ không
 * phải một con số gắn vào chuông.
 */
const SIZES = {
  md: { box: 20, font: fontSize.label },
  sm: { box: 16, font: 10 },
} as const;

/** Quá ngưỡng thì con số thành "99+" — viên huy hiệu không được nở dài ra ngoài thanh trên. */
const MAX = 99;

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
export function CountBadge({
  count,
  tone = 'primary',
  size = 'md',
}: {
  count: number;
  tone?: keyof typeof TONE;
  /** `sm` khi viên đè lên một biểu tượng ở thanh trên — xem `SIZES`. */
  size?: keyof typeof SIZES;
}) {
  const skin = TONE[tone];
  const dim = SIZES[size];

  return (
    <YStack
      minWidth={dim.box}
      h={dim.box}
      px={space.xs}
      br={radius.pill}
      bg={skin.bg}
      ai="center"
      jc="center"
    >
      <Text col={skin.fg} fos={dim.font} fow={fontWeight.bold} style={styles.text}>
        {count > MAX ? `${MAX}+` : count}
      </Text>
    </YStack>
  );
}

/**
 * Vị trí của một viên `size="sm"` ĐÈ LÊN biểu tượng, tính từ mép khung chạm.
 *
 * Khung chạm (48pt) rộng hơn biểu tượng (18pt) rất nhiều, nên `top={0} right={0}` ném viên huy
 * hiệu ra góc khung — cách biểu tượng cả chục pt và trông như đang thuộc về nút bên cạnh. Neo
 * theo GÓC BIỂU TƯỢNG rồi cho đè vào trong một nửa viên, đúng cách `<Badge>` của web treo lên
 * phần tử con của nó.
 */
export function badgeOffset(box: number, icon: number) {
  const inset = Math.max(0, Math.round((box - icon) / 2 - SIZES.sm.box / 2));
  return { top: inset, right: inset } as const;
}
