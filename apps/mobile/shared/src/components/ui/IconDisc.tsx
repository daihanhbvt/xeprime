import { Ionicons } from '@expo/vector-icons';
import { YStack } from 'tamagui';
import { colors, radius } from '@/theme/tokens';
import type { IconName } from './Chip';

/** Đường kính mặc định — bằng huy hiệu dẫn đầu một hàng `<StatGrid variant="list">`. */
const DEFAULT_SIZE = 32;

/**
 * Glyph chiếm ĐÚNG nửa đường kính.
 *
 * Một tỉ lệ cố định là thứ giữ cho mọi đĩa trong app trông cùng một họ: đặt số glyph riêng ở
 * từng nơi gọi thì đĩa 32 chỗ này đeo hình 16, chỗ kia hình 20, và hai cái đọc ra như hai
 * component khác nhau dù cùng bề rộng.
 */
const GLYPH_RATIO = 0.5;

/**
 * Đĩa tròn mang một biểu tượng — thứ phân loại một con số / một dòng TRƯỚC KHI mắt kịp đọc chữ.
 *
 * Gom về `components/ui/` vì đã có năm chỗ vẽ đúng hình này (huy hiệu của `StatGrid`, ô số và
 * đầu khối của Tổng quan, dòng đơn, dòng phiếu thu chi): mỗi nơi tự dựng là mỗi nơi tự chọn lại
 * đường kính, bề dày viền và cỡ glyph — và năm cái đĩa trên cùng một màn hết giống nhau.
 *
 * Hai dạng, KHÔNG thay thế được cho nhau:
 *
 * - `soft` (mặc định): nền tô nhạt + viền cùng tông + glyph mang tông. Dùng khi đĩa đứng cạnh
 *   nội dung của chính nó (một con số, một dòng danh sách) — nó phân loại chứ không tranh chỗ.
 *   Viền là thứ giữ nó còn nhìn thấy được: `#f0fdf4` trên thẻ trắng gần như là trắng.
 * - `filled`: nền ĐẶC màu tông + glyph trắng. Dùng cho đầu một KHỐI, nơi đĩa là mỏ neo của cả
 *   khối chứ không phải nhãn của một dòng — cùng lý do `StatusIcon` chọn đĩa đặc: tương phản
 *   nằm giữa glyph trắng và nền đặc, nên nó đọc ra là một dấu hiệu chứ không phải hình bị mờ.
 */
export function IconDisc({
  icon,
  tone,
  surface,
  size = DEFAULT_SIZE,
  glyph,
  filled = false,
}: {
  icon: IconName;
  /** Màu NGỮ NGHĨA của đĩa — glyph ở dạng `soft`, nền ở dạng `filled`. */
  tone: string;
  /** Nền nhạt dẫn xuất từ {@link tone}. Bỏ trống thì dùng nền chìm trung tính. */
  surface?: string;
  size?: number;
  glyph?: number;
  filled?: boolean;
}) {
  return (
    <YStack
      w={size}
      h={size}
      br={radius.pill}
      bg={filled ? tone : (surface ?? colors.surfaceMuted)}
      {...(filled ? {} : { bw: 1, bc: tone })}
      ai="center"
      jc="center"
    >
      <Ionicons
        name={icon}
        size={glyph ?? Math.round(size * GLYPH_RATIO)}
        color={filled ? colors.textInverse : tone}
      />
    </YStack>
  );
}
