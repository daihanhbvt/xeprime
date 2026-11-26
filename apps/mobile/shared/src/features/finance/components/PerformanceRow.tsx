import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { Avatar } from '@/components/ui/Avatar';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';

/** Figma "Hiệu suất kinh doanh" (`24228:99120`): ảnh tròn 32, khoảng 6 giữa ảnh và chữ. */
const AVATAR_SIZE = 32;
const AVATAR_GAP = 6;
/** Ô số phụ: nền `bg/gray-50`, đệm 8, bo 8. */
const BOX_PAD = 8;
const BOX_RADIUS = 8;

export interface PerformanceFact {
  readonly label: string;
  readonly value: string;
}

/**
 * Một dòng của thẻ "Hiệu suất kinh doanh" - dùng cho cả tab Theo xe lẫn Theo khách:
 * ảnh tròn · tên 12 đậm vừa + dòng phụ 10 ("biển số - N chuyến", gạch nối nhạt) · số tiền 12 đậm
 * + chú thích 10 có màu bên phải, rồi ô xám chứa hai số phụ (nhãn 10, giá trị 12 đậm vừa).
 */
export const PerformanceRow = memo(function PerformanceRow({
  name,
  imageUrl,
  subParts,
  amount,
  amountTone,
  note,
  noteTone,
  facts,
  onPress,
}: {
  name: string;
  imageUrl: string | null | undefined;
  /** Các mẩu của dòng phụ, nối bằng gạch nối nhạt như Figma. */
  subParts: readonly string[];
  amount: string;
  amountTone?: string;
  note: string;
  noteTone: string;
  /** Ô xám số phụ - rỗng thì không vẽ ô (tab Theo khách: mọi số đã nằm trên dòng chính). */
  facts: readonly PerformanceFact[];
  /** Bỏ trống khi người xem không có quyền mở hồ sơ - dòng không bắt chạm. */
  onPress?: () => void;
}) {
  const colors = useColors();
  const body = (
    <YStack gap={AVATAR_GAP}>
      <XStack ai="center" gap={space.md}>
        <XStack f={1} minWidth={0} ai="center" gap={AVATAR_GAP}>
          <Avatar name={name} url={imageUrl ?? null} size={AVATAR_SIZE} />
          <YStack f={1} minWidth={0} gap={2}>
            <Text
              col={colors.text}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text
              col={colors.textMuted}
              fos={typeScale.caption.fontSize}
              lh={typeScale.caption.lineHeight}
              numberOfLines={1}
            >
              {subParts.map((part, index) => (
                <Text
                  key={`${index}-${part}`}
                  col={colors.textMuted}
                  fos={typeScale.caption.fontSize}
                  lh={typeScale.caption.lineHeight}
                >
                  {index > 0 ? (
                    <Text
                      col={colors.borderInput}
                      fos={typeScale.caption.fontSize}
                      lh={typeScale.caption.lineHeight}
                    >
                      {SUB_SEPARATOR}
                    </Text>
                  ) : null}
                  {part}
                </Text>
              ))}
            </Text>
          </YStack>
        </XStack>
        <YStack ai="flex-end" gap={2} flexShrink={0}>
          <Text
            col={amountTone ?? colors.text}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.bold}
            numberOfLines={1}
          >
            {amount}
          </Text>
          <Text col={noteTone} fos={typeScale.caption.fontSize} lh={typeScale.caption.lineHeight} numberOfLines={1}>
            {note}
          </Text>
        </YStack>
      </XStack>
      {facts.length > 0 ? (
      <XStack gap={space.sm} p={BOX_PAD} br={BOX_RADIUS} bg={colors.background}>
        {facts.map((fact) => (
          <YStack key={fact.label} f={1} minWidth={0}>
            <Text col={colors.textMuted} fos={typeScale.caption.fontSize} lh={typeScale.caption.lineHeight} numberOfLines={1}>
              {fact.label}
            </Text>
            <Text
              col={colors.text}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {fact.value}
            </Text>
          </YStack>
        ))}
      </XStack>
      ) : null}
    </YStack>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {body}
    </Pressable>
  );
});

/** Gạch nối của dòng phụ Figma ("50A-135.92 - 6 chuyến"), tô nhạt hơn chữ hai bên. */
const SUB_SEPARATOR = ' - ';

const styles = StyleSheet.create({ pressed: { opacity: 0.7 } });
