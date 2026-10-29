import { StyleSheet, View } from 'react-native';
import { useColors } from '@/theme/ThemeProvider';

const styles = StyleSheet.create({
  // Khung cao đúng 1 và cắt phần thừa — chỉ cạnh TRÊN của khối nét đứt bên trong lộ ra.
  clip: { height: 1, overflow: 'hidden' },
  // Nét đứt trên cả BỐN cạnh (React Native chỉ vẽ dashed đúng khi bốn cạnh đồng nhất), lề âm hai
  // bên để hai cạnh dọc rơi ra ngoài khung cắt.
  dash: { height: 2, borderWidth: 1, borderStyle: 'dashed', marginHorizontal: -1 },
});

/**
 * Vạch ngăn NÉT ĐỨT 1px — tương đương `border-top: 1px dashed …` của web (`.dashedDivider`,
 * `.groupStart` của `OwnerPayoutTable`, vạch tổng của `ListingBookingCard`).
 *
 * Không đặt `borderStyle: 'dashed'` + chỉ `borderTopWidth` lên một View: trên React Native (rõ nhất
 * ở iOS) nét đứt chỉ vẽ đúng khi bốn cạnh cùng bề dày, còn lại ra nét LIỀN — khác hẳn bản vẽ.
 *
 * `color` mặc định `border-strong` (= `borderInput` của app) như phần lớn vạch đứt bên web.
 */
export function DashedDivider({ color }: { color?: string }) {
  const colors = useColors();
  return (
    <View style={styles.clip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.dash, { borderColor: color ?? colors.borderInput }]} />
    </View>
  );
}
