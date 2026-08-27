'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import styles from './VehicleCompleteness.module.css';

/**
 * Mô hình hoàn thiện thông tin xe **hai giai đoạn** (Figma `60:70` CompletenessLegend).
 *
 * Đây là quy ước riêng của Fleet, nên nó sống trong feature chứ không phải trong
 * `components/form`: hai dấu hiệu dưới đây ánh xạ 1-1 vào hai cột của ma trận trường
 * Figma `65:4844` — "Save Req" và "Publish Req".
 *
 *  - `*`  bắt buộc để **lưu** xe (nội bộ): code, name, vehicleType, serviceType, operationStatus
 *  - `●`  bắt buộc để **gửi duyệt công khai**: plateNumber, weekdayPrice, mainImageUrl, description
 *
 * `*` do `required` của field dùng chung vẽ (AntD). `●` là dấu hiệu của Fleet, vẽ ở đây.
 */
export function PublishRequiredMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      ●
    </span>
  );
}

/**
 * Nhãn field kèm dấu "cần cho duyệt công khai".
 *
 * Dấu `●` là `aria-hidden`, nên phần chữ trong ngoặc mới là thứ trình đọc màn hình đọc được —
 * không được bỏ nó đi để "cho gọn", nếu không người dùng screen reader mất hoàn toàn thông tin
 * mà người dùng nhìn thấy đang có.
 *
 * Là COMPONENT, không phải hàm trả `ReactNode`: phần chữ cho trình đọc màn hình phải dịch
 * được, và chỉ component mới gọi được hook dịch. Nơi gọi truyền `label` đã dịch sẵn.
 */
export function PublishRequiredLabel({ label }: { label: ReactNode }) {
  const t = useTranslations('Vehicles.completeness');

  return (
    <span className={styles.label}>
      {label}
      <PublishRequiredMark />
      <span className={styles.srOnly}>{t('publishRequiredSr')}</span>
    </span>
  );
}

/** Chú giải hai giai đoạn, đặt đầu form tạo/sửa (Figma `60:70`). */
export function CompletenessLegend() {
  const t = useTranslations('Vehicles.completeness');

  return (
    <div className={styles.legend}>
      <p className={styles.legendTitle}>{t('legendTitle')}</p>
      <ul className={styles.legendItems}>
        <li>
          <span className={styles.required} aria-hidden="true">
            *
          </span>
          {t('requiredItem')}
        </li>
        <li>
          <PublishRequiredMark />
          {t('publishItem')}
        </li>
      </ul>
    </div>
  );
}
