import { useTranslations } from 'use-intl';
import {
  BOOKING_LIMIT_VIOLATION,
  SERVICE_TYPE,
  vnDayStart,
  type BookingLimitViolation,
  type PublicListingDetail,
} from '@xeprime/types';
import { useBookingLimitCheck } from '@/features/booking-requests/hooks/use-booking-limits';
import { useAppFormat } from '@/i18n/use-app-format';

export interface ListingTripBlock {
  /**
   * Chủ xe đặt bảo hiểm Bắt buộc mà xe chưa đủ dữ liệu ⇒ tạm không nhận đặt tự lái (ADR 0091 điều 1).
   * Server chặn thật ở bước gửi; ở đây nói trước để khách đổi dịch vụ hoặc xe.
   */
  insuranceBlocked: boolean;
  /** Khoảng thuê vượt trần đặt xe của nền tảng (ADR 0091 điều 4) - `null` khi không vượt. */
  limitViolation: BookingLimitViolation | null;
  /** Câu cảnh báo đầu tiên áp dụng (bảo hiểm trước, rồi trần) - `null` khi chuyến đi tiếp được. */
  message: string | null;
}

/**
 * Hai luật chặn SỚM của thẻ đặt xe - bản native của `selfDriveInsuranceBlocked` + `limitMessage`
 * trong `ListingBookingCard` web. Thẻ (cảnh báo) và nút "Thuê xe" (chặn đi tiếp) đọc CÙNG hook.
 */
export function useListingTripBlock(
  listing: Pick<PublicListingDetail, 'selfDriveInsuranceBlocked'>,
  trip: { serviceType: string; pickupAt: string | null; returnAt: string | null },
): ListingTripBlock {
  const t = useTranslations('Listings.detail.booking');
  const fmt = useAppFormat();
  const insuranceBlocked =
    listing.selfDriveInsuranceBlocked === true && trip.serviceType === SERVICE_TYPE.SELF_DRIVE;
  // Dài hạn chọn ngày theo gói, không đi qua trần này.
  const daily = trip.serviceType !== SERVICE_TYPE.LONG_TERM;
  const limitCheck = useBookingLimitCheck({
    serviceType: trip.serviceType,
    pickupAt: daily && trip.pickupAt ? new Date(trip.pickupAt) : null,
    returnAt: daily && trip.returnAt ? new Date(trip.returnAt) : null,
  });
  const limitMessage =
    limitCheck.violation === BOOKING_LIMIT_VIOLATION.TOO_FAR_AHEAD
      ? t('limits.tooFarAhead', {
          days: limitCheck.limits.maxAdvanceBookingDays,
          date: fmt.date(vnDayStart(limitCheck.lastPickupDateKey).toISOString()),
        })
      : limitCheck.violation === BOOKING_LIMIT_VIOLATION.SELF_DRIVE_TOO_LONG
        ? t('limits.selfDriveTooLong', { days: limitCheck.limits.selfDriveMaxDays })
        : null;
  return {
    insuranceBlocked,
    limitViolation: limitCheck.violation,
    message: insuranceBlocked ? t('insuranceBlocked') : limitMessage,
  };
}
