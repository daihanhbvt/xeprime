import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import { BottomSheet } from './BottomSheet';
import { colors, fontSize, iconSize, space } from '@/theme/tokens';

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
export function InfoHint({ content, label }: { content: string; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={12}
      >
        <Ionicons
          name="information-circle-outline"
          size={iconSize.sm}
          color={colors.textMuted}
        />
      </Pressable>
      {/* Chỉ dựng khi ĐÃ mở: một màn có năm dấu "i" không nên mang theo năm `Modal` ngủ đông. */}
      {open ? (
        <BottomSheet open onClose={() => setOpen(false)} title={label} scroll={false}>
          <YStack pb={space.md}>
            <Text col={colors.text} fos={fontSize.body}>
              {content}
            </Text>
          </YStack>
        </BottomSheet>
      ) : null}
    </>
  );
}
