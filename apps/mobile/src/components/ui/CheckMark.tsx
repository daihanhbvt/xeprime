import { Ionicons } from '@expo/vector-icons';
import { XStack } from 'tamagui';
import { colors, radius } from '@/theme/tokens';

/**
 * Cạnh ô vuông — bằng đúng vòng chọn của `RadioOption`, để một form trộn cả hai loại không so le.
 *
 * 20 là cỡ còn đọc được ở khoảng cách cầm điện thoại mà không tranh chỗ với nhãn. Vùng chạm là
 * cả HÀNG chứ không riêng cái ô, nên ô không cần to bằng ngón tay.
 */
const BOX = 20;

/** Nhỏ hơn ô đủ để còn thấy viền quanh nó. */
const TICK = 14;

/**
 * Ô tick VUÔNG — chỉ cái dấu, không khung, không nhãn, không bắt chạm.
 *
 * Tách khỏi `CheckOption` khi câu cam kết pháp lý cần một ô tick mà nhãn là VĂN BẢN CÓ LIÊN KẾT
 * (`LegalConsentCheckbox`), thứ `CheckOption` không nhận — nhãn của nó là `string`, và khung
 * viền của nó là ngôn ngữ của một DANH SÁCH lựa chọn, không phải của một dòng cam kết.
 *
 * Vuông chứ không tròn ở mọi nơi dùng nó: hình phải nói được chọn được mấy cái. Một hàng ô tròn
 * mà bấm hai cái cùng sáng là hình nói dối, và người dùng sẽ bấm lại vì tưởng mình chọn nhầm.
 */
export function CheckMark({ checked }: { checked: boolean }) {
  return (
    <XStack
      width={BOX}
      height={BOX}
      ai="center"
      jc="center"
      br={radius.sm}
      bw={1}
      bc={checked ? colors.primary : colors.borderInput}
      bg={checked ? colors.primary : colors.surface}
    >
      {checked ? <Ionicons name="checkmark" size={TICK} color={colors.onPrimary} /> : null}
    </XStack>
  );
}
