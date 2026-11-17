import { useTranslations } from 'use-intl';
import { XStack, YStack } from 'tamagui';
import { FilterButton } from '@/components/ui/FilterButton';
import { SearchInput } from '@/components/ui/SearchInput';

/** Figma "Tab List" `24175:57178`: ô tìm co giãn · nút "Lọc", cách 12. */
const SEARCH_GAP = 12;

/**
 * Hàng "ô tìm + nút Lọc" CHUẨN của màn Đơn thuê (người dùng chốt 16/11/2026) - dùng chung cho mọi
 * danh sách: khung `ManageListShell variant="page"` và các danh sách lồng trong màn chi tiết (lịch
 * sử thuê của khách...). Bỏ `onFilterPress` thì chỉ còn ô tìm.
 */
export function ListSearchBar({
  value,
  onChange,
  label,
  placeholder,
  filterCount = 0,
  onFilterPress,
  gutter = 0,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  /** Số bộ lọc đang bật - hiện thành viên đếm trên nút. */
  filterCount?: number;
  onFilterPress?: () => void;
  gutter?: number;
}) {
  const tFilters = useTranslations('Common.filters');
  return (
    <XStack ai="center" gap={SEARCH_GAP} px={gutter}>
      <YStack f={1} minWidth={0}>
        <SearchInput value={value} onChange={onChange} label={label} placeholder={placeholder} variant="field" />
      </YStack>
      {onFilterPress ? (
        <FilterButton
          label={tFilters('short')}
          accessibilityLabel={
            filterCount > 0
              ? `${tFilters('title')}, ${tFilters('activeCount', { count: filterCount })}`
              : tFilters('open')
          }
          count={filterCount}
          onPress={onFilterPress}
        />
      ) : null}
    </XStack>
  );
}
