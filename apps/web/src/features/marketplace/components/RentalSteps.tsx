'use client';

import {
  CarOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  StarOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import { RENTAL_STEPS } from '../constants';
import styles from './RentalSteps.module.css';

/** Map key icon (constants) → component icon, giữ constants độc lập React. */
const STEP_ICON: Readonly<Record<string, ComponentType>> = {
  search: SearchOutlined,
  check: CheckCircleOutlined,
  car: CarOutlined,
  star: StarOutlined,
};

/**
 * "Thuê xe chỉ với 4 bước" — nội dung tĩnh (không có state), nhưng vẫn cần `'use client'` vì dùng
 * `@ant-design/icons` (gọi `React.createContext` nội bộ, không chạy được trong cây Server
 * Component). Vẫn render sẵn ra HTML ở server như mọi Client Component — không mất SEO.
 */
export function RentalSteps() {
  return (
    <section className={styles.section} aria-labelledby="steps-title">
      <header className={styles.head}>
        <h2 id="steps-title" className={styles.title}>
          Thuê xe chỉ với 4 bước
        </h2>
      </header>

      <ol className={styles.grid}>
        {RENTAL_STEPS.map((step) => {
          const Icon = STEP_ICON[step.icon];
          return (
            <li key={step.no} className={styles.card}>
              <div className={styles.top}>
                <span className={styles.no}>{step.no}</span>
                <span className={styles.icon} aria-hidden="true">
                  {Icon ? <Icon /> : null}
                </span>
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.desc}>{step.desc}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
