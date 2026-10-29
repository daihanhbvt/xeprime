import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

export interface SegmentedTabItem<K extends string> {
  key: K;
  label: string;
  /** Viên đếm cạnh nhãn — bỏ trống thì không vẽ. */
  count?: number;
  /** Nhãn đọc cho trình đọc màn hình (mặc định = `label`). */
  accessibilityLabel?: string;
}

/**
 * Dải chọn PHÂN ĐOẠN — khuôn tab web `TripFilterTabs` (người dùng chốt 28/10/2026): ô chọn nền trắng viền, chữ vàng, viên
 * đếm có viền (vàng khi chọn, xám khi không). — khay xám bo tròn hết cỡ, ô đang chọn nổi nền trắng viền vàng nhạt, mỗi ô
 * một viên đếm tuỳ chọn. Khuôn chung của "Chuyến hiện tại / Lịch sử" và "Tất cả / Chưa đọc"
 * (người dùng chốt 28/10/2026) — đổi một chỗ, hai màn đổi theo.
 */
export function SegmentedTabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<SegmentedTabItem<K>>;
  value: K;
  onChange: (next: K) => void;
}) {
  const colors = useColors();
  return (
    <XStack
      f={1}
      p={4}
      gap={4}
      // Figma: khay bo 12 (không viên thuốc), ô trong bo 10, ô chọn nền trắng + bóng mảnh, không viền vàng.
      br={radius.control}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surfaceMuted}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const active = value === item.key;
        return (
          <Pressable
            key={item.key}
            style={styles.segment}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.accessibilityLabel ?? item.label}
          >
            <XStack
              minHeight={36}
              ai="center"
              jc="center"
              gap={space.xs}
              px={space.sm}
              br={10}
              bw={1}
              bc={active ? colors.borderSubtle : 'transparent'}
              bg={active ? colors.surface : 'transparent'}
            >
              <Text
                flexShrink={1}
                col={active ? colors.primaryActive : colors.text}
                fos={fontSize.body}
                fow={active ? fontWeight.semibold : fontWeight.medium}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {item.count != null ? (
                <YStack
                  minWidth={22}
                  h={20}
                  px={6}
                  br={radius.pill}
                  ai="center"
                  jc="center"
                  bw={1}
                  bc={active ? colors.primaryMuted : colors.border}
                  bg={active ? colors.primarySubtle : colors.surfaceMuted}
                >
                  <Text
                    col={active ? colors.primaryActive : colors.textMuted}
                    fos={fontSize.label}
                    fow={fontWeight.medium}
                  >
                    {item.count}
                  </Text>
                </YStack>
              ) : null}
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

const styles = StyleSheet.create({ segment: { flex: 1 } });
