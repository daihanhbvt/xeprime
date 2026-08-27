'use client';

import {
  AppstoreOutlined,
  BgColorsOutlined,
  CalendarOutlined,
  CarOutlined,
  TagOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import styles from './ListingSpecsCard.module.css';

/** Icon theo KEY thông số — icon là ReactNode nên sống ở client island, không vào server view. */
const SPEC_ICON: Record<string, ReactNode> = {
  vehicleType: <CarOutlined aria-hidden="true" />,
  bodyType: <AppstoreOutlined aria-hidden="true" />,
  seatCount: <TeamOutlined aria-hidden="true" />,
  fuelType: <ThunderboltOutlined aria-hidden="true" />,
  manufactureYear: <CalendarOutlined aria-hidden="true" />,
  color: <BgColorsOutlined aria-hidden="true" />,
  brand: <TagOutlined aria-hidden="true" />,
};

export interface ListingSpecItem {
  key: string;
  label: string;
  value: string;
}

/**
 * Thẻ thông số xe 2 cột kèm icon (mockup 17/08 đợt 4) — trang chi tiết là server component
 * nên phần icon (antd) tách ra client island nhỏ này.
 */
export function ListingSpecsCard({ specs }: { specs: ListingSpecItem[] }) {
  return (
    <dl className={styles.card}>
      {specs.map((s) => (
        <div key={s.key} className={styles.row}>
          <dt>
            <span className={styles.icon}>{SPEC_ICON[s.key] ?? <CarOutlined aria-hidden />}</span>
            {s.label}
          </dt>
          <dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
