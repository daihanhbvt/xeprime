'use client';

import { ClockCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import {
  clockText,
  countdownSegment,
  countdownState,
  holdRemainingMs,
  type CountdownState,
} from '@xeprime/types';
import styles from './Countdown.module.css';

/**
 * Nhịp đếm. Một giây là điều duy nhất đúng cho một đồng hồ hiện cả phút lẫn giây: nhịp thưa hơn
 * làm số nhảy cóc, còn nhịp dày hơn không đổi được gì mắt người nhìn thấy.
 */
const TICK_MS = 1_000;

/*
 * `countdownState` / `clockText` / `countdownSegment` đã chuyển sang `@xeprime/types`: chia
 * chặng là LUẬT trình bày cửa sổ tiền (ADR 0032 điều 2), và app native phải chia y hệt. Re-export
 * để nơi gọi cũ không phải đổi đường import.
 */
export { clockText, countdownSegment, countdownState, type CountdownState };

/**
 * Đồng hồ đếm ngược tới một mốc do SERVER chốt.
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
  segmentMs,
  labels,
  className,
}: {
  /** Mốc ISO từ API. */
  deadline: string;
  /** Dưới mốc này thì đổi sắc thái cảnh báo. */
  urgentMs: number;
  /** Chia thành chặng bao nhiêu mili-giây; bỏ trống thì đếm một mạch. */
  segmentMs?: number;
  labels: {
    remaining: string;
    expired: string;
    /** Nhãn chặng, ví dụ "lượt 2/2" — chỉ hiện khi có `segmentMs` và còn nhiều hơn một chặng. */
    segment?: (index: number, total: number) => string;
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
  const segment = segmentMs ? countdownSegment(remaining, segmentMs) : null;
  const shown = segment ? segment.remainingInSegment : remaining;

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
            {clockText(shown)}
          </span>
          {segment && segment.total > 1 && labels.segment ? (
            <span className={styles.segment} suppressHydrationWarning>
              {' '}
              {labels.segment(segment.index, segment.total)}
            </span>
          ) : null}
        </>
      )}
    </p>
  );
}
