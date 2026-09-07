import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VEHICLE_OPERATION_STATUS } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useVehiclePicker } from '../hooks/use-bookings';
import type { VehicleListItem } from '../api';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Bộ chọn xe cho luồng tạo đơn tay.
 *
 * Tìm ở SERVER (`q`) chứ không lọc trên danh sách đã tải: một gian hàng 40 xe vẫn kéo về được,
 * nhưng gian hàng 400 xe thì không — và số đó là con số thật trong seed demo.
 *
 * Xe đang bảo dưỡng/ngừng hoạt động vẫn HIỆN, chỉ gắn nhãn: chủ shop biết chuyện mà hệ thống
 * không biết (xe vừa sửa xong, chưa kịp đổi trạng thái). Ẩn đi là quyết định thay họ.
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
  onSelect: (vehicle: VehicleListItem) => void;
}) {
  const t = useTranslations('Bookings.create.vehicle');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const query = useVehiclePicker(debounced.trim(), open);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      <SearchInput
        value={search}
        onChange={setSearch}
        label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
      />

      {query.isPending ? (
        <YStack gap={space.sm}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </YStack>
      ) : query.isError ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('errorTitle')}
        </Text>
      ) : items.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('empty')}
        </Text>
      ) : (
        items.map((vehicle) => (
          <VehicleRow
            key={vehicle.id}
            vehicle={vehicle}
            selected={vehicle.id === selectedId}
            onPress={() => onSelect(vehicle)}
          />
        ))
      )}
    </BottomSheet>
  );
}

function VehicleRow({
  vehicle,
  selected,
  onPress,
}: {
  vehicle: VehicleListItem;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTranslations('Bookings.create.vehicle');
  const fmt = useAppFormat();
  const unavailable = vehicle.operationStatus !== VEHICLE_OPERATION_STATUS.AVAILABLE;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <XStack
        ai="center"
        gap={space.md}
        p={space.md}
        br={radius.lg}
        bw={1}
        bg={selected ? colors.surfaceSelected : colors.surface}
        bc={selected ? colors.primary : colors.border}
        minHeight={sizing.touchTarget}
      >
        <Ionicons name="car-outline" size={iconSize.lg} color={colors.textMuted} />
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
            {vehicle.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {[vehicle.plateNumber, vehicle.code].filter(Boolean).join(LIST_SEPARATOR)}
          </Text>
          {unavailable ? (
            <Text col={colors.warning} fos={fontSize.label}>
              {t('unavailable')}
            </Text>
          ) : null}
        </YStack>
        {vehicle.weekdayPrice ? (
          <Text col={colors.price} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {fmt.money(vehicle.weekdayPrice)}
          </Text>
        ) : null}
        {selected ? (
          <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.primaryActive} />
        ) : null}
      </XStack>
    </Pressable>
  );
}
