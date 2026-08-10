'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import styles from './BookingSteps.module.css';

/**
 * Bốn bước của luồng đặt xe. Nhãn ngắn theo yêu cầu wave 4A.
 *
 * ⚠️ Figma `66:117` và các ảnh duyệt ghi bước 1 là "Ngày giờ"; prompt wave 4A yêu cầu
 * "Thời gian" và prompt là nguồn sự thật cao hơn ảnh. Đổi ở đúng một dòng dưới đây.
 */
export const BOOKING_STEPS = [
  { key: 'dates', label: 'Thời gian' },
  { key: 'contact', label: 'Liên hệ' },
  { key: 'otp', label: 'Xác thực' },
  { key: 'done', label: 'Hoàn tất' },
] as const;

export type BookingStepKey = (typeof BOOKING_STEPS)[number]['key'];

interface BookingStepsProps {
  current: BookingStepKey;
  /**
   * Bước đã xong nhưng người dùng KHÔNG phải đi qua (tài khoản đã xác thực SĐT thì bỏ qua OTP).
   * Vẫn hiện đủ bốn bước — giấu đi một bước làm thanh tiến trình nhảy số và người dùng mất mốc.
   */
  skipped?: readonly BookingStepKey[];
}

/**
 * Thanh bước dùng chung cho cả modal desktop lẫn bottom sheet mobile.
 *
 * Tự vẽ thay vì dùng `Steps` của AntD: thiết kế là một hàng "① Thời gian / ② Liên hệ / …" với
 * dấu gạch phân cách, không phải stepper có đường nối; và ở mobile bốn bước phải nằm gọn MỘT
 * hàng ngang, điều mà `Steps` chỉ làm được sau khi ghi đè khá nhiều.
 */
export function BookingSteps({ current, skipped = [] }: BookingStepsProps) {
  const currentIndex = BOOKING_STEPS.findIndex((s) => s.key === current);

  return (
    <ol className={styles.steps} aria-label="Tiến trình đặt xe">
      {BOOKING_STEPS.map((step, index) => {
        const done = index < currentIndex || skipped.includes(step.key);
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
            <span className={styles.label}>{step.label}</span>
            {/* Trạng thái cho screen reader — màu và dấu tích là tín hiệu thị giác. */}
            {done ? <span className={styles.srOnly}>(đã xong)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
