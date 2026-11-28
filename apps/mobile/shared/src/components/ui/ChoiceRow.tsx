import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { CheckMark } from '@/components/ui/CheckMark';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

/** Figma "Radio" sm: vòng 16, chấm 6. */
const RING = 16;
const DOT = 6;

/**
 * Một dòng chọn KHÔNG KHUNG của design v2 (Figma Partner "Checkbox" `24238:58634`, tab Bảo hiểm &
 * Giao nhận xe): dấu 16 (vòng radio hoặc ô tick) lệch xuống 2 cho thẳng dòng đầu, cách chữ 8; tiêu đề
 * 14/20 + dòng phụ 12/18 `text/gray/low`.
 *
 * `tone="strong"` (mặc định): tiêu đề đậm vừa `text/gray/high` - lựa chọn có giải thích (Bắt buộc /
 * Tuỳ chọn). `tone="soft"`: tiêu đề 14 medium `text/gray/medium` - danh sách ô tick ngắn (loại tài sản).
 * Vùng chạm là cả hàng. Khác `RadioOption`/`CheckOption` (hàng có khung) - đó là kiểu cũ.
 */
export function ChoiceRow({
  kind,
  label,
  hint,
  checked,
  disabled = false,
  tone = 'strong',
  onPress,
}: {
  kind: 'radio' | 'checkbox';
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  tone?: 'strong' | 'soft';
  onPress: () => void;
}) {
  const colors = useColors();
  const strong = tone === 'strong';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind}
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      hitSlop={space.xs}
    >
      <XStack gap={space.sm} ai="flex-start" opacity={disabled ? 0.6 : 1}>
        <YStack pt={2}>
          {kind === 'radio' ? (
            <YStack
              w={RING}
              h={RING}
              br={radius.pill}
              bw={1}
              bc={checked ? colors.primary : colors.borderInput}
              bg={checked ? colors.primary : colors.surface}
              ai="center"
              jc="center"
            >
              {checked ? <YStack w={DOT} h={DOT} br={radius.pill} bg={colors.surface} /> : null}
            </YStack>
          ) : (
            <CheckMark checked={checked} size="sm" />
          )}
        </YStack>
        <YStack f={1} minWidth={0}>
          <Text
            col={strong ? colors.text : colors.textMuted}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={strong ? fontWeight.semibold : fontWeight.medium}
          >
            {label}
          </Text>
          {hint ? (
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {hint}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </Pressable>
  );
}
