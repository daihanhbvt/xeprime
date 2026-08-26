import { ActivityIndicator } from 'react-native';
import { Text, YStack } from 'tamagui';
import { colors, fontSize, space } from '@/theme/tokens';

/**
 * Vòng chờ cho màn CHƯA biết trước hình dạng nội dung.
 *
 * Chỗ đã biết trước hình dạng (danh sách xe, dòng gian hàng) dùng `Skeleton` thay — nó giữ
 * nguyên bố cục nên trang không nhảy khi dữ liệu về.
 */
export function ScreenLoading({ label }: { label?: string }) {
  return (
    <YStack f={1} ai="center" jc="center" gap={space.sm} p={space.lg}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {label}
        </Text>
      ) : null}
    </YStack>
  );
}
