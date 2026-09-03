import { Ionicons } from '@expo/vector-icons';
import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { RATING_MAX, RATING_SCALE } from '@xeprime/types';
import { colors } from '@/theme/tokens';

/**
 * Năm sao, tô theo điểm LÀM TRÒN — bản native của `components/data-display/Stars` bên web.
 *
 * Ở `components/ui` chứ không nằm trong một màn: trang chi tiết xe, chi tiết chuyến và khối đánh
 * giá đều cần đúng dải sao này, và ba bản chép tay sẽ khác nhau ở cỡ sao ngay lần sửa đầu tiên.
 *
 * Số sao lấy từ `RATING_SCALE` của `@xeprime/types` — cùng nguồn với web và với schema đánh giá.
 */
export function Stars({ value, size = 11 }: { value: number; size?: number }) {
  const tCommon = useTranslations('Common');
  const filled = Math.round(value);

  return (
    /*
      Nhãn trợ năng đặt ở HÀNG, và từng ngôi sao bị ẩn khỏi cây trợ năng.
      Không có nó thì trình đọc màn hình đọc ra năm biểu tượng "star" giống hệt nhau — không nói
      được mấy sao trên mấy, tức là đúng phần thông tin duy nhất của thành phần này bị mất.
    */
    <XStack
      gap={1}
      accessible
      accessibilityLabel={tCommon('components.rating', { value, max: RATING_MAX })}
    >
      {RATING_SCALE.map((star) => (
        <Ionicons
          key={star}
          name="star"
          size={size}
          color={star <= filled ? colors.primaryActive : colors.border}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ))}
    </XStack>
  );
}
