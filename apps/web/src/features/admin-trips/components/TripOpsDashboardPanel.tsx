'use client';

import { FieldTimeOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PLATFORM_TRIP_QUEUE_VALUES } from '@xeprime/types';
import { ROUTES, adminTripPath } from '@/constants/routes';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { useTripSummary } from '../hooks/use-admin-trips';
import { useTripQueueLabel } from './TripQueueRail';
import styles from './TripOpsDashboardPanel.module.css';

/**
 * Khối "Vận hành chuyến" trên dashboard nền tảng — hàng ĐẦU là việc cần làm hôm nay (UX §1.5),
 * không phải KPI: bốn hàng đợi với số dòng và số quá hạn, mỗi dòng bấm là vào đúng hàng đợi đó.
 * Chỉ dựng khi người xem có quyền đơn thuê — nơi gọi quyết.
 */
export function TripOpsDashboardPanel() {
  const t = useTranslations('AdminTrips');
  const fmt = useAppFormat();
  const router = useRouter();
  const label = useTripQueueLabel();
  const { data, isLoading, isError } = useTripSummary();

  return (
    <DashboardPanel
      title={t('dashboard.title')}
      icon={<FieldTimeOutlined />}
      extra={
        data ? (
          <span className={styles.today}>
            {t('dashboard.today', { pickups: data.today.pickups, returns: data.today.returns })}
          </span>
        ) : null
      }
    >
      {isLoading && !data ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : isError && !data ? (
        <p className={styles.error}>{t('dashboard.loadError')}</p>
      ) : data ? (
        <>
          <ul className={styles.list}>
            {PLATFORM_TRIP_QUEUE_VALUES.map((queue) => {
              const { count, urgentCount } = data.queues[queue];
              return (
                <li key={queue} className={styles.row}>
                  <button
                    type="button"
                    className={styles.rowButton}
                    onClick={() => router.push(adminTripPath.queue(queue))}
                  >
                    <span className={styles.rowLabel}>{label(queue)}</span>
                    <span className={styles.rowMeta}>
                      {urgentCount > 0 ? (
                        <span className={styles.urgent}>
                          {t(`cards.urgent.${queue}`, { count: urgentCount })}
                        </span>
                      ) : null}
                      <span className={cx(styles.count, count === 0 && styles.countZero)}>
                        {fmt.count(count)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={styles.foot}>
            <Button size="small" onClick={() => router.push(ROUTES.ADMIN.TRIPS)}>
              {t('dashboard.open')}
            </Button>
          </div>
        </>
      ) : null}
    </DashboardPanel>
  );
}
