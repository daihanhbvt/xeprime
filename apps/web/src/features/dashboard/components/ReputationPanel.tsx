'use client';

import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { HOST_METRIC_WINDOW_DAYS, type HostMetrics as HostMetricsShape } from '@xeprime/types';
import { HostMetrics } from '@/features/marketplace/components/HostMetrics';
import { DashboardPanel } from './DashboardPanel';
import styles from './SidePanels.module.css';

/**
 * Uy tín của gian hàng/chủ xe — CHÍNH khối ba chỉ số khách thấy trên chợ (`HostMetrics`), cùng
 * nguồn tính (`HostMetricsService`, ADR 0045). Chủ xe nhìn đúng thứ khách nhìn, không phải một bản
 * "nội bộ" đẹp hơn; dưới ngưỡng mẫu thì nói "chưa đủ dữ liệu", không hiện 0%.
 */
export function ReputationPanel({ metrics }: { metrics: HostMetricsShape | undefined }) {
  const t = useTranslations('Dashboard.reputation');
  return (
    <DashboardPanel
      title={t('title')}
      icon={<SafetyCertificateOutlined />}
      extra={<span className={styles.extraNote}>{t('window', { days: HOST_METRIC_WINDOW_DAYS })}</span>}
    >
      {metrics ? (
        <div className={styles.stack}>
          <HostMetrics metrics={metrics} />
          <p className={styles.note}>{t('note')}</p>
        </div>
      ) : (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      )}
    </DashboardPanel>
  );
}
