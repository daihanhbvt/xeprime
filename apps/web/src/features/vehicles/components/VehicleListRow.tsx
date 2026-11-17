'use client';

import { CarOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  SERVICE_TYPE,
  VEHICLE_SOURCE_TYPE,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import type { RowAction } from '@/components/data-display/RowActions';
import { vehiclePath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isNegativeMoney, subtractMoney } from '@/lib/money';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../types';
import { VehicleAlertChips } from './VehicleAlerts';
import { NEEDS_OWNER_ACTION, VehicleCardActions, VehicleStatusBadges } from './VehicleCardParts';
import styles from './VehicleListRow.module.css';

interface VehicleListRowProps {
  vehicle: VehicleListItem;
  stats?: VehicleStats;
  statsLoading: boolean;
  statsFailed: boolean;
  /** Việc cần làm + KM hiện tại (Wave 8) — cùng nguồn VÀ cùng ba trạng thái với thẻ desktop. */
  alerts?: VehicleAlertGroup;
  alertsLoading?: boolean;
  alertsFailed?: boolean;
  actions: RowAction[];
  /** Đích của tên xe — mặc định Hồ sơ 360 ở `/manage`; xem `VehicleCardGrid`. */
  detailHref?: (id: string) => string;
}

interface Metric {
  key: string;
  label: string;
  value: string;
  tone?: 'gain' | 'loss';
}

/**
 * Một xe ở khổ điện thoại — Figma Partner-XePrime "Vehicle Summary" (Danh sách xe MB
 * `24158:103762`), cùng khuôn với thẻ của app Partner (`VehicleCard` native).
 *
 * Đầu thẻ: ảnh 63×40 · tên + nguồn xe (+ "-N%") · nút mở/thu; mã · biển số, loại xe · dịch vụ. Rồi
 * kiểm duyệt + viên vận hành, việc cần làm, lý do bị trả về (giữ của web - người dùng chốt
 * 16/11/2026). Khối số liệu THU GỌN = Tổng doanh thu · Lợi nhuận thực tế (không có `finance.view`
 * ⇒ hai mức giá); MỞ = đủ bảy số như thẻ desktop. Chân thẻ: Lịch · Chỉnh sửa · Chi tiết.
 */
export function VehicleListRow({
  vehicle,
  stats,
  statsLoading,
  statsFailed,
  alerts,
  alertsLoading = false,
  alertsFailed = false,
  actions,
  detailHref = vehiclePath.detail,
}: VehicleListRowProps) {
  const t = useTranslations('Vehicles.list');
  const tCard = useTranslations('Vehicles.list.card');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [expanded, setExpanded] = useState(false);

  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const identity = [vehicle.code, vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR);
  const kinds = [
    domainLabel('vehicleType', vehicle.vehicleType),
    ...vehicle.serviceTypes.map((service) => domainLabel('serviceType', service)),
  ];
  // Khuyến mãi chỉ áp cho tự lái (ADR 0011).
  const discountPercent = vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE)
    ? (vehicle.discountPercent ?? 0)
    : 0;

  const statsReady = stats != null && !statsLoading && !statsFailed;
  const hasFinance = statsReady && stats.totalIncome != null && stats.totalExpense != null;
  const profit = hasFinance ? subtractMoney(stats.totalIncome, stats.totalExpense) : null;
  const atLoss = profit != null && isNegativeMoney(profit);

  const weekday: Metric = {
    key: 'weekday',
    label: tCard('weekdayPrice'),
    value: vehicle.weekdayPrice ? fmt.money(vehicle.weekdayPrice) : '-',
  };
  const weekend: Metric = {
    key: 'weekend',
    label: tCard('weekendPrice'),
    value: vehicle.weekendPrice ? fmt.money(vehicle.weekendPrice) : '-',
  };
  const odometer: Metric = {
    key: 'odometer',
    label: tCard('currentOdometer'),
    value: alertsFailed ? tCard('odometerUnknown') : alerts ? fmt.km(alerts.currentOdometerKm) : '-',
  };
  const finance: Metric[] =
    hasFinance && profit != null
      ? [
          { key: 'income', label: tCard('totalIncome'), value: fmt.money(stats.totalIncome as string) },
          { key: 'expense', label: tCard('totalExpense'), value: fmt.money(stats.totalExpense as string) },
          {
            key: 'profit',
            label: tCard('profit'),
            value: fmt.money(profit),
            tone: atLoss ? 'loss' : 'gain',
          },
        ]
      : [];
  const metrics: Metric[] = expanded
    ? [
        ...(alertsLoading ? [] : [odometer]),
        weekday,
        weekend,
        ...(statsReady
          ? [{ key: 'trips', label: tCard('completedTrips'), value: fmt.count(stats.completedBookings) }]
          : []),
        ...finance,
      ]
    : finance.length > 0
      ? finance.filter((metric) => metric.key !== 'expense')
      : [weekday, weekend];

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.thumb}>
          {vehicle.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.image} src={vehicle.mainImageUrl} alt="" loading="lazy" />
          ) : (
            <span className={styles.thumbFallback} aria-hidden="true">
              <CarOutlined />
            </span>
          )}
        </div>

        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <div className={styles.titleMain}>
              <Link href={detailHref(vehicle.id)} className={styles.name}>
                {vehicle.name}
              </Link>
              <span className={styles.source}>{domainLabel('vehicleSourceType', sourceType)}</span>
              {discountPercent > 0 ? <DiscountTag percent={discountPercent} size="sm" /> : null}
            </div>
            <button
              type="button"
              className={cx(styles.toggle, expanded && styles.toggleOpen)}
              aria-expanded={expanded}
              aria-label={expanded ? tActions('collapse') : tActions('expand')}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? <UpOutlined aria-hidden="true" /> : <DownOutlined aria-hidden="true" />}
            </button>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.identity}>{identity}</span>
            <span className={styles.kinds}>
              {kinds.map((kind, index) => (
                <span key={`${kind}-${index}`} className={styles.kind}>
                  {kind}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* Cùng nhãn kiểm duyệt có biểu tượng + viên vận hành của thẻ ít xe desktop. */}
      <VehicleStatusBadges vehicle={vehicle} variant="detailed" compact />

      {alertsLoading ? (
        <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={false} />
      ) : alertsFailed ? (
        <p className={styles.unavailable}>{t('card.alertsUnavailable')}</p>
      ) : alerts && alerts.alerts.length > 0 ? (
        <VehicleAlertChips alerts={alerts.alerts} />
      ) : null}

      {NEEDS_OWNER_ACTION.includes(vehicle.publicStatus as VehiclePublicStatus) &&
      vehicle.latestPublicReview?.reason ? (
        <p className={styles.reviewReason}>{vehicle.latestPublicReview.reason}</p>
      ) : null}

      <dl className={styles.metrics}>
        {metrics.map((metric) => (
          <div key={metric.key} className={styles.metric}>
            <dt>{metric.label}</dt>
            <dd
              className={
                metric.tone === 'gain' ? styles.gain : metric.tone === 'loss' ? styles.loss : undefined
              }
            >
              {metric.value}
            </dd>
          </div>
        ))}
        {statsLoading ? (
          <Skeleton active paragraph={{ rows: 1, width: '100%' }} title={false} />
        ) : statsFailed ? (
          <p className={styles.unavailable}>{t('card.statsUnavailable')}</p>
        ) : null}
      </dl>

      <div className={styles.actions}>
        <VehicleCardActions
          actions={actions}
          layout="row"
          label={t('card.rowActions', { name: vehicle.name })}
        />
      </div>
    </article>
  );
}
