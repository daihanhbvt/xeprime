import { Redirect, useLocalSearchParams } from 'expo-router';
import { BOOKING_HISTORY_TAB, BOOKING_STATUS } from '@xeprime/types';
import { RentalsScreen } from '@/features/bookings/RentalsScreen';
import { isRentalStage, RENTAL_STAGE } from '@/features/bookings/rental-stages';
import { ROUTES } from '@/navigation/routes';

/**
 * "Đơn thuê xe" gộp (web `/manage/bookings`, sổ cái §3.2b) — một màn cho yêu cầu lẫn đơn.
 *
 * Link cũ chuyển tiếp như `rentals-redirect.ts` web: `?stage=` / `?preset=` mở đúng nhóm;
 * `?status=active` → "Đang thuê", `reserved` → "Chờ giao xe"; `completed|cancelled|no_show` →
 * "Đơn đã kết thúc". `?vehicleId=` (lối từ hồ sơ xe) lọc theo một xe.
 */
export default function ManageBookingsRoute() {
  const { vehicleId, stage, preset, status } = useLocalSearchParams<{
    vehicleId?: string;
    stage?: string;
    preset?: string;
    status?: string;
  }>();
  if (status === BOOKING_STATUS.COMPLETED) {
    return <Redirect href={ROUTES.manage.bookingsEnded(BOOKING_HISTORY_TAB.COMPLETED)} />;
  }
  if (status === BOOKING_STATUS.CANCELLED || status === BOOKING_STATUS.NO_SHOW) {
    return <Redirect href={ROUTES.manage.bookingsEnded(BOOKING_HISTORY_TAB.CANCELLED)} />;
  }
  const initialStage = isRentalStage(stage)
    ? stage
    : isRentalStage(preset)
      ? preset
      : status === BOOKING_STATUS.ACTIVE
        ? RENTAL_STAGE.RENTING
        : status === BOOKING_STATUS.RESERVED
          ? RENTAL_STAGE.AWAITING_PICKUP
          : undefined;
  return (
    <RentalsScreen
      {...(initialStage ? { initialStage } : {})}
      {...(vehicleId ? { vehicleId } : {})}
    />
  );
}
