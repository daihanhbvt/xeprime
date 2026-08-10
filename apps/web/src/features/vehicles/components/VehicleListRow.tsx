'use client';

import { CarOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { vehiclePath } from '@/constants/routes';
import { absoluteMoney, formatMoneyCompactVnd, isNegativeMoney, subtractMoney } from '@/lib/money';
import { serviceTypeLabel, vehicleTypeLabel } from '../constants';
import type { VehicleListItem, VehicleStats } from '../types';
import styles from './VehicleListRow.module.css';

interface VehicleListRowProps {
  vehicle: VehicleListItem;
  stats?: VehicleStats;
  statsLoading: boolean;
  statsFailed: boolean;
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
  actions,
}: VehicleListRowProps) {
  const meta = [
    vehicle.code,
    vehicle.plateNumber,
    `${vehicleTypeLabel(vehicle.vehicleType)} / ${serviceTypeLabel(vehicle.serviceType)}`,
  ]
    .filter(Boolean)
    .join(' · ');

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
          />
        </div>

        <p className={styles.meta}>{meta}</p>

        <div className={styles.statusRow}>
          <StatusTag
            value={vehicle.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
          />
        </div>

        {/*
         * Một dòng chỉ số. Tiền rút gọn (`12,7tr`) vì 390px không chứa nổi dạng đầy đủ cạnh hai
         * con số đơn hàng — đúng cách Figma `186:2418` viết.
         */}
        {statsLoading ? (
          <Skeleton active paragraph={{ rows: 1, width: '80%' }} title={false} />
        ) : statsFailed || !stats ? (
          <p className={styles.metricsUnavailable}>Không tải được số liệu</p>
        ) : (
          <p className={styles.metrics}>
            <span>
              Đơn: <b>{stats.activeBookings}</b> đang / <b>{stats.completedBookings}</b> xong
            </span>
            {hasFinance ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Thu: <b>{formatMoneyCompactVnd(stats.totalIncome)}</b>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {atLoss ? 'Lỗ' : 'Lãi'}:{' '}
                  <b className={atLoss ? styles.expense : styles.income}>
                    {formatMoneyCompactVnd(absoluteMoney(profit))}
                  </b>
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
            overflowLabel={`Thao tác cho ${vehicle.name}`}
          />
        </div>
      </div>
    </article>
  );
}
