'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { RowAction } from '@/components/data-display/RowActions';
import { vehiclePath } from '@/constants/routes';
import { cx } from '@/lib/cx';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../types';
import {
  VehicleCardActions,
  VehicleCardIdentity,
  VehicleCardMedia,
  VehicleCardNotices,
  VehicleStatusBadges,
  useVehicleCardFigures,
} from './VehicleCardParts';
import styles from './VehicleManagementCard.module.css';

export interface VehicleCardProps {
  vehicle: VehicleListItem;
  /** Chỉ số của xe này; `undefined` khi chưa tải xong hoặc khi tải hỏng. */
  stats?: VehicleStats;
  statsLoading: boolean;
  /** Thống kê hỏng → hiện "không tải được" thay vì số 0 giả. */
  statsFailed: boolean;
  /**
   * Việc cần làm + KM hiện tại (Wave 8), do server tính. `undefined` = chưa có dữ liệu; hai cờ
   * dưới đây nói RÕ vì sao, để "đang tải" và "gọi hỏng" không trông giống "xe không có việc".
   */
  alerts?: VehicleAlertGroup;
  alertsLoading?: boolean;
  alertsFailed?: boolean;
  actions: RowAction[];
  /** Đích của tên xe — mặc định Hồ sơ xe. */
  detailHref?: (id: string) => string;
}

/**
 * Thẻ xe dạng LƯỚI — Figma Partner-XePrime "Vehicle Card" `23655:36682` (danh sách từ
 * `VEHICLE_LIST_FEW_THRESHOLD` xe, `23649:29724`).
 *
 * Giải phẫu: ảnh 186 có chip trạng thái phủ góc dưới → tên + nguồn xe → mã • biển → (loại xe ·
 * dịch vụ, giữ theo chốt 03/11) → việc cần làm / lý do trả về khi có → gạch → bảy con số theo cặp
 * → gạch → Lịch · Chỉnh sửa · Chi tiết. KHÔNG có "Xoá" — xoá chỉ ở Hồ sơ xe, nơi đủ ngữ cảnh.
 */
export function VehicleManagementCard({
  vehicle,
  stats,
  statsLoading,
  statsFailed,
  alerts,
  alertsLoading = false,
  alertsFailed = false,
  actions,
  detailHref = vehiclePath.detail,
}: VehicleCardProps) {
  const t = useTranslations('Vehicles.list.card');
  const figures = useVehicleCardFigures({
    vehicle,
    stats,
    statsLoading,
    statsFailed,
    alerts,
    alertsFailed,
  });

  return (
    <article className={styles.card}>
      <VehicleCardMedia vehicle={vehicle} className={styles.media}>
        <VehicleStatusBadges vehicle={vehicle} variant="short" className={styles.overlay} />
      </VehicleCardMedia>

      <div className={styles.body}>
        <VehicleCardIdentity
          vehicle={vehicle}
          detailHref={detailHref(vehicle.id)}
          separator="dot"
        />
        <VehicleCardNotices
          vehicle={vehicle}
          alerts={alerts}
          alertsLoading={alertsLoading}
          alertsFailed={alertsFailed}
        />

        <hr className={styles.divider} />

        <dl className={styles.metrics}>
          <Figure label={t('weekdayPrice')} value={figures.weekdayPrice} />
          <Figure label={t('currentOdometer')} value={figures.odometer} end />
          <Figure label={t('weekendPrice')} value={figures.weekendPrice} />
          {figures.statsState === 'ready' ? (
            <Figure label={t('completedTrips')} value={figures.completedTrips} end />
          ) : null}
          {figures.finance ? (
            <>
              <Figure label={t('totalIncome')} value={figures.finance.income} />
              <Figure label={t('totalExpense')} value={figures.finance.expense} end />
              <Figure
                label={t('profit')}
                value={figures.finance.profit}
                tone={figures.finance.atLoss ? 'loss' : 'gain'}
              />
            </>
          ) : null}
        </dl>
        {figures.statsState === 'loading' ? (
          <Skeleton active paragraph={{ rows: 2, width: ['100%', '70%'] }} title={false} />
        ) : figures.statsState === 'failed' ? (
          // Thống kê hỏng KHÔNG làm hỏng cả thẻ — xe vẫn xem/sửa được.
          <p className={styles.unavailable}>{t('statsUnavailable')}</p>
        ) : null}

        <hr className={styles.divider} />

        <VehicleCardActions
          actions={actions}
          layout="row"
          label={t('rowActions', { name: vehicle.name })}
        />
      </div>
    </article>
  );
}

function Figure({
  label,
  value,
  end = false,
  tone,
}: {
  label: string;
  value: string | null;
  end?: boolean;
  tone?: 'gain' | 'loss';
}) {
  return (
    <div className={cx(styles.figure, end && styles.figureEnd)}>
      <dt>{label}</dt>
      <dd className={tone === 'gain' ? styles.gain : tone === 'loss' ? styles.loss : undefined}>
        {value}
      </dd>
    </div>
  );
}
