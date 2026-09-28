import { StyleSheet } from 'react-native';
import { XStack, YStack } from 'tamagui';

/** Bề rộng một thanh và khe hở giữa hai thanh — cùng chu kỳ 3px/6px với web. */
const BAR = 3;

const styles = StyleSheet.create({
  tilt: { transform: [{ rotate: '45deg' }] },
});

/**
 * Vân gạch chéo 45° — bản native của `repeating-linear-gradient` mà lịch web dùng cho ngày bận.
 *
 * Vẽ tay bằng View vì React Native không có gradient lặp, và `react-native-svg` /
 * `expo-linear-gradient` là một phụ thuộc mới cho đúng một hoạ tiết.
 */
export function StripePattern({
  color,
  /**
   * Phải LỚN HƠN ĐƯỜNG CHÉO của ô: xoay 45° thì bán kính nội tiếp chỉ còn `size/2`, nên ô 45×48
   * (đường chéo ~66) cần `size ≥ 66` mới phủ tới bốn góc.
   */
  size = 120,
}: {
  color: string;
  size?: number;
}) {
  const bars = Math.ceil(size / (BAR * 2));

  return (
    // `ai/jc="center"`: tâm xoay phải là tâm Ô. Neo vào góc thì nửa dưới-phải không có vân nào.
    <YStack
      pos="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      ov="hidden"
      ai="center"
      jc="center"
      pointerEvents="none"
    >
      <XStack width={size} height={size} gap={BAR} style={styles.tilt}>
        {Array.from({ length: bars }, (_, i) => (
          <YStack key={i} width={BAR} height="100%" bg={color} />
        ))}
      </XStack>
    </YStack>
  );
}
