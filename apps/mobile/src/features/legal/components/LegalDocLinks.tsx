import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LEGAL_DOC_VALUES, type LegalDoc } from '@xeprime/domain';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { MenuOptionList } from '@/components/ui/MenuOption';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';
import { useOpenLegalDoc } from '../use-open-legal-doc';

/**
 * Danh sách liên kết tới bốn văn bản pháp lý — bản native của `LegalDocLinks` bên web.
 *
 * Web có hai bố cục (`stack` cho cột hẹp, `inline` cho dải cuối trang); ở đây chỉ có MỘT, và là
 * bố cục xếp dọc. Dải liên kết nằm ngang là thứ chỉ hoạt động với con trỏ chuột: bốn tên văn
 * bản dài (“Chính sách huỷ và hoàn tiền”) rớt dòng lộn xộn, và mỗi đích chạm chỉ cao bằng một
 * dòng chữ. Thêm một prop `layout` mà không nơi nào dùng là bịa ra lựa chọn để rồi có ngày ai
 * đó chọn nhầm.
 *
 * Tiêu đề luôn lấy từ `Legal.docs.<doc>.title`, tức đúng tiêu đề in trên chính văn bản đó —
 * cùng nguồn với web, nên hai client không thể gọi một văn bản bằng hai tên.
 */
export function LegalDocLinks({ exclude }: { exclude?: LegalDoc }) {
  const t = useTranslations('Legal');
  const openDoc = useOpenLegalDoc();
  const docs = LEGAL_DOC_VALUES.filter((doc) => doc !== exclude);

  return (
    <MenuOptionList>
      {docs.map((doc) => (
        <Pressable
          key={doc}
          onPress={() => openDoc(doc)}
          accessibilityRole="link"
          accessibilityLabel={t(`docs.${doc}.title` as never)}
          style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
        >
          <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
            <YStack f={1} gap={2}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                {t(`docs.${doc}.title` as never)}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={2}>
                {t(`docs.${doc}.summary` as never)}
              </Text>
            </YStack>
            {/* Điểm đến là một màn TRONG app (WebView có thanh trên của chính app) — mũi tên
                thường, đúng như mọi hàng mở-ra-được khác. */}
            <DetailChevron />
          </XStack>
        </Pressable>
      ))}
    </MenuOptionList>
  );
}
