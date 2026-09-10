import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { MenuOptionList } from '@/components/ui/MenuOption';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';

export interface FaqEntry {
  readonly key: string;
  readonly question: string;
  readonly answer: string;
}

/**
 * Danh sách hỏi–đáp gập được — bản native của `<Collapse>` mà web dùng ở trung tâm hỗ trợ.
 *
 * **Nhiều mục mở cùng lúc, không phải accordion một-mục.** Đây là chỗ người ta đọc để so hai
 * câu trả lời với nhau ("yêu cầu khác đơn thuê thế nào" cạnh "vì sao không trùng lịch được");
 * đóng mục cũ khi mở mục mới là bắt họ nhớ thay vì đọc. Web cũng để `<Collapse>` ở chế độ nhiều
 * mục — không truyền `accordion`.
 *
 * Đích chạm là CẢ HÀNG câu hỏi. Chỉ mũi tên thì đó là đích 16px trên màn cảm ứng, còn hàng câu
 * hỏi thì luôn rộng bằng thẻ.
 */
export function FaqList({ items }: { items: readonly FaqEntry[] }) {
  const [open, setOpen] = useState<Readonly<Record<string, boolean>>>({});

  return (
    <MenuOptionList>
      {items.map((item) => {
        const expanded = Boolean(open[item.key]);

        return (
          <YStack key={item.key}>
            <Pressable
              onPress={() => setOpen((current) => ({ ...current, [item.key]: !expanded }))}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={item.question}
              style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
            >
              <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
                <Text
                  flexShrink={1}
                  f={1}
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.medium}
                >
                  {item.question}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={iconSize.sm}
                  color={colors.textMuted}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </XStack>
            </Pressable>

            {expanded ? (
              /* Đệm dưới nằm ở phần TRẢ LỜI, không ở hàng câu hỏi: gạch ngăn với mục kế phải
                 cách câu trả lời đúng bằng khoảng nó cách một câu hỏi đang đóng. */
              <Text col={colors.textMuted} fos={fontSize.bodySm} pb={space.sm}>
                {item.answer}
              </Text>
            ) : null}
          </YStack>
        );
      })}
    </MenuOptionList>
  );
}
