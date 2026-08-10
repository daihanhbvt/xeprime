'use client';

import { RENTAL_STEPS } from '../constants';
import styles from './RentalSteps.module.css';

/**
 * "Thuê xe chỉ với 4 bước" — Figma `18:4`: MỘT thẻ trắng chia bốn cột bằng vạch dọc, mỗi cột
 * là chấm số vàng + tên bước trên một hàng, mô tả ngắn bên dưới. Bản trước là bốn thẻ rời có
 * icon — Figma không có icon nên bỏ, không tự chế thêm hoạ tiết.
 *
 * Nội dung tĩnh nhưng vẫn render sẵn ra HTML ở server (Client Component chỉ vì cây cha).
 */
export function RentalSteps() {
  return (
    <section className={styles.section} aria-labelledby="steps-title">
      <h2 id="steps-title" className={styles.title}>
        Thuê xe chỉ với 4 bước
      </h2>

      <ol className={styles.card}>
        {RENTAL_STEPS.map((step) => (
          <li key={step.no} className={styles.step}>
            <div className={styles.stepHead}>
              <span className={styles.no}>{step.no}</span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
            </div>
            <p className={styles.desc}>{step.desc}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
