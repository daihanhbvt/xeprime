'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import styles from './CustomerTripTimeline.module.css';

interface CustomerTripTimelineProps {
  confirmedDone: boolean;
  completedDone: boolean;
}

const MILESTONES = [
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'completed', label: 'Hoàn thành' },
] as const;

/**
 * Dòng thời gian chuyến của khách — **luôn đúng hai mốc**, một hàng ngang, mọi bề rộng.
 *
 * Component này KHÔNG biết gì về trạng thái backend: nó nhận hai boolean đã được
 * `customerTripTimeline()` (@xeprime/types) tính sẵn. Đó là ranh giới cố ý — nhét `switch` trên
 * `booking.status` vào đây là cách nhanh nhất để mỗi màn tự chế một cách hiểu riêng, và để
 * `Đã giao xe` lặng lẽ mọc thành mốc thứ ba.
 *
 * Ở 390px vẫn một hàng: nhãn co lại bằng `font-size`, đoạn nối `flex: 1` nuốt phần dư — không
 * bao giờ `flex-wrap`.
 */
export function CustomerTripTimeline({ confirmedDone, completedDone }: CustomerTripTimelineProps) {
  const done = [confirmedDone, completedDone];

  return (
    <ol
      className={styles.timeline}
      aria-label={`Tiến trình chuyến: ${completedDone ? 'đã hoàn thành' : 'đã xác nhận, chưa hoàn thành'}`}
    >
      {MILESTONES.map((milestone, index) => (
        <li key={milestone.key} className={styles.item}>
          {index > 0 ? (
            <span
              className={done[index] ? styles.connectorDone : styles.connector}
              aria-hidden="true"
            />
          ) : null}
          <span className={done[index] ? styles.stepDone : styles.step}>
            {done[index] ? (
              <CheckCircleFilled aria-hidden="true" />
            ) : (
              // Mốc chưa tới hiện SỐ THỨ TỰ, không phải một vòng tròn rỗng: người đọc biết còn
              // mấy bước nữa mà không phải đếm.
              <span className={styles.index} aria-hidden="true">
                {index + 1}
              </span>
            )}
            <span className={styles.label}>{milestone.label}</span>
            <span className={styles.srOnly}>
              {done[index] ? ' — đã xong' : ' — chưa hoàn thành'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
