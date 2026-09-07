'use client';

import { CarOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { vehiclePath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { absoluteMoney, isNegativeMoney, subtractMoney } from '@/lib/money';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../types';
import { VehicleAlertChips } from './VehicleAlerts';
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
}

/**
 * Một xe ở dạng **hàng ngang** — hình thái mobile theo Figma `186:2408` (`fleet-list-v2-mobile`).
 *
 * Đây KHÔNG phải thẻ desktop bị bóp lại: Figma vẽ hẳn một bố cục khác — ảnh 80×60 bên trái, nội
 * dung bên phải, và cả khối chỉ số gộp lại thành **một dòng rút gọn** (`186:2417`). Ở bề rộng
 * 390px, sáu con số xếp lưới như desktop sẽ xuống dòng thành sáu hàng.
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
}: VehicleListRowProps) {
  const t = useTranslations('Vehicles.list');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const meta = [
    vehicle.code,
    vehicle.plateNumber,
    `${domainLabel('vehicleType', vehicle.vehicleType)} / ${fmt.serviceTypes(vehicle.serviceTypes)}`,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  const hasFinance = stats?.totalIncome != null && stats?.totalExpense != null;
  const profit = hasFinance ? subtractMoney(stats.totalIncome, stats.totalExpense) : null;
  const atLoss = profit != null && isNegativeMoney(profit);

  return (
    <article className={styles.row}>
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

      <div className={styles.content}>
        <div className={styles.titleRow}>
          <Link href={vehiclePath.detail(vehicle.id)} className={styles.name}>
            {vehicle.name}
          </Link>
          <StatusTag
            value={vehicle.operationStatus as VehicleOperationStatus}
            meta={VEHICLE_OPERATION_STATUS_META}
            group="vehicleOperationStatus"
          />
        </div>

        <p className={styles.meta}>{meta}</p>

        <div className={styles.statusRow}>
          <StatusTag
            value={vehicle.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
            group="vehiclePublicStatus"
          />
        </div>

        {/* Cùng dữ liệu VÀ cùng ba trạng thái với thẻ desktop — chỉ khác cách xếp. */}
        {alertsLoading ? (
          <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={false} />
        ) : alertsFailed ? (
          <p className={styles.metricsUnavailable}>{t('card.alertsUnavailable')}</p>
        ) : alerts ? (
          <>
            <VehicleAlertChips alerts={alerts.alerts} />
            <p className={styles.odometer}>
              {t('row.odometer', { value: fmt.km(alerts.currentOdometerKm) })}
            </p>
          </>
        ) : null}

        {/*
         * Một dòng chỉ số. Tiền rút gọn (`12,7tr`) vì 390px không chứa nổi dạng đầy đủ cạnh hai
         * con số đơn hàng — đúng cách Figma `186:2418` viết.
         */}
        {statsLoading ? (
          <Skeleton active paragraph={{ rows: 1, width: '80%' }} title={false} />
        ) : statsFailed || !stats ? (
          <p className={styles.metricsUnavailable}>{t('card.statsUnavailable')}</p>
        ) : (
          <p className={styles.metrics}>
            <span>
              {t.rich('row.bookings', {
                active: stats.activeBookings,
                done: stats.completedBookings,
                n: (chunks) => <b>{chunks}</b>,
              })}
            </span>
            {hasFinance ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t.rich('row.income', {
                    value: fmt.moneyCompact(stats.totalIncome),
                    n: (chunks) => <b>{chunks}</b>,
                  })}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {t.rich(atLoss ? 'row.loss' : 'row.profit', {
                    value: fmt.moneyCompact(absoluteMoney(profit)),
                    n: (chunks) => (
                      <b className={atLoss ? styles.expense : styles.income}>{chunks}</b>
                    ),
                  })}
                </span>
              </>
            ) : null}
          </p>
        )}

        <div className={styles.actions}>
          <RowActions
            actions={actions}
            maxInline={actions.length}
            align="start"
            variant="filled"
            overflowLabel={t('card.rowActions', { name: vehicle.name })}
          />
        </div>
      </div>
    </article>
  );
}
