'use client';

import { ClockCircleOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { bookingRequestRemainingMs } from '@xeprime/types';
import styles from './RespondDeadline.module.css';

/** Dưới mốc này thì đồng hồ chuyển sang sắc thái cảnh báo — cùng con số với lần nhắc cuối. */
const URGENT_MS = 15 * 60_000;

/**
 * Nhịp đếm. Một giây là điều duy nhất đúng cho một đồng hồ hiện cả phút lẫn giây: nhịp thưa
 * hơn làm số nhảy cóc, còn nhịp dày hơn không đổi được gì mắt người nhìn thấy.
 */
const TICK_MS = 1_000;

/** Còn bao lâu, ở dạng `mm:ss` — không đưa giờ vào vì cửa sổ tối đa chỉ có 60 phút. */
function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export type RespondDeadlineState = 'normal' | 'urgent' | 'expired';

export function respondDeadlineState(remainingMs: number): RespondDeadlineState {
  if (remainingMs <= 0) return 'expired';
  return remainingMs <= URGENT_MS ? 'urgent' : 'normal';
}

/**
 * Đồng hồ đếm ngược tới HẠN PHẢN HỒI của một yêu cầu thuê.
 *
 * Vì sao là một đồng hồ chạy chứ không phải một dòng "hết hạn lúc 14:35": người trực hộp thư
 * đang quét mười thẻ một lúc, và "còn 4:12" trả lời được câu hỏi của họ mà không bắt họ trừ
 * nhẩm. Khi còn dưới 15 phút — đúng mốc mà worker gửi lần nhắc cuối — nó đổi sắc thái, nên hai
 * kênh nói cùng một điều thay vì hai điều gần giống nhau.
 *
 * Đồng hồ chạy bằng giờ CỦA MÁY KHÁCH, còn cửa chặn thật nằm ở server (`respond_by` trong câu
 * `UPDATE` của lệnh duyệt). Lệch giờ vài giây vì thế chỉ làm con số hiển thị lệch vài giây,
 * không bao giờ mở ra một đường duyệt sau hạn.
 *
 * `suppressHydrationWarning`: giá trị đầu tiên được tính lúc render, nên HTML của server và lần
 * hydrate đầu của client lệch nhau đúng vài giây — đó là bản chất của một đồng hồ, không phải
 * một khác biệt cần sửa.
 */
export function RespondDeadline({ respondBy }: { respondBy: string }) {
  const t = useTranslations('BookingRequests.deadline');
  /*
   * State là "BÂY GIỜ", không phải "còn bao lâu".
   *
   * Khác biệt nghe nhỏ nhưng quyết định: số còn lại được SUY ra lúc render từ `now` và
   * `respondBy`, nên đổi prop là con số đúng ngay ở lần render kế tiếp — không cần một
   * `setState` đồng bộ trong thân effect để "đặt lại" (thứ mà React gọi là render xếp tầng, và
   * `react-hooks/set-state-in-effect` chặn đúng chỗ đó). Effect chỉ còn làm một việc duy nhất
   * mà nó nên làm: nhích đồng hồ.
   */
  const [now, setNow] = useState(() => Date.now());
  const remaining = bookingRequestRemainingMs(respondBy, new Date(now));

  useEffect(() => {
    // Hết giờ thì không hẹn nhịp nào cả: một `setInterval` chạy mãi trên một thẻ đã chốt là rác
    // thuần tuý, và một hộp thư mở cả ngày có thể có hàng chục thẻ như thế.
    if (bookingRequestRemainingMs(respondBy) <= 0) return;

    const timer = setInterval(() => {
      setNow(Date.now());
      if (bookingRequestRemainingMs(respondBy) <= 0) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [respondBy]);

  const state = respondDeadlineState(remaining);

  return (
    <p
      className={
        state === 'expired' ? styles.expired : state === 'urgent' ? styles.urgent : styles.normal
      }
      // Cập nhật lịch sự: trình đọc màn hình không bị đọc lại mỗi giây, nhưng người dùng vẫn
      // được biết khi trạng thái đổi.
      role="status"
      aria-live="polite"
      suppressHydrationWarning
    >
      <ClockCircleOutlined aria-hidden="true" />{' '}
      {state === 'expired' ? (
        t('expired')
      ) : (
        <>
          {t('remaining')}{' '}
          <span className={styles.clock} suppressHydrationWarning>
            {clock(remaining)}
          </span>
        </>
      )}
    </p>
  );
}
