import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

/**
 * Đường kính vòng chọn, và cạnh của chấm bên trong.
 *
 * 20 là cỡ mà vòng còn đọc được ở khoảng cách cầm điện thoại mà không tranh chỗ với nhãn — vùng
 * chạm là cả HÀNG, không phải riêng cái vòng, nên vòng không cần to bằng ngón tay.
 */
const RING = 20;
const DOT = 10;

const styles = StyleSheet.create({
  /** Hàng phải kéo hết bề ngang: nhãn dài xuống dòng trong khung của nó, không co lại quanh chữ. */
  stretch: { alignSelf: 'stretch' },
});

/**
 * Một dòng lựa chọn loại trừ nhau — nhãn ĐẦY ĐỦ, xuống dòng thoải mái.
 *
 * **Đúng 2 lựa chọn thì radio; từ 3 trở lên thì menu** (`SelectField` / `SelectControl`): hai lựa
 * chọn bày hết chỉ tốn hai dòng và người dùng đọc được cả hai vế trước khi quyết định, còn từ ba
 * trở lên thì bày hết bắt đầu ăn hết màn hình.
 *
 * Không phải `Chip` vì chip cắt nhãn ở một dòng — với nhãn là cả một câu, phần bị cắt chính là
 * phần giải thích.
 */
export function RadioOption({
  label,
  hint,
  checked,
  disabled = false,
  onPress,
}: {
  label: string;
  /** Dòng phụ dưới nhãn — chỉ khi có thứ cần nói thêm mà nhãn không chứa nổi. */
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      style={styles.stretch}
    >
      <XStack
        ai="center"
        gap={space.sm}
        px={space.md}
        py={space.sm}
        minHeight={sizing.touchTarget}
        bw={1}
        br={radius.md}
        bg={checked ? colors.surfaceSelected : colors.surface}
        bc={checked ? colors.primary : colors.border}
        opacity={disabled ? 0.5 : 1}
      >
        <XStack
          width={RING}
          height={RING}
          ai="center"
          jc="center"
          br={RING / 2}
          bw={checked ? 2 : 1}
          bc={checked ? colors.primary : colors.borderInput}
        >
          {/*
            Chấm chỉ vẽ khi đã chọn. Vẽ sẵn một chấm mờ để "giữ chỗ" thì vòng chưa chọn trông
            như đã chọn nhưng bị vô hiệu hoá — vòng rỗng đọc ra ngay là chưa chọn.
          */}
          {checked ? <XStack width={DOT} height={DOT} br={DOT / 2} bg={colors.primary} /> : null}
        </XStack>

        {/* `f={1}` để nhãn dài xuống dòng thay vì đẩy vòng chọn ra khỏi khung. */}
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {label}
          </Text>
          {hint ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {hint}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </Pressable>
  );
}
