'use client';

import {
  AppstoreOutlined,
  BgColorsOutlined,
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
  TagOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import styles from './ListingSpecsCard.module.css';

/** Icon theo KEY thông số — icon là ReactNode nên sống ở client island. */
const SPEC_ICON: Record<string, ReactNode> = {
  vehicleType: <CarOutlined aria-hidden="true" />,
  bodyType: <AppstoreOutlined aria-hidden="true" />,
  seatCount: <TeamOutlined aria-hidden="true" />,
  fuelType: <ThunderboltOutlined aria-hidden="true" />,
  manufactureYear: <CalendarOutlined aria-hidden="true" />,
  fuelConsumption: <DashboardOutlined aria-hidden="true" />,
  color: <BgColorsOutlined aria-hidden="true" />,
  brand: <TagOutlined aria-hidden="true" />,
};

export interface ListingSpecItem {
  key: string;
  label: string;
  value: string;
}

/**
 * Hàng thông số xe theo Figma v2 (node 19707:83378):
 * - Vòng icon 48px nền vàng nhạt, icon 24 vàng
 * - Nhãn phía trên (14/22, xám nhạt) và giá trị phía dưới (16/24 Medium)
 */
export function ListingSpecsCard({ specs }: { specs: ListingSpecItem[] }) {
  // Lấy tối đa 4 thông số tiêu biểu nhất nếu có, hoặc hiển thị toàn bộ
  return (
    <div className={styles.card}>
      {specs.map((s) => (
        <div key={s.key} className={styles.item}>
          <div className={styles.iconWrapper}>
            {SPEC_ICON[s.key] ?? <CarOutlined aria-hidden="true" />}
          </div>
          <div className={styles.meta}>
            <span className={styles.label}>{s.label}</span>
            <span className={styles.value} title={s.value}>{s.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
