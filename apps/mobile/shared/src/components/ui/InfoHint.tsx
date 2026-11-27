import { LineIcon } from '@/components/icons/LineIcon';
import { Ionicons } from '@/components/icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import { BottomSheet } from './BottomSheet';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';

/**
 * Dấu "i" mở một lời giải thích BỔ SUNG — bản native của `InfoHint` bên web.
 *
 * Web dùng tooltip vì ở đó có hover và focus; trên điện thoại không có cả hai, nên hình thái
 * đúng là một TẤM TRƯỢT: chạm để mở, chạm ra ngoài để đóng. Một tooltip bám ngón tay sẽ bị chính
 * ngón tay che, và trên màn 390px nó tràn mép.
 *
 * `accessibilityRole="button"` + `accessibilityLabel` cho trình đọc màn hình một nút thật với
 * tên thật; nội dung nằm trong tấm trượt và được đọc khi tấm mở, đúng như mọi tấm trượt khác.
 * Vùng chạm nới bằng `hitSlop` — một icon 16px là mục tiêu quá nhỏ so với ngưỡng 44px.
 *
 * KHÔNG dùng nó để giấu thông tin bắt buộc. Số tiền, hạn thanh toán và hệ quả khi hết hạn phải
 * đọc được mà không cần chạm gì.
 */
export function InfoHint({
  content,
  label,
  size = fontSize.body,
  lineIcon,
}: {
  /** Chuỗi ⇒ một đoạn chữ; ReactNode ⇒ nơi gọi tự dựng (nhiều đoạn, kèm liên kết) như web. */
  content: ReactNode;
  label: string;
  /** Cỡ dấu "i" — BẰNG cỡ chữ của nhãn đứng cạnh (mặc định cỡ chữ thân bài). */
  size?: number;
  /** Icon nét của bộ `LineIcon` thay dấu "i" Ionicons - khi Figma vẽ đúng glyph đó (màu `text/gray/very-low`). */
  lineIcon?: 'info-circle-16';
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={12}
      >
        {lineIcon ? (
          <LineIcon name={lineIcon} color={colors.textPlaceholder} />
        ) : (
          <Ionicons name="information-circle-outline" size={size} color={colors.textMuted} />
        )}
      </Pressable>
      {/* Chỉ dựng khi ĐÃ mở: một màn có năm dấu "i" không nên mang theo năm `Modal` ngủ đông. */}
      {open ? (
        <BottomSheet open onClose={() => setOpen(false)} title={label}>
          <YStack pb={space.md} gap={space.sm}>
            {typeof content === 'string' ? (
              <Text col={colors.text} fos={fontSize.body}>
                {content}
              </Text>
            ) : (
              content
            )}
          </YStack>
        </BottomSheet>
      ) : null}
    </>
  );
}
