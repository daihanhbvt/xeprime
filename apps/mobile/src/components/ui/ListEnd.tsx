import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { colors, fontSize, space } from '@/theme/tokens';

/**
 * Dấu chấm hết của một danh sách cuộn vô hạn.
 *
 * Thanh phân trang của web nói ra điều này bằng chính hình dạng của nó — thấy "3/3" là biết đã
 * hết. Cuộn vô hạn không có mốc đó: cuộn tới đáy rồi dừng lại thì không phân biệt được "hết
 * rồi" với "đang tải tiếp" hay "mạng chết". Một dòng chữ giải quyết xong.
 *
 * Chỉ hiện khi danh sách CÓ dữ liệu và KHÔNG còn trang sau — danh sách rỗng đã có `ScreenMessage`
 * của riêng nó, thêm dòng này vào đó là hai câu nói cùng một chuyện.
 */
export function ListEnd() {
  const t = useTranslations('Common.states');

  return (
    <YStack ai="center" py={space.md}>
      <Text col={colors.placeholder} fos={fontSize.bodySm}>
        {t('endOfList')}
      </Text>
    </YStack>
  );
}
