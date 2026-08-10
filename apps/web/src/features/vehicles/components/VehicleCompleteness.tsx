'use client';

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
 */
export function publishRequiredLabel(label: string): ReactNode {
  return (
    <span className={styles.label}>
      {label}
      <PublishRequiredMark />
      <span className={styles.srOnly}> (cần cho duyệt công khai)</span>
    </span>
  );
}

/** Chú giải hai giai đoạn, đặt đầu form tạo/sửa (Figma `60:70`). */
export function CompletenessLegend() {
  return (
    <div className={styles.legend}>
      <p className={styles.legendTitle}>Mô hình hoàn thiện thông tin xe hai giai đoạn</p>
      <ul className={styles.legendItems}>
        <li>
          <span className={styles.required} aria-hidden="true">
            *
          </span>
          Thông tin bắt buộc (cần thiết để lưu xe nội bộ)
        </li>
        <li>
          <PublishRequiredMark />
          Cần bổ sung trước khi gửi duyệt công khai lên sàn
        </li>
      </ul>
    </div>
  );
}
