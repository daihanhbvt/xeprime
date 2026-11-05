'use client';

import { useEffect, useState } from 'react';
import { bookingRequestRemainingMs, longClockText } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { cx } from '@/lib/cx';
import styles from './RespondDeadline.module.css';

/** Một giây — đồng hồ hiện cả phút lẫn giây; nhịp thưa hơn làm số nhảy cóc. */
const TICK_MS = 1_000;

/**
 * "Chờ xác nhận: 59:39" / "Chờ thanh toán: 1:12:05" ở dải đầu thẻ chuyến (Figma Partner-XePrime,
 * 05/11/2026) — đồng hồ đếm ngược tới MỘT hạn do server đóng băng (hạn phản hồi của gian hàng, hạn
 * khách chuyển tiền giữ chỗ). Đồng hồ chạy bằng giờ của máy; cửa chặn thật nằm ở server, nên lệch
 * vài giây chỉ lệch con số hiển thị, không mở ra đường làm sau hạn.
 *
 * State là "BÂY GIỜ", không phải "còn bao lâu": số còn lại suy lúc render, đổi `deadline` là đúng
 * ngay lần render kế. Hết giờ thì dừng hẳn nhịp — một hộp thư mở cả ngày có hàng chục thẻ đã chốt.
 */
export function CountdownClock({
  deadline,
  label,
  expiredLabel,
  urgentMinutes,
  title,
  compact = false,
}: {
  deadline: string;
  /** Mốc tuyệt đối khi rê chuột ("Hạn khách thanh toán: 13:38 05/11"). */
  title?: string;
  /** Nhãn trước con số ("Chờ xác nhận:"). */
  label: string;
  /** Câu thay cho đồng hồ khi đã hết hạn. */
  expiredLabel: string;
  /** Dưới mốc này con số thành viên nền cảnh báo — cùng mốc với lời nhắc cuối của worker. */
  urgentMinutes: number;
  /** Chân thẻ Kanban: chỉ hiện con số, nhãn chỉ còn cho trình đọc màn hình. */
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = bookingRequestRemainingMs(deadline, new Date(now));

  useEffect(() => {
    if (bookingRequestRemainingMs(deadline) <= 0) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (bookingRequestRemainingMs(deadline) <= 0) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [deadline]);

  const expired = remaining <= 0;
  const urgent = !expired && remaining <= urgentMinutes * 60_000;

  return (
    <p
      className={cx(
        expired ? styles.headerExpired : urgent ? styles.headerUrgent : styles.header,
        compact && styles.compact,
      )}
      // Cập nhật lịch sự: không đọc lại mỗi giây, vẫn báo khi trạng thái đổi.
      role="status"
      aria-live="polite"
      title={title}
      suppressHydrationWarning
    >
      <LineIcon name="time-circle" className={styles.headerIcon} />
      {expired ? (
        expiredLabel
      ) : (
        <>
          <span className={compact ? styles.srOnly : undefined}>{label} </span>
          <span className={styles.headerClock} suppressHydrationWarning>
            {longClockText(remaining)}
          </span>
        </>
      )}
    </p>
  );
}
