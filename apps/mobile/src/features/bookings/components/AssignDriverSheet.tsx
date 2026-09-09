import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useAssignableDrivers } from '../hooks/use-bookings';
import type { AssignableDriver, BookingDetail } from '../api';

/** Dưới ngưỡng này thì cả danh sách vừa một màn — ô tìm chỉ tổ thêm một bước. */
const SEARCH_THRESHOLD = 5;

/**
 * Gán tài xế cho một đơn (BKG-12).
 *
 * Cửa sổ hỏi là khoảng thuê của CHÍNH đơn này, và `excludeBookingId` trừ nó ra — nếu không,
 * tài xế đang gán cho đơn này tự báo là "đang bận" và không đổi lại được.
 *
 * Hai cờ cảnh báo đến từ server, không suy ở client: `busy` (có đơn sống giao nhau với khung
 * giờ) và `licenseExpired` (GPLX hết hạn trước ngày trả). Cả hai chỉ CẢNH BÁO — gian hàng vẫn
 * gán được, vì họ biết chuyện mà hệ thống không biết (tài xế đã đổi lịch, bằng vừa gia hạn).
 *
 * Tấm này CHỈ chọn người. "Bỏ gán" nằm ở hàng tài xế trên màn đơn, cùng chỗ với "Đổi" — đúng
 * như web, và vì đó là hai việc khác nhau: bỏ gán không cần mở danh sách nào cả. Có ở cả hai
 * nơi thì cùng một việc có hai lối, và lối trong tấm chọn là lối không ai tìm tới.
 *
 * Lọc bằng ô tìm ngay TRONG danh sách đã tải, không gọi lại API: đây là bản native của
 * `showSearch` + `optionFilterProp="label"` trên `Select` của web, vốn cũng lọc trên đúng bộ
 * option đã nạp. `/drivers/assignable` trả trọn danh sách đang hoạt động nên không có trang
 * nào để tải thêm — hỏi lại server chỉ tốn một vòng mạng cho cùng một câu trả lời.
 */
export function AssignDriverSheet({
  open,
  onClose,
  booking,
  pending = false,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  /** `assignDriver.isPending` — khoá cả danh sách trong lúc PATCH đang chạy, chống bấm đúp. */
  pending?: boolean;
  onSelect: (driverId: string) => void;
}) {
  const t = useTranslations('Bookings.driver');
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
      {/*
        Ô tìm chỉ có nghĩa khi danh sách đủ dài để phải tìm. Một gian hàng ba tài xế mà vẫn bắt
        đọc qua một ô nhập trước khi thấy ba cái tên là thêm một bước cho không.
      */}
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
          {t('errorTitle')}
        </Text>
      ) : total === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('empty')}
        </Text>
      ) : drivers.length === 0 ? (
        /* Tìm hụt KHÁC gian hàng chưa có tài xế nào — hai câu, không gộp. */
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('searchEmpty', { query: search.trim() })}
        </Text>
      ) : (
        drivers.map((driver) => (
          <DriverRow
            key={driver.id}
            driver={driver}
            selected={booking.driver?.id === driver.id}
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
  const t = useTranslations('Bookings.driver');
  const warnings = [
    driver.busy ? t('busy') : null,
    driver.licenseExpired ? t('licenseExpired') : null,
  ].filter(Boolean);

  /*
   * Người không khả dụng vẫn HIỆN kèm lý do, nhưng KHÔNG bấm được — đúng như web
   * (`disabled: d.busy || d.licenseExpired`).
   *
   * Giấu đi thì người phân công tưởng tài xế đó không tồn tại và đi tìm mãi; để bấm được thì
   * hoặc ăn 409, hoặc tệ hơn là gán trúng một người đang bận xe khác.
   */
  const unavailable = driver.busy || driver.licenseExpired || disabled;

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
          {warnings.length > 0 ? (
            <Text col={colors.warning} fos={fontSize.label} numberOfLines={2}>
              {warnings.join(LIST_SEPARATOR)}
            </Text>
          ) : null}
        </YStack>
        {selected ? (
          <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.primaryActive} />
        ) : null}
      </XStack>
    </Pressable>
  );
}
