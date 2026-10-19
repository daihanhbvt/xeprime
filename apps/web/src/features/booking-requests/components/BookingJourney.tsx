'use client';

import { CheckOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import styles from './BookingJourney.module.css';

/** Các chặng của một chuyến từ phía khách — ADR 0044: yêu cầu → duyệt → giữ chỗ → đơn thuê. */
export type BookingJourneyStage = 'trip' | 'request' | 'payment' | 'confirmed';

interface BookingJourneyProps {
  /** Chặng khách đang đứng trong hộp yêu cầu thuê — `trip` (chọn/sửa chuyến) hoặc `request`. */
  current: BookingJourneyStage;
  /**
   * Chuyến này có khoản thu trước không (`fees.holdAmount` của báo giá server). Không có thì không
   * có chặng "Thanh toán giữ chỗ" — vẽ nó ra là hứa một bước không bao giờ tới (ADR 0044 điều 4).
   */
  hasHoldStage: boolean;
}

/**
 * Tiến trình CẢ HÀNH TRÌNH đặt xe — "Bước 2 / 4 · Gửi yêu cầu" (Figma `19727:55959`).
 *
 * Khác `BookingSteps` (thanh bước của BIỂU MẪU, luồng đặt hộ của gian hàng vẫn dùng): khách cần biết
 * gửi xong chưa phải là xong — còn chờ chủ xe nhận và trả tiền giữ chỗ. Vì thế thanh này kể đủ các
 * chặng tới lúc có đơn thuê, dù hộp thoại chỉ chứa hai chặng đầu.
 *
 * Chữ chú thích là thứ duy nhất đọc được bằng mắt; các chấm là hình minh hoạ cho nó, nên nhãn từng
 * chấm chỉ dành cho trình đọc màn hình.
 */
export function BookingJourney({ current, hasHoldStage }: BookingJourneyProps) {
  const t = useTranslations('BookingRequests.flow');
  const stages: BookingJourneyStage[] = hasHoldStage
    ? ['trip', 'request', 'payment', 'confirmed']
    : ['trip', 'request', 'confirmed'];
  // Chặng không có trên thanh (vd 'payment' của chuyến không thu trước) ⇒ đứng ở chặng đầu.
  const currentStage: BookingJourneyStage = stages.includes(current) ? current : 'trip';
  const currentIndex = stages.indexOf(currentStage);

  return (
    <div className={styles.journey}>
      <p className={styles.caption}>
        {t('journey.caption', {
          current: currentIndex + 1,
          total: stages.length,
          label: t(`journey.steps.${currentStage}`),
        })}
      </p>
      <ol className={styles.dots} aria-label={t('journey.label')}>
        {stages.map((stage, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={stage}
              className={cx(styles.dot, done && styles.done, active && styles.active)}
              aria-current={active ? 'step' : undefined}
            >
              <span aria-hidden>{done ? <CheckOutlined /> : index + 1}</span>
              <span className={styles.srOnly}>
                {t(`journey.steps.${stage}`)}
                {done ? ` · ${t('stepDone')}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
