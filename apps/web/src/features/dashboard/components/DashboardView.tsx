'use client';

import {
  CarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  KeyOutlined,
  LockOutlined,
  SwapOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useVehicleStats } from '../hooks/use-vehicle-stats';
import { DashboardPanel } from './DashboardPanel';
import { StatCard } from './StatCard';
import styles from './DashboardView.module.css';

/** Ngày hôm nay kiểu "Thứ Sáu, 24 tháng 7, 2026" (dayjs đã set locale vi ở providers). */
function todayLabel(): string {
  const text = dayjs().format('dddd, D [tháng] M, YYYY');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function DashboardView() {
  const { data: stats, isLoading } = useVehicleStats();

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.date}>{todayLabel()}</p>
      </header>

      <div className={styles.stats}>
        <StatCard
          label="Xe sẵn sàng"
          value={stats ? `${stats.available}/${stats.total}` : '—'}
          icon={CarOutlined}
          tone="green"
          loading={isLoading}
        />
        <StatCard
          label="Đang cho thuê"
          value={stats ? `${stats.renting} xe` : '—'}
          icon={KeyOutlined}
          tone="blue"
          loading={isLoading}
        />
        <StatCard label="Doanh thu" value="—" icon={DollarOutlined} tone="gold" />
        <StatCard
          label="Quá hạn trả"
          value="—"
          icon={ExclamationCircleOutlined}
          tone="red"
          danger
        />
        <StatCard label="Tiền cọc đang giữ" value="—" icon={LockOutlined} tone="gold" />
      </div>

      <div className={styles.panels}>
        <DashboardPanel
          title="Đơn gần đây"
          icon={<FileTextOutlined />}
          empty="Chưa có đơn nào"
        />
        <DashboardPanel
          title="Quá hạn / Trả hôm nay"
          icon={<WarningOutlined />}
          empty="Không có xe quá hạn 🎉"
        />
        <DashboardPanel
          title="Trả xe trong 3 ngày tới"
          icon={<ClockCircleOutlined />}
          empty="Không có xe nào sắp trả 🎉"
        />
        <DashboardPanel
          title="Thu Chi hôm nay"
          icon={<SwapOutlined />}
          empty="Chưa có giao dịch hôm nay"
        />
      </div>
    </div>
  );
}
