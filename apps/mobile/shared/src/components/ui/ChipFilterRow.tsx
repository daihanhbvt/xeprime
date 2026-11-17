import { FlatList, StyleSheet } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { useResponsive } from '@/theme/use-responsive';
import { space } from '@/theme/tokens';

export interface ChipFilterOption {
  value: string;
  label: string;
  /** Số đếm đi SAU nhãn (dải tab có số của web). Vắng = không hiện số. */
  count?: number | null;
}

interface ChipFilterRowProps {
  options: readonly ChipFilterOption[];
  value: string;
  onChange: (next: string) => void;
  accessibilityLabel: string;
}

function keyOf(option: ChipFilterOption): string {
  return option.value;
}

/**
 * Hàng chip lọc một-chạm cuộn ngang — bản native của các dải chip web ở khổ điện thoại
 * (`VehicleStatusChips`, `SummaryStrip` bấm-để-lọc, `MaintenanceBoardTabs`).
 *
 * Chỉ là LỐI VÀO nhanh của một chiều lọc đã có trong tấm trượt lọc — cùng state, không phải state
 * thứ hai. Đặt vào khe `tabs` của `ManageListShell`.
 */
export function ChipFilterRow({ options, value, onChange, accessibilityLabel }: ChipFilterRowProps) {
  const { gutter } = useResponsive();
  return (
    <FlatList
      horizontal
      data={options}
      keyExtractor={keyOf}
      showsHorizontalScrollIndicator={false}
      // `flexGrow: 0`: FlatList ngang trong cột dọc sẽ nuốt hết chiều cao còn lại.
      style={styles.row}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
      accessibilityLabel={accessibilityLabel}
      renderItem={({ item }) => (
        <Chip
          label={item.count == null ? item.label : `${item.label}  ${item.count}`}
          selected={value === item.value}
          size="sm"
          onPress={() => onChange(item.value)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0, paddingVertical: space.sm },
  content: { gap: space.xs },
});
