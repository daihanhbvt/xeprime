import { useState, type ReactNode } from 'react';
import { Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, vehicleLabel } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Callout } from '@/components/ui/Callout';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { SearchInput } from '@/components/ui/SearchInput';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/tokens';
import { useReceiptBookingOptions, useReceiptVehicleOptions } from '../hooks/use-finance';
import type { ReceiptBookingOption, ReceiptVehicleOption } from '../api';

/** Cùng nhịp với thanh lọc: người dùng gõ xong một từ rồi mới bắn truy vấn. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Chọn ĐƠN THUÊ để gắn phiếu — bản native của ô `SelectField showSearch` bên web.
 *
 * Tìm ở SERVER: ô này chỉ tải 20 đơn ưu tiên còn nợ, nên đơn cũ chỉ ra qua đường tìm kiếm.
 * Debounce vì mỗi lần gõ là bốn vị từ `ILIKE '%…%'` quét bảng `bookings` — không hoãn thì một
 * biển số 8 ký tự là 8 lần quét.
 */
export function BookingPickerSheet({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (booking: ReceiptBookingOption) => void;
}) {
  const t = useTranslations('Finance.receipts.form');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const query = useReceiptBookingOptions(debounced, open);

  return (
    <PickerShell
      open={open}
      onClose={onClose}
      title={t('booking')}
      searchValue={search}
      searchLabel={t('booking')}
      searchPlaceholder={t('bookingPlaceholder')}
      onSearchChange={setSearch}
      loading={query.isPending}
      error={query.isError ? t('bookingError') : null}
      empty={(query.data?.length ?? 0) === 0 ? t('bookingEmpty') : null}
    >
      {/* Danh sách như ô chọn thường của web (chốt 26/11/2026): "mã · khách · biển số". */}
      <MenuOptionList>
        {(query.data ?? []).map((booking) => (
          <MenuOption
            key={booking.id}
            label={[booking.code, booking.customerName, booking.plateNumber]
              .filter(Boolean)
              .join(LIST_SEPARATOR)}
            selected={booking.id === selectedId}
            onPress={() => onSelect(booking)}
          />
        ))}
      </MenuOptionList>
    </PickerShell>
  );
}

/**
 * Chọn XE để gắn phiếu.
 *
 * `includeId` giữ xe đang chọn trong kết quả kể cả khi nó không khớp từ khoá đang gõ — không có
 * nó, gõ tìm xe khác sẽ làm ô chọn hiện lại id thô.
 */
export function VehiclePickerSheet({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (vehicle: ReceiptVehicleOption) => void;
}) {
  const t = useTranslations('Finance.receipts.form');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const query = useReceiptVehicleOptions(debounced, open, selectedId);

  return (
    <PickerShell
      open={open}
      onClose={onClose}
      title={t('vehicle')}
      searchValue={search}
      searchLabel={t('vehicle')}
      searchPlaceholder={t('vehiclePlaceholder')}
      onSearchChange={setSearch}
      loading={query.isPending}
      error={query.isError ? t('vehicleError') : null}
      empty={(query.data?.length ?? 0) === 0 ? t('vehicleEmpty') : null}
    >
      {/* Như web: "mã · tên xe (biển số)". */}
      <MenuOptionList>
        {(query.data ?? []).map((vehicle) => (
          <MenuOption
            key={vehicle.id}
            label={[vehicle.code, vehicleLabel(vehicle.name, vehicle.plateNumber)]
              .filter(Boolean)
              .join(LIST_SEPARATOR)}
            selected={vehicle.id === selectedId}
            onPress={() => onSelect(vehicle)}
          />
        ))}
      </MenuOptionList>
    </PickerShell>
  );
}

/** Ô tìm + bốn trạng thái, dùng chung cho cả hai bộ chọn — hai bản chép tay sẽ lệch ở lần đầu. */
function PickerShell({
  open,
  onClose,
  title,
  searchValue,
  searchLabel,
  searchPlaceholder,
  onSearchChange,
  loading,
  error,
  empty,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  searchValue: string;
  searchLabel: string;
  searchPlaceholder: string;
  onSearchChange: (next: string) => void;
  loading: boolean;
  error: string | null;
  empty: string | null;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <SearchInput
        value={searchValue}
        onChange={onSearchChange}
        label={searchLabel}
        placeholder={searchPlaceholder}
        variant="boxed"
      />

      {loading ? (
        <SkeletonText lines={4} />
      ) : error ? (
        <Callout tone="warning">{error}</Callout>
      ) : empty ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {empty}
        </Text>
      ) : (
        children
      )}
    </BottomSheet>
  );
}
