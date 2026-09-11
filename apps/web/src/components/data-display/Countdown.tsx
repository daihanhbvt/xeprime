'use client';

import { ClockCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { holdRemainingMs } from '@xeprime/types';
import styles from './Countdown.module.css';

/**
 * Nhịp đếm. Một giây là điều duy nhất đúng cho một đồng hồ hiện cả phút lẫn giây: nhịp thưa hơn
 * làm số nhảy cóc, còn nhịp dày hơn không đổi được gì mắt người nhìn thấy.
 */
const TICK_MS = 1_000;

export type CountdownState = 'normal' | 'urgent' | 'expired';

export function countdownState(remainingMs: number, urgentMs: number): CountdownState {
  if (remainingMs <= 0) return 'expired';
  return remainingMs <= urgentMs ? 'urgent' : 'normal';
}

/** `mm:ss` — không đưa giờ vào vì mọi cửa sổ dùng đồng hồ này đều không quá 60 phút mỗi chặng. */
export function clockText(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Chia thời gian còn lại thành CHẶNG — ADR 0032 điều 2 ("hai countdown 60 phút").
 *
 * Vì sao chia: cửa sổ trả cọc dài 2 giờ, và một con số "còn 118 phút" không tạo được cảm giác
 * cần hành động. Chia thành hai chặng 60 phút cho người dùng một đồng hồ họ đọc được ngay, và
 * mốc giao giữa hai chặng đúng là lúc worker bắn nhắc — hai kênh nói cùng một điều.
 *
 * `index` đếm từ 1 và là chặng ĐANG chạy; `total` là số chặng của cả cửa sổ.
 */
export function countdownSegment(
  remainingMs: number,
  segmentMs: number,
): { index: number; total: number; remainingInSegment: number } {
  if (segmentMs <= 0 || remainingMs <= 0) {
    return { index: 1, total: 1, remainingInSegment: Math.max(0, remainingMs) };
  }
  const rest = remainingMs % segmentMs;
  return {
    index: Math.ceil(remainingMs / segmentMs),
    total: Math.ceil(remainingMs / segmentMs),
    remainingInSegment: rest === 0 ? segmentMs : rest,
  };
}

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
