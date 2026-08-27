'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import styles from './BookingSteps.module.css';

/** Một ô trên thanh tiến trình. `label` do NƠI GỌI cấp — xem docblock component. */
export interface BookingStepItem {
  readonly key: string;
  readonly label: string;
}

/**
 * Mọi trạng thái mà một luồng đặt xe có thể đứng — gồm cả những trạng thái KHÔNG có ô riêng
 * trên thanh (`otp`, `done`). Nơi gọi tự quy các trạng thái đó về một khoá bước trước khi
 * truyền vào (xem `current`).
 */
export type BookingStepKey = 'trip' | 'time' | 'contact' | 'review' | 'otp' | 'done';

interface BookingStepsProps {
  /**
   * Danh sách bước theo thứ tự. Truyền từ ngoài vào chứ không cứng trong này vì hai luồng có
   * số bước khác nhau **một cách chính đáng**: luồng khách chỉ còn `Chuyến đi → Xác nhận`
   * (khách đã đăng nhập không phải nhập gì để liên hệ), còn luồng đặt hộ của gian hàng vẫn cần
   * một bước `Khách hàng` riêng vì nhân viên thật sự phải chọn/nhập hồ sơ khách ở đó.
   *
   * `label` cũng đi kèm ở đây: luồng khách đã i18n hoá nên nhãn đến từ `t(...)`, còn cổng quản
   * lý vẫn dùng chuỗi tiếng Việt trong mã. Component không được biết bên nào là bên nào.
   */
  steps: readonly BookingStepItem[];
  /**
   * Bước đang đứng. Trạng thái ngoài biểu mẫu phải được nơi gọi quy đổi TRƯỚC:
   * `otp` → khoá của bước mà nó thuộc về, `done` → truyền thẳng `'done'` (đã qua hết).
   */
  current: BookingStepKey;
}

/**
 * Thanh bước dùng chung cho cả modal desktop lẫn bottom sheet mobile.
 *
 * Tự vẽ thay vì dùng `Steps` của AntD: thiết kế là một hàng "① Thời gian / ② Liên hệ / …" với
 * dấu gạch phân cách, không phải stepper có đường nối; và ở mobile các bước phải nằm gọn MỘT
 * hàng ngang, điều mà `Steps` chỉ làm được sau khi ghi đè khá nhiều.
 *
 * Hai thứ CỐ Ý không bao giờ là một ô ở đây:
 *  - **OTP** — không phải ai cũng đi qua (tài khoản đã xác thực đúng số thì bỏ hẳn), nên để nó
 *    chiếm một ô cố định làm thanh tiến trình lúc có lúc không và người dùng đếm sai còn mấy
 *    bước nữa;
 *  - **Màn kết quả** — là KẾT QUẢ, không phải việc phải làm.
 */
export function BookingSteps({ steps, current }: BookingStepsProps) {
  /*
   * Nhãn từng ô đến từ NƠI GỌI (xem `steps`), nhưng hai chuỗi của riêng component — tên khả
   * truy cập của danh sách và trạng thái đọc cho screen reader — thì thuộc về nó, nên dịch ở
   * đây. Luồng khách và luồng đặt hộ dùng chung bó message nên không bên nào phải biết bên nào.
   */
  const t = useTranslations('BookingRequests.flow');
  const found = steps.findIndex((s) => s.key === current);
  // `-1` = nơi gọi quên quy đổi một trạng thái ngoài biểu mẫu; thà sáng ô đầu còn hơn trống trơn.
  const currentIndex = current === 'done' ? steps.length : found < 0 ? 0 : found;

  return (
    <ol className={styles.steps} aria-label={t('stepsLabel')}>
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.key}
            className={cx(styles.step, active && styles.active, done && styles.done)}
            aria-current={active ? 'step' : undefined}
          >
            <span className={styles.dot} aria-hidden>
              {done ? <CheckCircleFilled /> : index + 1}
            </span>
            <span className={styles.label}>{step.label}</span>
            {/* Trạng thái cho screen reader — màu và dấu tích là tín hiệu thị giác. */}
            {done ? <span className={styles.srOnly}>{t('stepDone')}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
