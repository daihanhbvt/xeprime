'use client';

import { Skeleton } from 'antd';
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
  const { data, isLoading, isError } = useFleetSummary(enabled);

  if (!enabled || isError) return null;

  if (isLoading) {
    return (
      <div className={styles.bar} role="status" aria-label="Đang tải chỉ số đội xe">
        <Skeleton active title={false} paragraph={{ rows: 1, width: '100%' }} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <dl className={styles.bar} aria-label="Chỉ số đội xe">
      <div className={styles.item}>
        <dt>Tổng số xe</dt>
        <dd>{data.total} xe</dd>
      </div>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.item}>
        <dt>Sẵn sàng</dt>
        <dd className={styles.available}>{data.available} xe</dd>
      </div>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.item}>
        <dt>Đang thuê</dt>
        <dd className={styles.renting}>{data.renting} xe</dd>
      </div>
    </dl>
  );
}
