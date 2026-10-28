'use client';

import { Alert, App, Button, Popconfirm, Select, Tag } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY,
  canTransitionBooking,
  DRIVER_ASSIGNMENT_STATUS_META,
  DRIVER_INCIDENT_LEVEL,
  DRIVER_MISSING_ALERT_LEAD_MINUTES,
  DRIVER_SOURCE,
  isDriverMissingAlertDue,
  isDriverReassignable,
  PERMISSION,
  SERVICE_TYPE,
  type BookingStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DriverLicenceStateTag } from '@/features/drivers/components/DriverLicenceStateTag';
import { useAssignableDrivers } from '@/features/drivers/hooks/use-drivers';
import { useNow } from '@/hooks/use-now';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { telHref } from '@/lib/contact';
import { useAssignBookingDriver } from '../hooks/use-booking-mutations';
import type { BookingDetail, BookingDriverIncident } from '../types';
import { BookingDriverHistory } from './BookingDriverHistory';
import { BookingStatusTransitionDialog } from './BookingStatusTransitionDialog';
import styles from './BookingDriverSection.module.css';

/**
 * Khối "Tài xế" trên chi tiết đơn (ADR 0063 · ADR 0074).
 *
 * CHỈ đơn `with_driver` mới có tài xế: đơn khác ẩn hẳn khối, trừ khi còn một tài xế gán từ trước
 * (dữ liệu cũ) — khi đó hiện chỉ-đọc để không ai mất dấu người đang cầm xe. Chỉ còn tài xế LIÊN
 * KẾT: chọn ở bộ chọn, `pending` cho tới khi tài xế nhận ở site khách; bộ chọn hiện cả người BẬN
 * (disable, nhãn "Bận" — không bao giờ nói bận ở đâu). Đơn cũ còn mang tài xế ngoài hệ thống vẫn
 * hiện, gỡ / thay bằng tài xế liên kết được (ADR 0074 điều 4).
 *
 * Tài xế ĐÃ NHẬN rồi rút ⇒ thẻ SỰ CỐ: ai rút, vì sao, hạn điều phối lại; quá hạn hoặc sát giờ thì
 * nói rõ khách đang được huỷ hoàn 100% tính cho bên thuê, kèm lối "Huỷ chuyến do thiếu tài xế".
 */
export function BookingDriverSection({
  booking,
  canUpdate,
}: {
  booking: BookingDetail;
  canUpdate: boolean;
}) {
  const t = useTranslations('Drivers.booking');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const fmt = useAppFormat();
  const now = useNow();
  const [selecting, setSelecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const assign = useAssignBookingDriver(booking.id);

  const isWithDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const driver = booking.driver ?? null;
  const isExternal = driver?.source === DRIVER_SOURCE.EXTERNAL;
  const incident = booking.driverIncident ?? null;

  // Chỉ tải danh sách khi thật sự mở bộ chọn — theo KHUNG GIỜ của đơn.
  const driversQ = useAssignableDrivers(
    { pickupAt: booking.pickupAt, returnAt: booking.returnAt, excludeBookingId: booking.id },
    selecting && isWithDriver,
  );

  if (!isWithDriver && !driver) return null;
  const reassignable = isDriverReassignable(booking.status);
  // Đã giao xe / đã khép ⇒ người cầm lái đã chốt: chỉ đọc (server cũng chặn — DRIVER_ASSIGNMENT_LOCKED).
  const canWrite = canUpdate && isWithDriver && reassignable;
  // Bộ chọn đọc `/drivers/assignable` (DRIVER_VIEW) — thiếu quyền thì không bày nút, như app native.
  const canPick = canWrite && has(PERMISSION.DRIVER_VIEW);
  const canCancel =
    canUpdate && canTransitionBooking(booking.status as BookingStatus, BOOKING_STATUS.CANCELLED);
  // Thẻ sự cố đã nói việc cần làm — không chồng thêm cảnh báo "sắp tới giờ chưa có tài xế".
  const missingSoon =
    !incident &&
    isWithDriver &&
    reassignable &&
    isDriverMissingAlertDue(
      { pickupAt: booking.pickupAt, hasDriver: driver !== null },
      new Date(now),
    );

  function submit(driverId: string | null) {
    if (assign.isPending) return;
    assign.mutate(
      { driverId },
      {
        onSuccess: () => {
          message.success(driverId ? t('assigned') : t('unassignedToast'));
          setSelecting(false);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const driverTel = driver ? telHref(driver.phone) : null;

  return (
    <section className={styles.panel}>
      <h3 className={styles.blockTitle}>{t('title')}</h3>

      {!isWithDriver ? <p className={styles.meta}>{t('legacyHint')}</p> : null}

      {/* Tài xế cần biết mình chạy đâu — hành trình nằm ngay cạnh việc phân công. */}
      {isWithDriver && booking.routeType ? (
        <p className={styles.meta}>
          {domainLabel('routeType', booking.routeType)}
          {booking.pickupAddress ? ` · ${t('pickup', { address: booking.pickupAddress })}` : ''}
          {booking.destination ? ` ${t('destination', { destination: booking.destination })}` : ''}
        </p>
      ) : null}

      {incident ? (
        <DriverIncidentAlert
          incident={incident}
          action={
            canCancel ? (
              <Button size="small" danger onClick={() => setCancelling(true)}>
                {t('incident.cancelForDriver')}
              </Button>
            ) : null
          }
        />
      ) : null}

      {missingSoon ? (
        <Alert
          className={styles.alert}
          type="warning"
          showIcon
          title={t('missingSoon', { hours: DRIVER_MISSING_ALERT_LEAD_MINUTES / 60 })}
        />
      ) : null}

      {selecting ? (
        <div className={styles.row}>
          <Select
            className={styles.select}
            placeholder={t('pickerPlaceholder')}
            loading={driversQ.isLoading}
            showSearch
            optionFilterProp="title"
            options={(driversQ.data ?? []).map((d) => ({
              value: d.id,
              title: `${d.name} ${d.phone}`,
              disabled: d.busy,
              label: (
                <span className={styles.option}>
                  <span>
                    {d.name} · {d.phone}
                  </span>
                  <span className={styles.optionTags}>
                    <DriverLicenceStateTag licence={{ state: d.licenceState }} compact />
                    {d.busy ? <Tag>{t('busy')}</Tag> : null}
                  </span>
                </span>
              ),
            }))}
            notFoundContent={
              driversQ.isLoading
                ? null
                : driversQ.isError
                  ? errorMessage(driversQ.error)
                  : t('pickerEmpty')
            }
            onChange={(value: string) => submit(value)}
            disabled={assign.isPending}
            aria-label={t('pickerLabel')}
          />
          <div className={styles.actions}>
            <Button size="small" onClick={() => setSelecting(false)}>
              {t('close')}
            </Button>
          </div>
        </div>
      ) : driver ? (
        <div className={styles.row}>
          <div className={styles.stack}>
            <span className={styles.strong}>
              {driver.name}{' '}
              {isExternal ? (
                <Tag>{t('externalTag')}</Tag>
              ) : (
                <StatusTag
                  value={driver.assignmentStatus}
                  meta={DRIVER_ASSIGNMENT_STATUS_META}
                  group="driverAssignmentStatus"
                />
              )}
            </span>
            {driverTel ? (
              <a href={driverTel} className={styles.link}>
                {driver.phone}
              </a>
            ) : (
              <span>{driver.phone}</span>
            )}
            <span className={styles.meta}>
              {isExternal
                ? t('externalSetAt', { time: fmt.dateTime(driver.assignedAt) })
                : driver.respondedAt
                  ? t('respondedAt', { time: fmt.dateTime(driver.respondedAt) })
                  : t('assignedAt', { time: fmt.dateTime(driver.assignedAt) })}
            </span>
            {/* Hạn tài xế trả lời (ADR 0066) — quá hạn thì hệ thống trả lượt về và báo khẩn. */}
            {driver.respondBy ? (
              <span className={styles.deadline}>
                {t('respondBy', { time: fmt.dateTime(driver.respondBy) })}
              </span>
            ) : null}
            {isExternal && canWrite ? (
              <span className={styles.meta}>{t('externalLegacy')}</span>
            ) : null}
          </div>
          {canWrite ? (
            <div className={styles.actions}>
              {canPick ? (
                <Button size="small" onClick={() => setSelecting(true)}>
                  {t('change')}
                </Button>
              ) : null}
              <Popconfirm title={t('unassignConfirm')} onConfirm={() => submit(null)}>
                <Button size="small" loading={assign.isPending}>
                  {t('unassign')}
                </Button>
              </Popconfirm>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={styles.row}>
          {/* Đơn có tài xế chưa phân công nghĩa là chưa chạy được — nhắc bằng màu cảnh báo. */}
          <span className={styles.missing}>{t('unassigned')}</span>
          {canPick ? (
            <div className={styles.actions}>
              <Button size="small" type="primary" onClick={() => setSelecting(true)}>
                {t('assign')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {isWithDriver ? <BookingDriverHistory bookingId={booking.id} /> : null}

      {/* Dựng có điều kiện: mỗi lần mở là một form mới, nhóm lý do chọn sẵn "thiếu tài xế". */}
      {cancelling ? (
        <BookingStatusTransitionDialog
          booking={booking}
          target={BOOKING_STATUS.CANCELLED}
          defaultReasonCategory={CANCELLATION_REASON_CATEGORY.DRIVER_UNAVAILABLE}
          open
          onClose={() => setCancelling(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * Thẻ SỰ CỐ TÀI XẾ (ADR 0074) — mọi mốc do server tính (`reassignBy`, `customerCanCancelFree`),
 * ở đây chỉ đọc. Màu theo độ khẩn: khách đã được huỷ miễn phí ⇒ đỏ; còn trong hạn ⇒ vàng.
 */
function DriverIncidentAlert({
  incident,
  action,
}: {
  incident: BookingDriverIncident;
  action: ReactNode;
}) {
  const t = useTranslations('Drivers.booking.incident');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const reason = incident.reasonCategory
    ? incident.reason
      ? t('reasonWithNote', {
          reason: domainLabel('driverDropReason', incident.reasonCategory),
          note: incident.reason,
        })
      : t('reason', { reason: domainLabel('driverDropReason', incident.reasonCategory) })
    : null;
  const deadline =
    incident.level === DRIVER_INCIDENT_LEVEL.URGENT
      ? t('urgent')
      : incident.customerCanCancelFree
        ? t('overdue', { time: fmt.dateTime(incident.reassignBy) })
        : t('reassignBy', { time: fmt.dateTime(incident.reassignBy) });

  return (
    <Alert
      className={styles.alert}
      type={incident.customerCanCancelFree ? 'error' : 'warning'}
      showIcon
      title={
        incident.driverName ? t('titleNamed', { name: incident.driverName }) : t('titleReleased')
      }
      description={
        <div className={styles.stack}>
          {reason ? <span>{reason}</span> : null}
          <span className={styles.meta}>
            {t('droppedAt', { time: fmt.dateTime(incident.droppedAt) })}
          </span>
          <span className={styles.strong}>{deadline}</span>
        </div>
      }
      action={action}
    />
  );
}
