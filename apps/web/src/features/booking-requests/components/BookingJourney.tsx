'use client';

import { CheckOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import styles from './BookingJourney.module.css';

/** Các chặng của một chuyến từ phía khách — ADR 0044: yêu cầu → duyệt → giữ chỗ → đơn thuê. */
export type BookingJourneyStage = 'trip' | 'request' | 'payment' | 'confirmed';

/**
 * Các chặng của luồng ĐẶT HỘ (gian hàng lập đơn tay). Không có duyệt, không có giữ chỗ: người bấm
 * là chính gian hàng, và đơn ra đời ngay lúc bấm tạo — nên chỉ có ba chặng.
 */
export type StaffJourneyStage = 'trip' | 'review' | 'created';

const STAFF_STAGES: readonly StaffJourneyStage[] = ['trip', 'review', 'created'];

type BookingJourneyProps =
  | {
      audience?: 'customer';
      /** Chặng khách đang đứng trong hộp yêu cầu thuê — `trip` (chọn/sửa chuyến) hoặc `request`. */
      current: BookingJourneyStage;
      /**
       * Chuyến này có khoản thu trước không (`fees.holdAmount` của báo giá server). Không có thì
       * không có chặng "Thanh toán giữ chỗ" — vẽ nó ra là hứa một bước không bao giờ tới (ADR 0044
       * điều 4).
       */
      hasHoldStage: boolean;
      /**
       * Cả hành trình đã xong (chuyến đã xác nhận — Figma `19759:40232` "Bước 4 / 4 · Đã xác
       * nhận"): mọi chấm thành dấu tích, kể cả chấm cuối. Không có cờ này thì chặng cuối luôn là
       * "đang đứng".
       */
      complete?: boolean;
    }
  | {
      /** Luồng đặt hộ của gian hàng — cùng hình thái thanh, chặng riêng. */
      audience: 'staff';
      current: StaffJourneyStage;
    };

/** Chặng + nhãn đã dịch — phần khác nhau giữa hai đối tượng, còn lại dựng chung. */
interface JourneyStep {
  key: string;
  label: string;
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
 *
 * Luồng ĐẶT HỘ của gian hàng (`audience="staff"`) dùng CÙNG thanh này với ba chặng của nó, để hai
 * luồng đặt xe trông là một sản phẩm — trước 26/10/2026 nó dùng thanh bước biểu mẫu cũ.
 */
export function BookingJourney(props: BookingJourneyProps) {
  const t = useTranslations('BookingRequests.flow');
  const tStaff = useTranslations('BookingRequests.staffFlow');

  let steps: JourneyStep[];
  let currentKey: string;
  let complete = false;
  if (props.audience === 'staff') {
    steps = STAFF_STAGES.map((stage) => ({ key: stage, label: tStaff(`journey.${stage}`) }));
    currentKey = props.current;
  } else {
    const stages: BookingJourneyStage[] = props.hasHoldStage
      ? ['trip', 'request', 'payment', 'confirmed']
      : ['trip', 'request', 'confirmed'];
    steps = stages.map((stage) => ({ key: stage, label: t(`journey.steps.${stage}`) }));
    // Chặng không có trên thanh (vd 'payment' của chuyến không thu trước) ⇒ đứng ở chặng đầu.
    currentKey = stages.includes(props.current) ? props.current : 'trip';
    complete = props.complete ?? false;
  }

  const currentIndex = complete
    ? steps.length - 1
    : steps.findIndex((step) => step.key === currentKey);
  const caption = steps[currentIndex]!;

  return (
    <div className={styles.journey}>
      <p className={styles.caption}>
        {t('journey.caption', {
          current: currentIndex + 1,
          total: steps.length,
          label: caption.label,
        })}
      </p>
      <ol className={styles.dots} aria-label={t('journey.label')}>
        {steps.map((step, index) => {
          const done = complete || index < currentIndex;
          const active = !complete && index === currentIndex;
          return (
            <li
              key={step.key}
              className={cx(styles.dot, done && styles.done, active && styles.active)}
              aria-current={active ? 'step' : undefined}
            >
              <span aria-hidden>{done ? <CheckOutlined /> : index + 1}</span>
              <span className={styles.srOnly}>
                {step.label}
                {done ? ` · ${t('stepDone')}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
