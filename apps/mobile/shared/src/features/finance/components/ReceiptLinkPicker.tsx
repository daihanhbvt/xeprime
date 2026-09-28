import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, vehicleLabel } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Callout } from '@/components/ui/Callout';
import { SearchInput } from '@/components/ui/SearchInput';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
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
  const fmt = useAppFormat();
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
      {(query.data ?? []).map((booking) => (
        <Row
          key={booking.id}
          selected={booking.id === selectedId}
          title={booking.code}
          subtitle={[booking.customerName, booking.plateNumber]
            .filter(Boolean)
            .join(LIST_SEPARATOR)}
          trailing={
            <Text col={colors.price} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {fmt.money(booking.debtAmount)}
            </Text>
          }
          onPress={() => onSelect(booking)}
        />
      ))}
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
      {(query.data ?? []).map((vehicle) => (
        <Row
          key={vehicle.id}
          selected={vehicle.id === selectedId}
          title={vehicleLabel(vehicle.name, vehicle.plateNumber)}
          subtitle={[vehicle.code, vehicle.branchName].filter(Boolean).join(LIST_SEPARATOR)}
          onPress={() => onSelect(vehicle)}
        />
      ))}
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

function Row({
  selected,
  title,
  subtitle,
  trailing,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        p={space.md}
        br={radius.lg}
        bw={1}
        bg={selected ? colors.surfaceSelected : colors.surface}
        bc={selected ? colors.primary : colors.border}
        minHeight={sizing.touchTarget}
      >
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </YStack>
        {trailing}
      </XStack>
    </Pressable>
  );
}
