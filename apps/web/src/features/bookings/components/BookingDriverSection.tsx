'use client';

import { App, Button, Select } from 'antd';
import { useState } from 'react';
import { SERVICE_TYPE } from '@xeprime/types';
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
  // Chỉ tải danh sách khi thật sự mở bộ chọn — mở chi tiết đơn không kéo theo API thừa.
  const driversQ = useAssignableDrivers(selecting);

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
            placeholder="Chọn tài xế đang hoạt động"
            loading={driversQ.isLoading}
            showSearch
            optionFilterProp="label"
            options={(driversQ.data?.items ?? []).map((d) => ({
              value: d.id,
              label: `${d.name} · ${d.phone}`,
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
