'use client';

import { App, Button, Popconfirm, Select, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_ASSIGNMENT_STATUS_META,
  isDriverReassignable,
  PERMISSION,
  SERVICE_TYPE,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DriverLicenceStateTag } from '@/features/drivers/components/DriverLicenceStateTag';
import { useAssignableDrivers } from '@/features/drivers/hooks/use-drivers';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePermissions } from '@/hooks/use-permissions';
import { useAssignBookingDriver } from '../hooks/use-booking-mutations';
import type { BookingDetail } from '../types';
import { BookingDriverHistory } from './BookingDriverHistory';
import styles from './BookingDriverSection.module.css';

/**
 * Khối "Tài xế" trên chi tiết đơn (ADR 0063).
 *
 * CHỈ đơn `with_driver` mới có tài xế: đơn khác ẩn hẳn khối, trừ khi còn một tài xế gán từ trước
 * (dữ liệu cũ) — khi đó hiện chỉ-đọc để không ai mất dấu người đang cầm xe. Gán xong là `pending`
 * cho tới khi tài xế nhận ở site khách; tài xế từ chối thì đơn quay về chưa có tài xế.
 * Bộ chọn hiện cả người BẬN (disable, nhãn "Bận" — không bao giờ nói bận ở đâu).
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
  const [selecting, setSelecting] = useState(false);
  const assign = useAssignBookingDriver(booking.id);

  const isWithDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const driver = booking.driver ?? null;

  // Chỉ tải danh sách khi thật sự mở bộ chọn — theo KHUNG GIỜ của đơn.
  const driversQ = useAssignableDrivers(
    { pickupAt: booking.pickupAt, returnAt: booking.returnAt, excludeBookingId: booking.id },
    selecting && isWithDriver,
  );

  if (!isWithDriver && !driver) return null;
  // Đã giao xe / đã khép ⇒ người cầm lái đã chốt: chỉ đọc (server cũng chặn — DRIVER_ASSIGNMENT_LOCKED).
  // Bộ chọn đọc `/drivers/assignable` (DRIVER_VIEW) — thiếu quyền thì không bày nút, như app native.
  const editable =
    canUpdate &&
    isWithDriver &&
    isDriverReassignable(booking.status) &&
    has(PERMISSION.DRIVER_VIEW);

  function submit(driverId: string | null) {
    if (assign.isPending) return;
    assign.mutate(driverId, {
      onSuccess: () => {
        message.success(driverId ? t('assigned') : t('unassignedToast'));
        setSelecting(false);
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

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
          <Button size="small" onClick={() => setSelecting(false)}>
            {t('close')}
          </Button>
        </div>
      ) : driver ? (
        <div className={styles.row}>
          <div className={styles.stack}>
            <span className={styles.strong}>
              {driver.name}{' '}
              <StatusTag
                value={driver.assignmentStatus}
                meta={DRIVER_ASSIGNMENT_STATUS_META}
                group="driverAssignmentStatus"
              />
            </span>
            <a href={`tel:${driver.phone}`} className={styles.link}>
              {driver.phone}
            </a>
            <span className={styles.meta}>
              {driver.respondedAt
                ? t('respondedAt', { time: fmt.dateTime(driver.respondedAt) })
                : t('assignedAt', { time: fmt.dateTime(driver.assignedAt) })}
            </span>
          </div>
          {editable ? (
            <div className={styles.actions}>
              <Button size="small" onClick={() => setSelecting(true)}>
                {t('change')}
              </Button>
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
          {editable ? (
            <Button size="small" type="primary" onClick={() => setSelecting(true)}>
              {t('assign')}
            </Button>
          ) : null}
        </div>
      )}
      {isWithDriver ? <BookingDriverHistory bookingId={booking.id} /> : null}
    </section>
  );
}
