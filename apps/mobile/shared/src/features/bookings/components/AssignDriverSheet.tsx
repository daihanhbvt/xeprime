import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DriverLicenceStateBadge } from '@/features/drivers/components/DriverLicenceStateBadge';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useAssignableDrivers } from '../hooks/use-bookings';
import type { AssignableDriver, BookingDetail } from '../api';

/** Dưới ngưỡng này thì cả danh sách vừa một màn — ô tìm chỉ tổ thêm một bước. */
const SEARCH_THRESHOLD = 5;

/**
 * Gán tài xế cho một đơn `with_driver` (ADR 0063) — bản native của bộ chọn trong
 * `BookingDriverSection` của web.
 *
 * Cửa sổ hỏi là khoảng thuê của CHÍNH đơn này, và `excludeBookingId` trừ nó ra — nếu không,
 * tài xế đang gán cho đơn này tự báo là "bận".
 *
 * Server trả CẢ người BẬN trong khung giờ (ở bất kỳ bên thuê nào): hiện kèm nhãn "Bận", không bấm
 * được, không bao giờ nói bận ở đâu. Kèm trạng thái bằng lái của tài khoản tài xế. Backend vẫn
 * kiểm lại trong transaction lúc gán; gán xong là "chờ tài xế nhận".
 *
 * Tấm này CHỈ chọn người. "Bỏ gán" nằm ở hàng tài xế trên màn đơn, cùng chỗ với "Đổi".
 *
 * Lọc bằng ô tìm ngay TRONG danh sách đã tải (gương `showSearch` của web): `/drivers/assignable`
 * trả trọn danh sách nên không có trang nào để tải thêm.
 */
export function AssignDriverSheet({
  open,
  onClose,
  booking,
  pending = false,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  /** `assignDriver.isPending` — khoá cả danh sách trong lúc PATCH đang chạy, chống bấm đúp. */
  pending?: boolean;
  /** Người đang được CHỌN (form sửa đơn giữ lựa chọn tạm) — mặc định là tài xế đang gán. */
  selectedId?: string | null;
  onSelect: (driverId: string) => void;
}) {
  const t = useTranslations('Bookings.driver');
  const tDrivers = useTranslations('Drivers.booking');
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState('');

  const query = useAssignableDrivers(
    {
      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,
      excludeBookingId: booking.id,
    },
    open,
  );

  /* Khớp theo TÊN hoặc SỐ ĐIỆN THOẠI — người trực thường nhớ số trước khi nhớ tên đầy đủ. */
  const drivers = useMemo(() => {
    const all = query.data ?? [];
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return all;
    return all.filter(
      (driver) => driver.name.toLocaleLowerCase().includes(needle) || driver.phone.includes(needle),
    );
  }, [query.data, search]);

  const total = query.data?.length ?? 0;

  return (
    <BottomSheet open={open} onClose={onClose} title={t('sheetTitle')}>
      {total > SEARCH_THRESHOLD ? (
        <SearchInput
          value={search}
          onChange={setSearch}
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
        />
      ) : null}

      {query.isPending ? (
        <YStack gap={space.sm}>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </YStack>
      ) : query.isError ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {errorMessage(query.error)}
        </Text>
      ) : total === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {tDrivers('pickerEmpty')}
        </Text>
      ) : drivers.length === 0 ? (
        /* Tìm hụt KHÁC chưa có tài xế nào — hai câu, không gộp. */
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('searchEmpty', { query: search.trim() })}
        </Text>
      ) : (
        drivers.map((driver) => (
          <DriverRow
            key={driver.id}
            driver={driver}
            selected={(selectedId !== undefined ? selectedId : booking.driver?.id) === driver.id}
            disabled={pending}
            onPress={() => onSelect(driver.id)}
          />
        ))
      )}
    </BottomSheet>
  );
}

function DriverRow({
  driver,
  selected,
  disabled = false,
  onPress,
}: {
  driver: AssignableDriver;
  selected: boolean;
  /** Có PATCH gán tài xế đang chạy — khoá cả hàng để một cú bấm đúp không bắn hai request. */
  disabled?: boolean;
  onPress: () => void;
}) {
  const tDrivers = useTranslations('Drivers.booking');

  /*
   * Người BẬN vẫn HIỆN kèm nhãn, nhưng KHÔNG bấm được — đúng `disabled: d.busy` của web. Giấu đi
   * thì người phân công tưởng tài xế đó không tồn tại; để bấm được thì ăn 409.
   */
  const unavailable = driver.busy || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: unavailable }}
      style={({ pressed }) => [
        unavailable ? { opacity: 0.45 } : null,
        pressed && !unavailable ? { opacity: 0.7 } : null,
      ]}
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
        <Ionicons name="person-circle-outline" size={iconSize.lg} color={colors.textMuted} />
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
            {driver.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {driver.phone}
          </Text>
          <XStack gap={space.xs} flexWrap="wrap">
            <DriverLicenceStateBadge state={driver.licenceState} />
            {driver.busy ? (
              <StatusBadge label={tDrivers('busy')} color={STATUS_COLOR.NEUTRAL} size="sm" />
            ) : null}
          </XStack>
        </YStack>
        {selected ? (
          <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.primaryActive} />
        ) : null}
      </XStack>
    </Pressable>
  );
}
