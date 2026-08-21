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
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { dayjs } from '@/lib/datetime';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import { useVehicleStats } from '../hooks/use-vehicle-stats';
import { useDashboardBookings } from '../hooks/use-dashboard-bookings';
import { BookingMiniList } from './BookingMiniList';
import { DashboardPanel } from './DashboardPanel';
import { ShopOnboardingCard } from './ShopOnboardingCard';
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
  const t = useTranslations('Dashboard');
  const fmt = useAppFormat();
  const router = useRouter();
  const { data: stats, isLoading } = useVehicleStats();
  const { recent, dueToday, upcoming, activeCount, overdueCount } = useDashboardBookings();

  const goBookings = () => router.push(ROUTES.MANAGE.BOOKINGS);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.date}>{todayLabel(fmt)}</p>
      </header>

      {/*
        Gian hàng chưa duyệt xong / chưa có xe: ba bước cần làm đứng TRƯỚC bảng số liệu, vì lúc
        đó mọi ô số đều là 0 và không ô nào nói được việc gì tiếp theo. Thẻ tự ẩn khi hết việc.
      */}
      <ShopOnboardingCard vehicleCount={stats?.total} />

      <div className={styles.stats}>
        <StatCard
          label={t('stats.available')}
          value={stats ? `${stats.available}/${stats.total}` : '—'}
          icon={CarOutlined}
          tone="green"
          loading={isLoading}
        />
        <StatCard
          label={t('stats.renting')}
          value={activeCount === undefined ? '—' : t('stats.rentingValue', { count: activeCount })}
          icon={KeyOutlined}
          tone="blue"
        />
        <StatCard label={t('stats.revenue')} value="—" icon={DollarOutlined} tone="gold" />
        <StatCard
          label={t('stats.overdue')}
          value={overdueCount === undefined ? '—' : t('stats.overdueValue', { count: overdueCount })}
          icon={ExclamationCircleOutlined}
          tone="red"
          danger={Boolean(overdueCount)}
        />
        <StatCard label={t('stats.deposit')} value="—" icon={LockOutlined} tone="gold" />
      </div>

      <div className={styles.panels}>
        <DashboardPanel title={t('panels.recent')} icon={<FileTextOutlined />}>
          <BookingMiniList
            items={recent.data?.items ?? []}
            loading={recent.isLoading}
            empty={t('panels.recentEmpty')}
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel title={t('panels.dueToday')} icon={<WarningOutlined />}>
          <BookingMiniList
            items={dueToday.data?.items ?? []}
            loading={dueToday.isLoading}
            empty={t('panels.dueTodayEmpty')}
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel title={t('panels.upcoming')} icon={<ClockCircleOutlined />}>
          <BookingMiniList
            items={upcoming.data?.items ?? []}
            loading={upcoming.isLoading}
            empty={t('panels.upcomingEmpty')}
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel
          title={t('panels.receipts')}
          icon={<SwapOutlined />}
          empty={t('panels.receiptsEmpty')}
        />
      </div>
    </div>
  );
}
