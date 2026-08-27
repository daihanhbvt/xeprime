'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useFleetSummary } from '../hooks/use-fleet-summary';
import styles from './FleetSummaryBar.module.css';

/**
 * Dải chỉ số đầu danh sách xe ở mobile — Figma `236:4648` (`mobile-vehicle-list-v2`).
 *
 * Con số nói về CẢ đội xe (backend đếm bằng `groupBy`), không phụ thuộc trang/bộ lọc hiện tại.
 * Khác frame có chủ đích: ô thứ ba là **"Đang thuê"** thay vì "Cảnh báo" — chưa có dữ liệu
 * đăng kiểm/bảo dưỡng nào để đếm cảnh báo (Wave 6/7), không bịa số.
 *
 * Hỏng thì tự ẩn: dải chỉ số là phụ trợ, không được chặn danh sách phía dưới.
 */
export function FleetSummaryBar({ enabled }: { enabled: boolean }) {
  const t = useTranslations('Vehicles.list.summary');
  const { data, isLoading, isError } = useFleetSummary(enabled);

  if (!enabled || isError) return null;

  if (isLoading) {
    return (
      <div className={styles.bar} role="status" aria-label={t('loading')}>
        <Skeleton active title={false} paragraph={{ rows: 1, width: '100%' }} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <dl className={styles.bar} aria-label={t('ariaLabel')}>
      <div className={styles.item}>
        <dt>{t('total')}</dt>
        <dd>{t('vehicleCount', { count: data.total })}</dd>
      </div>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.item}>
        <dt>{t('available')}</dt>
        <dd className={styles.available}>{t('vehicleCount', { count: data.available })}</dd>
      </div>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.item}>
        <dt>{t('renting')}</dt>
        <dd className={styles.renting}>{t('vehicleCount', { count: data.renting })}</dd>
      </div>
    </dl>
  );
}
