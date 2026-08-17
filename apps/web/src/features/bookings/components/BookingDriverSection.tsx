'use client';

import { App, Button, Select } from 'antd';
import { useState } from 'react';
import { SERVICE_TYPE, routeTypeLabel } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { useAssignableDrivers } from '@/features/drivers/hooks/use-drivers';
import { useAssignBookingDriver } from '../hooks/use-booking-mutations';
import type { BookingDetail } from '../types';
import styles from './BookingDriverSection.module.css';

/**
 * Khối "Tài xế" trên chi tiết đơn (17/08 — nghiệp vụ xe có tài xế, mức tối thiểu).
 *
 * Hiện với MỌI đơn (shop muốn cắt tài xế đưa xe cho chuyến tự lái vẫn được), nhưng chỉ đơn
 * `with_driver` chưa phân công mới bị nhắc — đó là đơn mà thiếu tài xế nghĩa là chưa chạy được.
 * Danh sách chọn chỉ gồm tài xế ĐANG hoạt động; server + composite FK ở DB validate lại.
 */
export function BookingDriverSection({
  booking,
  canUpdate,
}: {
  booking: BookingDetail;
  canUpdate: boolean;
}) {
  const { message } = App.useApp();
  const [selecting, setSelecting] = useState(false);
  const assign = useAssignBookingDriver(booking.id);
  // Chỉ tải danh sách khi thật sự mở bộ chọn — theo KHUNG GIỜ của đơn (17/08): người bận
  // hoặc GPLX hết hạn vẫn hiện nhưng bị disable kèm lý do; backend kiểm lại trong transaction.
  const driversQ = useAssignableDrivers(
    {
      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,
      excludeBookingId: booking.id,
    },
    selecting,
  );

  const isWithDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const driver = booking.driver ?? null;

  function submit(driverId: string | null) {
    assign.mutate(driverId, {
      onSuccess: () => {
        message.success(driverId ? 'Đã gán tài xế' : 'Đã bỏ gán tài xế');
        setSelecting(false);
      },
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.blockTitle}>Tài xế</h3>

      {/* Tài xế cần biết mình chạy đâu — hành trình nằm ngay cạnh việc phân công. */}
      {isWithDriver && booking.routeType ? (
        <p className={styles.meta}>
          {routeTypeLabel(booking.routeType)}
          {booking.pickupAddress ? ` · Đón: ${booking.pickupAddress}` : ''}
          {booking.destination ? ` → ${booking.destination}` : ''}
        </p>
      ) : null}

      {driver && !selecting ? (
        <div className={styles.row}>
          <div className={styles.stack}>
            <span className={styles.strong}>{driver.name}</span>
            <a href={`tel:${driver.phone}`} className={styles.link}>
              {driver.phone}
            </a>
          </div>
          {canUpdate ? (
            <div className={styles.actions}>
              <Button size="small" onClick={() => setSelecting(true)}>
                Đổi
              </Button>
              <Button size="small" loading={assign.isPending} onClick={() => submit(null)}>
                Bỏ gán
              </Button>
            </div>
          ) : null}
        </div>
      ) : selecting ? (
        <div className={styles.row}>
          <Select
            className={styles.select}
            placeholder="Chọn tài xế khả dụng trong khung giờ đơn"
            loading={driversQ.isLoading}
            showSearch
            optionFilterProp="label"
            options={(driversQ.data ?? []).map((d) => ({
              value: d.id,
              // Người không khả dụng vẫn hiện kèm LÝ DO — disable, không giấu.
              label: d.busy
                ? `${d.name} · ${d.phone} — bận khung giờ này`
                : d.licenseExpired
                  ? `${d.name} · ${d.phone} — GPLX hết hạn`
                  : `${d.name} · ${d.phone}`,
              disabled: d.busy || d.licenseExpired,
            }))}
            // 0 tài xế không phải lỗi — nói thẳng và trỏ tới trang tạo hồ sơ.
            notFoundContent={driversQ.isLoading ? 'Đang tải…' : 'Chưa có tài xế nào đang hoạt động'}
            onChange={(value: string) => submit(value)}
            disabled={assign.isPending}
            aria-label="Chọn tài xế cho đơn"
          />
          <Button size="small" onClick={() => setSelecting(false)}>
            Đóng
          </Button>
        </div>
      ) : (
        <div className={styles.row}>
          <span className={isWithDriver ? styles.missing : styles.meta}>
            {isWithDriver ? 'Đơn có tài xế — chưa phân công' : 'Chưa phân công'}
          </span>
          {canUpdate ? (
            <Button size="small" type={isWithDriver ? 'primary' : 'default'} onClick={() => setSelecting(true)}>
              Gán tài xế
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
