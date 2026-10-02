'use client';

import { Segmented } from 'antd';
import styles from './QueueViewSwitch.module.css';

/**
 * Công tắc GÓC NHÌN của một hàng đợi tiền ("việc cần làm" ↔ lịch sử) — đứng RIÊNG một hàng, ngoài
 * `FilterBar`.
 *
 * Nó không phải một bộ lọc mà là chọn SỔ nào đang nhìn: để trong thanh lọc thì giá trị mặc định
 * cũng đếm là "đang lọc" (huy hiệu "Lọc 1" khi chưa lọc gì, nút "Xoá bộ lọc" sáng sẵn), và trên
 * điện thoại nó bị giấu vào tấm lọc — đúng thứ người dùng cần đổi nhiều nhất.
 */
export function QueueViewSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.bar}>
      <Segmented<T> aria-label={label} value={value} options={[...options]} onChange={onChange} />
    </div>
  );
}
