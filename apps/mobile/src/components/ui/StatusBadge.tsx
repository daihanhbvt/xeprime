import { Text, XStack } from 'tamagui';
import { STATUS_COLOR, type StatusColor } from '@xeprime/types';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Nhãn trạng thái dùng chung — bản native của `<Tag color>` bên web.
 *
 * `STATUS_COLOR` (`@xeprime/types`) là bảng màu NGỮ NGHĨA, và file này là chỗ DUY NHẤT dịch vai
 * trò đó sang token native: mỗi màn tự chọn màu cho `active` thì "Đang thuê" xanh ở danh sách và
 * cam ở chi tiết.
 *
 * Nhãn CHỮ không sinh ở đây — nơi gọi dịch qua `useDomainLabel()` rồi truyền vào, vì mỗi miền có
 * namespace riêng (`bookingStatus`, `customerTripStage`, `handoverStatus`…).
 */
const TONE: Readonly<Record<StatusColor, { fg: string; bg: string }>> = {
  [STATUS_COLOR.NEUTRAL]: { fg: colors.textMuted, bg: colors.surfaceMuted },
  [STATUS_COLOR.INFO]: { fg: colors.info, bg: colors.infoSurface },
  [STATUS_COLOR.PROCESSING]: { fg: colors.info, bg: colors.infoSurface },
  [STATUS_COLOR.SUCCESS]: { fg: colors.success, bg: colors.successSurface },
  [STATUS_COLOR.WAITING]: { fg: colors.warning, bg: colors.warningSurface },
  [STATUS_COLOR.WARNING]: { fg: colors.warning, bg: colors.warningSurface },
  [STATUS_COLOR.DANGER]: { fg: colors.danger, bg: colors.dangerSurface },
  // Hai vai này chưa có token riêng ở native; dùng nhấn thương hiệu thay vì bịa một màu tím.
  [STATUS_COLOR.SPECIAL]: { fg: colors.primaryActive, bg: colors.primaryLight },
  [STATUS_COLOR.ACCENT]: { fg: colors.primaryActive, bg: colors.primaryLight },
};

export function statusTone(color: StatusColor): { fg: string; bg: string } {
  return TONE[color];
}

/**
 * Cỡ chữ của biến thể `xs` — bậc DƯỚI `font-size-label` (12px), nên không có token cho nó.
 *
 * Thang chữ Figma dừng ở 12 vì trên web nhãn trạng thái luôn nằm trong một hàng chữ bình thường.
 * Bậc này chỉ dành cho nhãn nằm ĐÈ lên ảnh: ở đó bề rộng khả dụng là bề rộng tấm ảnh, không phải
 * bề rộng thẻ, và 12px làm viên nhãn chiếm gần trọn ảnh — không còn nhìn ra ảnh chụp cái gì.
 * Giữ ở 10 chứ không nhỏ hơn, và luôn `semibold`, để vẫn đọc được trên nền ảnh.
 */
const XS_FONT_SIZE = 10;

export function StatusBadge({
  label,
  color,
  size = 'md',
}: {
  label: string;
  color: StatusColor;
  /**
   * `sm` cho nhãn phụ nằm trong một hàng dày đặc (thẻ danh sách).
   * `xs` cho nhãn nằm ĐÈ lên ảnh, nơi bề rộng bị chặn bởi tấm ảnh — xem {@link XS_FONT_SIZE}.
   */
  size?: 'xs' | 'sm' | 'md';
}) {
  const tone = statusTone(color);

  return (
    <XStack
      ai="center"
      alignSelf="flex-start"
      maxWidth="100%"
      bg={tone.bg}
      br={radius.pill}
      px={size === 'md' ? space.sm : space.xs}
      py={size === 'xs' ? 1 : 2}
    >
      {/*
        `flexShrink` + `numberOfLines` = cắt bằng dấu "…" thay vì tràn ra ngoài khung.
        Chỉ ăn khi nơi gọi cho khung một bề rộng XÁC ĐỊNH: `maxWidth: '100%'` quy theo bề rộng đã
        resolve của cha, mà cha rộng `auto` thì phần trăm không quy được và viên nhãn cứ thế nở ra.
      */}
      <Text
        flexShrink={1}
        col={tone.fg}
        fos={size === 'xs' ? XS_FONT_SIZE : size === 'sm' ? fontSize.label : fontSize.bodySm}
        fow={fontWeight.semibold}
        numberOfLines={1}
      >
        {label}
      </Text>
    </XStack>
  );
}
