import { useTranslations } from 'use-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  DRIVER_ASSIGNMENT_STATUS_META,
  STATUS_COLOR,
  type DriverAssignmentOutcome,
  type StatusColor,
} from '@xeprime/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import type { DriverTrip } from '../api';

type TripTagSource = Pick<DriverTrip, 'outcome' | 'assignmentStatus' | 'status'>;

/** Màu vạch mép trái của thẻ: lượt còn mở theo trạng thái lượt gán, đã qua theo kết quả. */
export function drivingTripColor(trip: TripTagSource): StatusColor {
  return trip.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN
    ? DRIVER_ASSIGNMENT_STATUS_META[trip.assignmentStatus].color
    : (DRIVER_ASSIGNMENT_OUTCOME_META[trip.outcome as DriverAssignmentOutcome]?.color ??
        STATUS_COLOR.NEUTRAL);
}

/**
 * Bản native của `DrivingTripTags` (web, ADR 0063). Lượt còn mở: trạng thái lượt gán (+ trạng thái
 * đơn khi `withBookingStatus`). Chuyến đã qua: MỘT nhãn kết quả theo ngôi tài xế.
 */
export function DrivingTripStatusBadge({ trip }: { trip: TripTagSource }) {
  const t = useTranslations('Driving.outcome');
  const domainLabel = useDomainLabel();
  if (trip.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN) {
    const meta = DRIVER_ASSIGNMENT_STATUS_META[trip.assignmentStatus];
    return (
      <StatusBadge
        label={domainLabel('driverAssignmentStatus', trip.assignmentStatus, meta.label)}
        color={meta.color}
        size="sm"
      />
    );
  }
  return <StatusBadge label={t(trip.outcome)} color={drivingTripColor(trip)} size="sm" />;
}

/** Nhãn trạng thái đơn — chỉ hiện khi lượt còn mở (chuyến đã qua chỉ mang một nhãn kết quả). */
export function DrivingTripBookingBadge({ trip }: { trip: TripTagSource }) {
  const domainLabel = useDomainLabel();
  if (trip.outcome !== DRIVER_ASSIGNMENT_OUTCOME.OPEN) return null;
  return (
    <StatusBadge
      label={domainLabel('bookingStatus', trip.status)}
      color={STATUS_COLOR.NEUTRAL}
      size="sm"
    />
  );
}
