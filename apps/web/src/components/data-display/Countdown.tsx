'use client';

import { ClockCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { countdownState, holdRemainingMs, longClockText } from '@xeprime/types';
import styles from './Countdown.module.css';

/**
 * Nhịp đếm. Một giây là điều duy nhất đúng cho một đồng hồ hiện cả phút lẫn giây: nhịp thưa hơn
 * làm số nhảy cóc, còn nhịp dày hơn không đổi được gì mắt người nhìn thấy.
 */
const TICK_MS = 1_000;

/**
 * Đồng hồ đếm ngược tới một mốc do SERVER chốt — một mạch, không chia chặng.
 *
 * Đồng hồ chạy bằng giờ CỦA MÁY KHÁCH, còn cửa chặn thật luôn nằm ở server (`expires_at`,
 * `respond_by` trong chính câu `UPDATE` của lệnh). Lệch giờ vài giây vì thế chỉ làm con số hiển
 * thị lệch vài giây, không bao giờ mở ra một đường đi sau hạn.
 *
 * `suppressHydrationWarning`: giá trị đầu tiên tính lúc render nên HTML của server và lần hydrate
 * đầu của client lệch nhau đúng vài giây — đó là bản chất của một đồng hồ, không phải một khác
 * biệt cần sửa.
 */
export function Countdown({
  deadline,
  urgentMs,
  labels,
  className,
}: {
  /** Mốc ISO từ API. */
  deadline: string;
  /** Dưới mốc này thì đổi sắc thái cảnh báo. */
  urgentMs: number;
  labels: {
    remaining: string;
    expired: string;
  };
  className?: string;
}) {
  /*
   * State là "BÂY GIỜ", không phải "còn bao lâu".
   *
   * Khác biệt nghe nhỏ nhưng quyết định: số còn lại được SUY ra lúc render từ `now` và
   * `deadline`, nên đổi prop là con số đúng ngay ở lần render kế tiếp — không cần một `setState`
   * đồng bộ trong thân effect để "đặt lại" (thứ mà `react-hooks/set-state-in-effect` chặn đúng
   * chỗ đó). Effect chỉ còn làm một việc: nhích đồng hồ.
   */
  const [now, setNow] = useState(() => Date.now());
  const remaining = holdRemainingMs(deadline, new Date(now));

  useEffect(() => {
    // Hết giờ thì không hẹn nhịp nào cả: một `setInterval` chạy mãi trên một thẻ đã chốt là rác
    // thuần tuý, và một màn hình mở cả ngày có thể có hàng chục thẻ như thế.
    if (holdRemainingMs(deadline) <= 0) return;

    const timer = setInterval(() => {
      setNow(Date.now());
      if (holdRemainingMs(deadline) <= 0) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [deadline]);

  const state = countdownState(remaining, urgentMs);

  return (
    <p
      className={[
        state === 'expired' ? styles.expired : state === 'urgent' ? styles.urgent : styles.normal,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // Cập nhật lịch sự: trình đọc màn hình không bị đọc lại mỗi giây, nhưng người dùng vẫn
      // được biết khi trạng thái đổi.
      role="status"
      aria-live="polite"
      suppressHydrationWarning
    >
      <ClockCircleOutlined aria-hidden="true" />{' '}
      {state === 'expired' ? (
        labels.expired
      ) : (
        <>
          {labels.remaining}{' '}
          <span className={styles.clock} suppressHydrationWarning>
            {/*
              MỘT con số cho toàn bộ thời gian còn lại (`h:mm:ss` khi quá một giờ) — không chia chặng
              60′: "15:45 · giờ 2/2" đọc thành "còn 15 phút" trong khi thật ra còn 1:15:45.
            */}
            {longClockText(remaining)}
          </span>
        </>
      )}
    </p>
  );
}
