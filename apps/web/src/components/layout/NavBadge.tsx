'use client';

import { cx } from '@/lib/cx';
import styles from './NavBadge.module.css';

/** Trên ngưỡng này thì con số chính xác không còn đổi hành vi ai cả — "99+" là đủ. */
const OVERFLOW_AT = 99;

export interface NavBadgeProps {
  count: number;
  /** Có việc đã trễ / sắp trễ (quá giờ giao-trả, yêu cầu sắp hết hạn trả lời) — đỏ thay vì cam. */
  urgent?: boolean;
}

/**
 * Con số "cần xử lý" cạnh một mục menu.
 *
 * `aria-hidden` là CÓ CHỦ Ý: tên truy cập được của mục đã mang sẵn câu đầy đủ ("Yêu cầu đặt xe,
 * 3 việc cần xử lý, có việc gấp") do nơi gọi dựng. Để huy hiệu tự phát ra "3" nữa thì trình đọc
 * màn hình đọc con số hai lần, lần thứ hai không có ngữ cảnh gì. Màu đỏ vì thế không phải tín hiệu
 * duy nhất của "khẩn".
 *
 * Không dùng `Badge` của AntD: ở đây huy hiệu là một phần của dòng chữ (đẩy về cuối bằng
 * flexbox), không phải một chấm neo tuyệt đối vào góc một khối — `Badge` sẽ kéo theo
 * `position: relative` và một lớp bọc thừa cho đúng thứ ta không cần.
 */
export function NavBadge({ count, urgent = false }: NavBadgeProps) {
  if (count <= 0) return null;

  return (
    <span className={cx(styles.badge, urgent && styles.urgent)} aria-hidden>
      {count > OVERFLOW_AT ? `${OVERFLOW_AT}+` : count}
    </span>
  );
}
