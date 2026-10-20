'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  DRIVER_ASSIGNMENT_STATUS_META,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { DriverTrip } from '../types';

/**
 * Nhãn trạng thái của một chuyến nhìn từ TÀI XẾ (ADR 0063). Chuyến còn giao cho mình: lượt gán
 * (chờ nhận / đã nhận) + trạng thái đơn. Chuyến đã qua: MỘT nhãn kết quả của chính mình —
 * "bị gỡ" và "từ chối" nói theo ngôi tài xế, không theo cách bên thuê gọi.
 */
export function DrivingTripTags({
  trip,
}: {
  trip: Pick<DriverTrip, 'outcome' | 'assignmentStatus' | 'status'>;
}) {
  const t = useTranslations('Driving.outcome');
  const domainLabel = useDomainLabel();

  if (trip.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN) {
    return (
      <span>
        <StatusTag
          value={trip.assignmentStatus}
          meta={DRIVER_ASSIGNMENT_STATUS_META}
          group="driverAssignmentStatus"
        />
        <Tag>{domainLabel('bookingStatus', trip.status)}</Tag>
      </span>
    );
  }
  const outcome = trip.outcome as Exclude<
    DriverAssignmentOutcome,
    typeof DRIVER_ASSIGNMENT_OUTCOME.OPEN
  >;
  return <Tag color={DRIVER_ASSIGNMENT_OUTCOME_META[outcome]?.color}>{t(outcome)}</Tag>;
}
