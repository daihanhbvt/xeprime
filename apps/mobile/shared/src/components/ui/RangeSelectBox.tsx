import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight } from '@/theme/tokens';

/**
 * Ô "Input - Select" một dòng hiện khung giờ "31/10/2026 09h00 → 01/11/2026 17h00" + icon lịch
 * (Figma "Bộ lọc xe trống" / "Thời gian nhận & trả xe" `24576:131106`): cao tối thiểu 40, đệm ngang
 * 14, viền `stroke/gray-low300`, bo 12, chữ 14/20. Chạm mở tấm chọn giờ của nơi gọi.
 */
export function RangeSelectBox({
  value,
  placeholder,
  label,
  onPress,
}: {
  /** Chuỗi đã định dạng; rỗng ⇒ hiện `placeholder`. */
  value: string;
  placeholder: string;
  /** Nhãn trợ năng. */
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`}>
      <XStack
        ai="center"
        gap={8}
        minHeight={40}
        px={14}
        py={8}
        br={12}
        bw={1}
        bc={colors.borderInput}
        bg={colors.surface}
      >
        <Text
          f={1}
          col={value ? colors.text : colors.textPlaceholder}
          fos={14}
          lh={20}
          fow={fontWeight.regular}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <LineIcon name="calendar" size={20} color={colors.placeholder} />
      </XStack>
    </Pressable>
  );
}
