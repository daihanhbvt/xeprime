import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { IconName } from './Chip';

/**
 * Nhích hình xuống cho khớp đường nền của dòng chữ.
 *
 * Hộp dòng của chữ cao hơn glyph, nên một `<Ionicons>` canh `flex-start` ngồi cao hơn chữ đúng
 * chừng này. Canh giữa (`ai="center"`) thì hết lệch ở dòng một hàng nhưng hỏng ở dòng hai hàng —
 * hình rơi xuống giữa hai dòng thay vì đứng đầu câu.
 */
const BASELINE_NUDGE = 2;

/**
 * Một dòng có HÌNH DẪN ĐẦU trong thẻ danh sách: số xe, số điện thoại, địa chỉ, giấy tờ, lý do một
 * nút đang khoá.
 *
 * Ở bậc `label` (12px). Hai vai, phân biệt bằng {@link strong}:
 *
 * - **Dòng nền** (mặc định): chữ mờ — địa chỉ, giấy tờ, lý do. Thứ người ta đọc khi đã dừng ở
 *   đúng bản ghi, không phải thứ để lướt.
 * - **Dòng GIÁ TRỊ** (`strong`): chữ đậm màu chữ chính — con số/mẩu dữ liệu người ta mở màn này
 *   ra để lấy. Ở bậc 12px thì cái phân biệt nó với dòng nền là ĐỘ ĐẬM và độ tương phản, không
 *   phải cỡ chữ: nâng cỡ lên thì nó cạnh tranh với chính cái tên ở trên.
 *
 * Hai cách tô màu, KHÔNG thay nhau được: `iconTone` tô riêng hình (hình chỉ PHÂN LOẠI dòng — cùng
 * luật với dải chỉ số của `VehicleCard`), còn `tone` tô cả dòng (chính CÂU đó mang sắc thái: một
 * lỗi kiểm tra, một xác nhận hợp lệ). Mặc định là không tô gì: tô theo ngữ nghĩa ở mọi dòng thì
 * thẻ thành một cột nhiều màu và không dòng nào nổi lên nữa.
 *
 * Gom về đây vì bốn thẻ (chi nhánh, tài xế, người dùng, và thẻ sau) đang vẽ đúng hình này, và mỗi
 * nơi tự dựng là mỗi nơi tự chọn lại cỡ hình, khe hở và phần nhích đường nền.
 */
export function IconLine({
  icon,
  tone,
  iconTone,
  strong = false,
  children,
}: {
  icon: IconName;
  /**
   * Màu NGỮ NGHĨA của cả dòng — hình lẫn chữ. Dùng khi chính CÂU đó mang sắc thái: một lỗi kiểm
   * tra, một xác nhận hợp lệ. Ở đó tô mỗi cái hình là nửa vời, vì thứ người ta đọc là câu.
   */
  tone?: string;
  /**
   * Màu của RIÊNG hình, chữ giữ nguyên. Dùng khi hình chỉ PHÂN LOẠI dòng chứ không nhuộm nghĩa
   * cho nó — số xe, số điện thoại. Thắng {@link tone} khi khai cả hai.
   */
  iconTone?: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <XStack ai="flex-start" gap={space.xs}>
      <YStack pt={BASELINE_NUDGE}>
        <Ionicons name={icon} size={iconSize.xs} color={iconTone ?? tone ?? colors.textMuted} />
      </YStack>
      <Text
        f={1}
        col={tone ?? (strong ? colors.text : colors.textMuted)}
        fos={fontSize.label}
        fow={strong ? fontWeight.semibold : fontWeight.regular}
        numberOfLines={strong ? 1 : undefined}
      >
        {children}
      </Text>
    </XStack>
  );
}
