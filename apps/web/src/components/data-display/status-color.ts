import { STATUS_COLOR, type StatusColor } from '@xeprime/types';

import styles from './status-color.module.css';

/**
 * Màu CHỮ (token) của một màu trạng thái ngữ nghĩa — cho icon, chấm mốc thời gian, vạch… đứng
 * cạnh một `StatusTag` và phải cùng sắc thái với nó. Phần tử cần màu NỀN thì đặt
 * `background: currentColor` và nhận màu từ class này.
 *
 * Suy từ `StatusMeta.color` chứ không từ mã trạng thái: thêm một trạng thái vào `@xeprime/types`
 * là có màu đúng ngay, không ai phải nhớ sửa một `switch` thứ hai theo mã.
 *
 * `SPECIAL`/`ACCENT` không có token màu riêng ngoài preset của Tag, nên về màu trung tính — thẻ
 * trạng thái bên cạnh vẫn mang đúng màu của nó.
 */
export function statusColorClass(color: StatusColor | undefined): string | undefined {
  switch (color) {
    case STATUS_COLOR.SUCCESS:
      return styles.success;
    case STATUS_COLOR.DANGER:
      return styles.danger;
    case STATUS_COLOR.WARNING:
      return styles.warning;
    case STATUS_COLOR.WAITING:
      return styles.waiting;
    case STATUS_COLOR.INFO:
      return styles.info;
    case STATUS_COLOR.PROCESSING:
      return styles.processing;
    default:
      return styles.neutral;
  }
}
