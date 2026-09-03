import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS, PERMISSION, type BookingStatus } from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useHandoverContext } from '@/features/handovers/hooks/use-handovers';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * "QUẢN LÝ CHUYẾN ĐI" — bản native của `BookingOperationPanel`: kể chuyến đã đi tới đâu và chặng
 * kế là gì.
 *
 * **KHÔNG chứa nút xác nhận** — hành động chính sống ở thanh dính đáy, để cả màn chỉ có đúng MỘT
 * chỗ bấm cho một việc. Hai nơi cùng đọc `useHandoverContext` nên dùng chung một query.
 */
export function BookingTripCard({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: BookingStatus;
}) {
  const t = useTranslations('Bookings.trip');
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.HANDOVER_VIEW);
  const query = useHandoverContext(bookingId, canView);

  // Thiếu quyền xem bàn giao thì thẻ biến mất hẳn — không dựng một thẻ rỗng để giải thích.
  if (!canView) return null;

  if (query.isPending) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <CardTitle>{t('title')}</CardTitle>
          <SkeletonText lines={2} />
        </YStack>
      </Card>
    );
  }

  const context = query.data;
  if (!context) return null;

  const pickup = context.pickup;
  const returned = context.return;
  const ended =
    bookingStatus === BOOKING_STATUS.CANCELLED || bookingStatus === BOOKING_STATUS.NO_SHOW;

  /** Chặng kế tiếp — CHỈ để kể trạng thái; nút bấm nằm ở thanh hành động. */
  const next = !pickup?.confirmedAt
    ? t('notStarted')
    : !returned?.confirmedAt
      ? t('inProgress')
      : null;

  return (
    <Card>
      <YStack gap={space.sm}>
        <CardTitle>{t('title')}</CardTitle>

        {/*
          Mốc hiện ra là `occurredAt` (GIỜ BÀN GIAO THẬT), không phải `confirmedAt` (giờ bấm nút):
          giao xe ngoài bãi rồi 20 phút sau mới xác nhận là chuyện thường, và số đó còn đi vào tính
          phí ngoài giờ. Điều kiện HIỆN vẫn là `confirmedAt` vì nháp chưa có mốc nào để kể; lùi về
          `confirmedAt` cho biên bản cũ chưa có `occurredAt`.
        */}
        {pickup?.confirmedAt ? (
          <Milestone
            label={t('pickedUp')}
            at={pickup.occurredAt ?? pickup.confirmedAt}
            odometer={pickup.odometerKm ?? null}
          />
        ) : null}
        {returned?.confirmedAt ? (
          <Milestone
            label={t('returned')}
            at={returned.occurredAt ?? returned.confirmedAt}
            odometer={returned.odometerKm ?? null}
          />
        ) : null}

        {/* Đơn huỷ / không đến: nói ra thay vì mời xác nhận giao xe cho một đơn không bao giờ giao. */}
        {ended ? <Notice tone="info">{t('ended')}</Notice> : next ? <Notice>{next}</Notice> : null}
      </YStack>
    </Card>
  );
}

function CardTitle({ children }: { children: string }) {
  return (
    <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
      {children}
    </Text>
  );
}

/** Một mốc đã xảy ra: dấu tích xanh + giờ + số Odo (hoặc câu nói rõ là không ghi nhận). */
function Milestone({
  label,
  at,
  odometer,
}: {
  label: string;
  at: string;
  odometer: number | null;
}) {
  const t = useTranslations('Bookings.trip');
  const fmt = useAppFormat();

  return (
    <XStack ai="flex-start" gap={space.sm} p={space.sm} br={radius.md} bg={colors.successSurface}>
      <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.success} />
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {label} · {fmt.dateTime(at)}
        </Text>
        {/* `null` KHÁC HẲN 0: không đọc được đồng hồ là sự thật cần nói, "0 km" là con số sai. */}
        <Text col={colors.textMuted} fos={fontSize.label}>
          {odometer == null ? t('noOdometer') : t('odometer', { km: fmt.kmNumber(odometer) })}
        </Text>
      </YStack>
    </XStack>
  );
}

function Notice({ children, tone = 'default' }: { children: string; tone?: 'default' | 'info' }) {
  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      p={space.sm}
      br={radius.md}
      bg={tone === 'info' ? colors.infoSurface : colors.surfaceMuted}
    >
      <Ionicons
        name="information-circle-outline"
        size={iconSize.sm}
        color={tone === 'info' ? colors.info : colors.textMuted}
      />
      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
        {children}
      </Text>
    </XStack>
  );
}
