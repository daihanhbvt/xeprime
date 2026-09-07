import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useAssignableDrivers } from '../hooks/use-bookings';
import type { AssignableDriver, BookingDetail } from '../api';

/**
 * Gán tài xế cho một đơn (BKG-12).
 *
 * Cửa sổ hỏi là khoảng thuê của CHÍNH đơn này, và `excludeBookingId` trừ nó ra — nếu không,
 * tài xế đang gán cho đơn này tự báo là "đang bận" và không đổi lại được.
 *
 * Hai cờ cảnh báo đến từ server, không suy ở client: `busy` (có đơn sống giao nhau với khung
 * giờ) và `licenseExpired` (GPLX hết hạn trước ngày trả). Cả hai chỉ CẢNH BÁO — gian hàng vẫn
 * gán được, vì họ biết chuyện mà hệ thống không biết (tài xế đã đổi lịch, bằng vừa gia hạn).
 */
export function AssignDriverSheet({
  open,
  onClose,
  booking,
  onSelect,
  onUnassign,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  onSelect: (driverId: string) => void;
  onUnassign: () => void;
  loading: boolean;
}) {
  const t = useTranslations('Bookings.driver');

  const query = useAssignableDrivers(
    {
      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,
      excludeBookingId: booking.id,
    },
    open,
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('sheetTitle')}
      footer={
        booking.driver ? (
          <Button label={t('unassign')} variant="danger" loading={loading} onPress={onUnassign} />
        ) : undefined
      }
    >
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
      ) : (query.data?.length ?? 0) === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('empty')}
        </Text>
      ) : (
        query.data?.map((driver) => (
          <DriverRow
            key={driver.id}
            driver={driver}
            selected={booking.driver?.id === driver.id}
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
  onPress,
}: {
  driver: AssignableDriver;
  selected: boolean;
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
  const unavailable = driver.busy || driver.licenseExpired;

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
