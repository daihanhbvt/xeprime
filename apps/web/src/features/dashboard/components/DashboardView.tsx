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
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { dayjs } from '@/lib/datetime';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import { useVehicleStats } from '../hooks/use-vehicle-stats';
import { useDashboardBookings } from '../hooks/use-dashboard-bookings';
import { BookingMiniList } from './BookingMiniList';
import { DashboardPanel } from './DashboardPanel';
import { StatCard } from './StatCard';
import styles from './DashboardView.module.css';

/**
 * Ngày hôm nay kèm THỨ.
 *
 * Trước đây là `dayjs().format('dddd, …')` và chỉ ra tiếng Việt nhờ một lời gọi
 * `dayjs.locale('vi')` toàn tiến trình ở providers. Lời gọi đó đã bị gỡ (ADR 0012: nó rò
 * ngôn ngữ giữa các request render song song), nên chỗ này đi qua formatter của request.
 */
function todayLabel(fmt: AppFormat): string {
  const text = fmt.fullDate(dayjs());
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

export function DashboardView() {
  const fmt = useAppFormat();
  const router = useRouter();
  const { data: stats, isLoading } = useVehicleStats();
  const { recent, dueToday, upcoming, activeCount, overdueCount } = useDashboardBookings();

  const goBookings = () => router.push(ROUTES.MANAGE.BOOKINGS);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.date}>{todayLabel(fmt)}</p>
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
          value={activeCount === undefined ? '—' : `${activeCount} xe`}
          icon={KeyOutlined}
          tone="blue"
        />
        <StatCard label="Doanh thu" value="—" icon={DollarOutlined} tone="gold" />
        <StatCard
          label="Quá hạn trả"
          value={overdueCount === undefined ? '—' : `${overdueCount} đơn`}
          icon={ExclamationCircleOutlined}
          tone="red"
          danger={Boolean(overdueCount)}
        />
        <StatCard label="Tiền cọc đang giữ" value="—" icon={LockOutlined} tone="gold" />
      </div>

      <div className={styles.panels}>
        <DashboardPanel title="Đơn gần đây" icon={<FileTextOutlined />}>
          <BookingMiniList
            items={recent.data?.items ?? []}
            loading={recent.isLoading}
            empty="Chưa có đơn nào"
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel title="Quá hạn / Trả hôm nay" icon={<WarningOutlined />}>
          <BookingMiniList
            items={dueToday.data?.items ?? []}
            loading={dueToday.isLoading}
            empty="Không có xe quá hạn 🎉"
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel title="Trả xe trong 3 ngày tới" icon={<ClockCircleOutlined />}>
          <BookingMiniList
            items={upcoming.data?.items ?? []}
            loading={upcoming.isLoading}
            empty="Không có xe nào sắp trả 🎉"
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel
          title="Thu Chi hôm nay"
          icon={<SwapOutlined />}
          empty="Chưa có giao dịch hôm nay"
        />
      </div>
    </div>
  );
}
