import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  VERIFIED_MARK_CHECK_COLOR,
  VERIFIED_MARK_CHECK_PATH,
  VERIFIED_MARK_SEAL_COLOR,
  VERIFIED_MARK_SEAL_PATH,
  VERIFIED_MARK_VIEWBOX,
} from '@xeprime/ui';

/**
 * DẤU XÁC THỰC của XePrime — con dấu răng cưa vàng kèm dấu tích trắng.
 *
 * Là component riêng chứ không phải một icon gõ tay ở từng chỗ: đây là một tuyên bố về NIỀM TIN,
 * nên nó phải trông giống hệt nhau trên thẻ xe, trang gian hàng, thẻ tài khoản và menu. Ba bản
 * sao sẽ lệch màu và lệch cỡ ngay lần đầu ai đó sửa một trong ba.
 *
 * Hình học đọc từ `@xeprime/ui` — CÙNG hai chuỗi path với bản web, nên hai client không thể vẽ ra
 * hai con dấu khác nhau. Bản native bỏ bộ lọc đổ bóng của web: `react-native-svg` dựng filter
 * không đồng đều giữa iOS và Android, và ở 13–28dp thì cái bóng 2px đó không nhìn ra.
 *
 * > Bản trước dùng glyph `checkmark-circle` của Ionicons vì `react-native-svg` bị coi là chưa chắc
 * > có trong dev build. Nay nó là dependency trực tiếp của app và đã dựng thật trong
 * > `RevenueTrendChart` (có test), nên không còn lý do để dùng hàng thay thế.
 *
 * `label` BẮT BUỘC: dấu này mang nghĩa, không phải trang trí — bỏ nhãn đi là giấu nghĩa đó khỏi
 * trình đọc màn hình. Nơi nào dấu nằm trong một nhãn lớn hơn đã nói đủ ý thì truyền `decorative`
 * để ẩn khỏi cây truy cập, thay vì lặp lại câu ấy hai lần.
 */
export function VerifiedMark({
  label,
  size = 16,
  decorative = false,
}: {
  /** Nghĩa của dấu, đọc lên cho trình đọc màn hình. */
  label: string;
  size?: number;
  decorative?: boolean;
}) {
  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : label}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      <Svg width={size} height={size} viewBox={VERIFIED_MARK_VIEWBOX}>
        <Path d={VERIFIED_MARK_SEAL_PATH} fill={VERIFIED_MARK_SEAL_COLOR} />
        <Path d={VERIFIED_MARK_CHECK_PATH} fill={VERIFIED_MARK_CHECK_COLOR} />
      </Svg>
    </View>
  );
}
