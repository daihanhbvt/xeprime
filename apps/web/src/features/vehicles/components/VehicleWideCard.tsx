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
  type VehicleCardFigures,
} from './VehicleCardParts';
import styles from './VehicleWideCard.module.css';

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
 * Thẻ xe NGANG — hai hình thái của cùng một nội dung (Figma Partner-XePrime, chốt 16/11/2026):
 *
 *  - `stacked` — đội xe từ `VEHICLE_LIST_PAIRS_FROM` xe (`23655:38951`, hai thẻ một hàng):
 *    ảnh 247×156 · danh tính + nhãn kiểm duyệt có biểu tượng · cột nút; khối số liệu xám nằm DƯỚI;
 *  - `row` — đội xe dưới số đó (`23655:38389`, một xe một hàng): ảnh 256×162 · danh tính + chip
 *    gọn · khối số liệu xám · cột nút, tất cả trên một hàng.
 *
 * Không có "Xoá" trên thẻ — xoá chỉ ở Hồ sơ xe, nơi đủ ngữ cảnh.
 *
 * Màn hẹp hơn chỗ design vẽ thì các vùng tự xuống hàng theo bề rộng THẬT của thẻ (`@container`),
 * không theo khổ máy — thẻ nằm trong lưới hai cột ở màn 1280 hẹp hơn nhiều so với cả màn.
 */
export function VehicleWideCard({
  layout,
  vehicle,
  stats,
  statsLoading,
  statsFailed,
  alerts,
  alertsLoading = false,
  alertsFailed = false,
  actions,
  detailHref = vehiclePath.detail,
}: VehicleCardProps & { layout: 'stacked' | 'row' }) {
  const t = useTranslations('Vehicles.list.card');
  const figures = useVehicleCardFigures({
    vehicle,
    stats,
    statsLoading,
    statsFailed,
    alerts,
    alertsFailed,
  });
  const stacked = layout === 'stacked';

  const details = (
    <div className={styles.details}>
      <VehicleCardIdentity vehicle={vehicle} detailHref={detailHref(vehicle.id)} />
      <div className={styles.detailsFoot}>
        <VehicleCardNotices
          vehicle={vehicle}
          alerts={alerts}
          alertsLoading={alertsLoading}
          alertsFailed={alertsFailed}
        />
        <VehicleStatusBadges vehicle={vehicle} variant={stacked ? 'detailed' : 'short'} />
      </div>
    </div>
  );
  const actionColumn = (
    <div className={styles.actions}>
      <VehicleCardActions
        actions={actions}
        layout="column"
        label={t('rowActions', { name: vehicle.name })}
      />
    </div>
  );

  return (
    <article className={cx(styles.card, stacked ? styles.stacked : styles.row)}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <VehicleCardMedia vehicle={vehicle} className={styles.media} />
          <div className={styles.content}>
            {details}
            {stacked ? actionColumn : null}
          </div>
        </div>
        <Metrics figures={figures} />
        {stacked ? null : actionColumn}
      </div>
    </article>
  );
}

/**
 * Khối số liệu nền xám: trái là KM + hai mức giá, phải là chuyến + tiền (Figma "Vehicle Metrics"
 * `23655:39234`). Cột phải theo ba trạng thái của thống kê; tiền chỉ có khi server gửi.
 */
function Metrics({ figures }: { figures: VehicleCardFigures }) {
  const t = useTranslations('Vehicles.list.card');
  return (
    <div className={styles.metrics}>
      <dl className={styles.metricColumn}>
        <Row label={t('currentOdometer')} value={figures.odometer} />
        <Row label={t('weekdayPrice')} value={figures.weekdayPrice} />
        <Row label={t('weekendPrice')} value={figures.weekendPrice} />
      </dl>
      {figures.statsState === 'ready' ? (
        <dl className={styles.metricColumn}>
          <Row label={t('completedTrips')} value={figures.completedTrips} />
          {figures.finance ? (
            <>
              <Row label={t('totalIncome')} value={figures.finance.income} />
              <Row label={t('totalExpense')} value={figures.finance.expense} />
              <Row
                label={t('profit')}
                value={figures.finance.profit}
                tone={figures.finance.atLoss ? 'loss' : 'gain'}
              />
            </>
          ) : null}
        </dl>
      ) : figures.statsState === 'loading' ? (
        <div className={styles.metricColumn}>
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        </div>
      ) : (
        // Thống kê hỏng KHÔNG làm hỏng cả thẻ — xe vẫn xem/sửa được.
        <p className={cx(styles.metricColumn, styles.unavailable)}>{t('statsUnavailable')}</p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: 'gain' | 'loss';
}) {
  return (
    <div className={styles.metricRow}>
      <dt>{label}</dt>
      <dd className={tone === 'gain' ? styles.gain : tone === 'loss' ? styles.loss : undefined}>
        {value}
      </dd>
    </div>
  );
}
