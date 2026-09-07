import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

export type IconName = keyof typeof Ionicons.glyphMap;

interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: IconName;
  /** Nút hình tuỳ ý đứng trước nhãn — logo hãng xe chẳng hạn, thứ không có trong Ionicons. */
  leading?: ReactNode;
  onPress?: () => void;
  /** Chiếm đều bề ngang trong một hàng chia đều (segmented). */
  grow?: boolean;
  size?: 'sm' | 'md';
  /**
   * `segmented`: mục chưa chọn KHÔNG có nền và viền — cả hàng đọc như một dải liền, chỉ mục
   * đang chọn nổi lên. Dùng cho hai tầng loại xe / dịch vụ của thẻ tìm kiếm, giống web.
   *
   * `filled`: mục chưa chọn có nền chìm và viền — dùng khi các viên đứng rời nhau (lộ trình).
   */
  variant?: 'segmented' | 'filled';
  /**
   * `accent`: viền, icon và chữ đều màu vàng đậm.
   *
   * Dành cho viên DẪN ĐI (mục lục, lối tắt sang màn khác) — thứ không có trạng thái chọn.
   * Viền xám của viên chọn nói "đây là một lựa chọn đang tắt", sai hẳn nghĩa ở chỗ đó.
   */
  tone?: 'default' | 'accent';
  /**
   * Vai trò cho trình đọc màn hình. Mặc định `tab` vì phần lớn viên là một lựa chọn trong dải;
   * viên dẫn sang màn khác phải là `button`, nếu không người dùng nghe "tab" rồi chờ nội dung
   * đổi tại chỗ.
   */
  role?: 'tab' | 'button';
}

/**
 * Viên chọn — dùng cho segmented (loại xe, dịch vụ), lọc nhanh và nhãn trạng thái.
 *
 * Cao tối thiểu `sizing.touchTarget` kể cả cỡ `sm`: cỡ chỉ đổi cỡ chữ và lề ngang, không bao
 * giờ đổi vùng chạm.
 */
/**
 * Chiều cao VẼ RA của viên — thấp hơn sàn 44pt.
 *
 * Cao đúng 44 làm viên trông múp míp, và một hàng bốn năm viên chiếm mất một khoảng dọc lớn
 * cho thứ chỉ là nhãn ngắn. Vùng CHẠM vẫn đủ chuẩn nhờ `hitSlop` bù đúng phần thiếu — mắt
 * thấy viên gọn, ngón tay vẫn có 44pt.
 */
const CHIP_HEIGHT = { sm: 32, md: 38 } as const;

export function Chip({
  label,
  selected = false,
  icon,
  leading,
  onPress,
  grow = false,
  size = 'md',
  variant = 'filled',
  tone = 'default',
  role = 'tab',
}: ChipProps) {
  const segmented = variant === 'segmented';
  const accent = tone === 'accent';
  /*
    Chip CHƯA CHỌN dùng nền TRẮNG + viền, không phải mảng xám.

    Trên form, chip là một loại ô nhập (chọn dịch vụ, chọn loại xe) và phải đọc cùng ngôn ngữ với
    `TextField`/`SelectField` ngay bên trên nó — trắng + viền. Giữ nền xám ở đây thì cùng một
    khối form có hai kiểu ô, và mắt hiểu nhầm chip xám là ô đang bị khoá.

    `borderInput` chứ không `border`: viền phải thấy được trên nền trắng của thẻ.
  */
  const idleBg = segmented ? 'transparent' : colors.surface;
  const idleBorder = accent
    ? colors.primary
    : segmented
      ? 'transparent'
      : colors.borderInput;
  const idleFg = accent ? colors.primaryActive : colors.text;

  /*
   * Nhận `pressed` để viên ĐỔI MÀU lúc ngón tay còn đặt trên nó.
   *
   * Viên dẫn đi mở ra cả một màn khác; không có phản hồi chạm thì trên máy chậm người dùng
   * tưởng hụt và bấm tiếp — đúng thứ `useNavigateOnce` phải đi dọn sau.
   */
  const renderBody = (pressed: boolean) => (
    <XStack
      ai="center"
      jc="center"
      gap={space.xs}
      bg={selected ? colors.primary : pressed && accent ? colors.primaryLight : idleBg}
      bc={selected ? colors.primary : idleBorder}
      bw={1}
      br={radius.pill}
      px={size === 'sm' ? space.sm : space.md}
      minHeight={CHIP_HEIGHT[size]}
    >
      {leading}
      {icon ? (
        <Ionicons
          name={icon}
          size={15}
          color={selected ? colors.onPrimary : accent ? colors.primaryActive : colors.textMuted}
        />
      ) : null}
      <Text
        col={selected ? colors.onPrimary : idleFg}
        fos={size === 'sm' ? fontSize.label : fontSize.bodySm}
        fow={selected ? fontWeight.semibold : fontWeight.medium}
        numberOfLines={1}
      >
        {label}
      </Text>
    </XStack>
  );

  if (!onPress) return renderBody(false);

  const slop = Math.ceil((sizing.touchTarget - CHIP_HEIGHT[size]) / 2);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      {...(role === 'tab' ? { accessibilityState: { selected } } : {})}
      hitSlop={{ top: slop, bottom: slop }}
      style={grow ? { flex: 1 } : undefined}
    >
      {({ pressed }) => renderBody(pressed)}
    </Pressable>
  );
}
