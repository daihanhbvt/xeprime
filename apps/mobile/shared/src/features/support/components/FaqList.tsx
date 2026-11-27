import { memo, useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

export interface FaqEntry {
  readonly key: string;
  readonly question: string;
  readonly answer: string;
  /** Liên kết dẫn tới màn xử lý chính câu hỏi đó (vd "Xem trạng thái duyệt xe" - Figma `24232:116776`). */
  readonly link?: { readonly label: string; readonly onPress: () => void };
}

/**
 * Danh sách hỏi–đáp gập được - mỗi câu là MỘT thẻ riêng (Figma "FAQs" `24232:116776`): nền trắng,
 * viền `stroke/gray-low200`, bo 16, đệm 16; thẻ đang mở viền vàng nhạt `stroke/primary-100` và mũi
 * tên "Up 2" vàng.
 *
 * **Nhiều mục mở cùng lúc, không phải accordion một-mục** - người ta đọc để so hai câu trả lời với
 * nhau; web cũng để `<Collapse>` ở chế độ nhiều mục. Đích chạm là CẢ hàng câu hỏi.
 */
export function FaqList({ items }: { items: readonly FaqEntry[] }) {
  const [open, setOpen] = useState<Readonly<Record<string, boolean>>>({});
  const toggle = useCallback(
    (key: string) => setOpen((current) => ({ ...current, [key]: !current[key] })),
    [],
  );

  return (
    <YStack gap={space.sm}>
      {items.map((item) => (
        <FaqItem key={item.key} item={item} expanded={Boolean(open[item.key])} onToggle={toggle} />
      ))}
    </YStack>
  );
}

const FaqItem = memo(function FaqItem({
  item,
  expanded,
  onToggle,
}: {
  item: FaqEntry;
  expanded: boolean;
  onToggle: (key: string) => void;
}) {
  const colors = useColors();
  return (
    <YStack
      bg={colors.surface}
      borderWidth={1}
      borderColor={expanded ? colors.brandIconBg : colors.border}
      br={radius.card}
      p={space.md}
      gap={space.sm}
    >
      <Pressable
        onPress={() => onToggle(item.key)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={item.question}
        hitSlop={HIT_SLOP}
      >
        <XStack ai="flex-start" gap={space.sm}>
          <Text
            f={1}
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
          >
            {item.question}
          </Text>
          <LineIcon
            name={expanded ? 'chevron-up-md' : 'chevron-down-md'}
            color={expanded ? colors.brandShape : colors.placeholder}
          />
        </XStack>
      </Pressable>

      {expanded ? (
        <>
          <Text col={colors.textBody} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {item.answer}
          </Text>
          {item.link ? <LinkArrow label={item.link.label} onPress={item.link.onPress} /> : null}
        </>
      ) : null}
    </YStack>
  );
});

const HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 } as const;
