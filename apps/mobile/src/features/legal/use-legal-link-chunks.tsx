import type { ReactNode } from 'react';
import { Text } from 'tamagui';
import { LEGAL_DOC, type LegalDoc } from '@xeprime/domain';
import { colors, fontWeight } from '@/theme/tokens';
import { useOpenLegalDoc } from './use-open-legal-doc';

type Chunk = (chunks: ReactNode) => ReactNode;

/**
 * Bốn thẻ rich-text của bó message `Legal.consent.*`, dựng thành liên kết mở được.
 *
 * Cấp handler cho CẢ BỐN thẻ dù mỗi câu chỉ dùng hai: use-intl ném lỗi khi message có thẻ thiếu
 * handler, còn handler thừa thì vô hại. Nhờ vậy sửa câu chữ (đổi văn bản được viện dẫn) không
 * phải sửa kèm component nào — cùng cách `LegalConsentNote` bên web làm.
 *
 * Ở một hook dùng chung vì đã có hai nơi cần đúng bộ này (câu cam kết và ô tick lúc đăng ký), và
 * chúng phải mở văn bản y hệt nhau: hai bản sao là hai cơ hội để một chỗ còn mở trình duyệt
 * ngoài trong khi chỗ kia đã chuyển sang WebView.
 */
export function useLegalLinkChunks(): Readonly<Record<'terms' | 'privacy' | 'rules' | 'cancellation', Chunk>> {
  const openDoc = useOpenLegalDoc();

  const link = (doc: LegalDoc): Chunk =>
    function LegalChunk(chunks: ReactNode) {
      return (
        /*
          `<Text>` lồng trong `<Text>` chứ không phải `Pressable`: chỉ text lồng nhau mới chảy
          đúng theo dòng của câu. Bọc `Pressable` sẽ tách thành một khối riêng và câu vỡ làm ba
          mảnh xếp so le.
        */
        <Text
          col={colors.primaryActive}
          fow={fontWeight.semibold}
          onPress={() => openDoc(doc)}
          accessibilityRole="link"
        >
          {chunks}
        </Text>
      );
    };

  return {
    terms: link(LEGAL_DOC.TERMS),
    privacy: link(LEGAL_DOC.PRIVACY),
    rules: link(LEGAL_DOC.MARKETPLACE_RULES),
    cancellation: link(LEGAL_DOC.CANCELLATION),
  };
}
