'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import styles from './BookingSteps.module.css';

/**
 * **Ba** bước biểu mẫu của luồng đặt xe (Wave 9).
 *
 * Hai thứ CỐ Ý không phải bước:
 *  - `otp` là một trạng thái BÊN TRONG bước "Liên hệ" — không phải ai cũng đi qua nó (tài khoản
 *    đã xác thực đúng số thì bỏ hẳn), nên để nó chiếm một ô cố định làm thanh tiến trình lúc có
 *    lúc không, và người dùng đếm sai còn mấy bước nữa;
 *  - `done` là KẾT QUẢ, không phải việc phải làm. Bước xong rồi thì thanh tiến trình cũng hết
 *    việc — màn thành công tự nói lên nó.
 */
export const BOOKING_STEPS = [
  { key: 'time', label: 'Thời gian' },
  { key: 'contact', label: 'Liên hệ' },
  { key: 'review', label: 'Xác nhận' },
] as const;

export type BookingFormStepKey = (typeof BOOKING_STEPS)[number]['key'];

/** Trạng thái của cả luồng = ba bước biểu mẫu + hai trạng thái không nằm trên thanh tiến trình. */
export type BookingStepKey = BookingFormStepKey | 'otp' | 'done';

interface BookingStepsProps {
  current: BookingStepKey;
  /**
   * Đổi NHÃN một bước cho biến thể của luồng — luồng đặt hộ của gian hàng gọi bước "Liên hệ"
   * là "Khách hàng" (staff nhập thông tin khách, không phải thông tin của mình). Cấu trúc và
   * thứ tự bước là bất biến, chỉ nhãn được ghi đè.
   */
  labels?: Partial<Record<BookingFormStepKey, string>>;
}

/**
 * Thanh bước dùng chung cho cả modal desktop lẫn bottom sheet mobile.
 *
 * Tự vẽ thay vì dùng `Steps` của AntD: thiết kế là một hàng "① Thời gian / ② Liên hệ / …" với
 * dấu gạch phân cách, không phải stepper có đường nối; và ở mobile bốn bước phải nằm gọn MỘT
 * hàng ngang, điều mà `Steps` chỉ làm được sau khi ghi đè khá nhiều.
 */
export function BookingSteps({ current, labels }: BookingStepsProps) {
  /*
   * `otp` nằm TRONG bước "Liên hệ" nên vẫn tô sáng ô đó; `done` đã qua hết cả ba bước. Nhờ vậy
   * thanh tiến trình không bao giờ trống hay nhảy về đầu ở hai trạng thái ngoài biểu mẫu.
   */
  const currentIndex =
    current === 'otp'
      ? BOOKING_STEPS.findIndex((s) => s.key === 'contact')
      : current === 'done'
        ? BOOKING_STEPS.length
        : BOOKING_STEPS.findIndex((s) => s.key === current);

  return (
    <ol className={styles.steps} aria-label="Tiến trình đặt xe">
      {BOOKING_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.key}
            className={`${styles.step} ${active ? styles.active : ''} ${done ? styles.done : ''}`}
            aria-current={active ? 'step' : undefined}
          >
            <span className={styles.dot} aria-hidden>
              {done ? <CheckCircleFilled /> : index + 1}
            </span>
            <span className={styles.label}>{labels?.[step.key] ?? step.label}</span>
            {/* Trạng thái cho screen reader — màu và dấu tích là tín hiệu thị giác. */}
            {done ? <span className={styles.srOnly}>(đã xong)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
