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
import { absoluteMoney, formatMoneyVnd, isNegativeMoney, subtractMoney } from '@/lib/money';
import { serviceTypeLabel, vehicleTypeLabel } from '../constants';
import type { VehicleListItem, VehicleStats } from '../types';
import styles from './VehicleManagementCard.module.css';

interface VehicleManagementCardProps {
  vehicle: VehicleListItem;
  /** Chỉ số của xe này; `undefined` khi chưa tải xong hoặc khi tải hỏng. */
  stats?: VehicleStats;
  statsLoading: boolean;
  /** Thống kê hỏng → hiện "không tải được" thay vì số 0 giả. */
  statsFailed: boolean;
  actions: RowAction[];
}

/**
 * Thẻ xe trong lưới `/manage/vehicles` — dựng theo Figma `186:1673` (`fleet-list-v2-desktop`).
 *
 * Giải phẫu khớp frame: **ảnh tràn viền phía trên (209.6×122) → tên + mã·biển số → loại/dịch vụ
 * kèm trạng thái vận hành → gạch ngang → khối chỉ số → gạch ngang → 4 nút Xem/Sửa/Lịch/Xoá.**
 * Thẻ Figma cố tình KHÔNG có giá thuê; giá vẫn nằm ở trang chi tiết.
 *
 * Không dựng lại primitive: trạng thái dùng `StatusTag`, hành động dùng `RowActions` (đã có xác
 * nhận xoá, chặn nổi bọt, tên khả truy cập).
 */
export function VehicleManagementCard({
  vehicle,
  stats,
  statsLoading,
  statsFailed,
  actions,
}: VehicleManagementCardProps) {
  const specs = `${vehicleTypeLabel(vehicle.vehicleType)} / ${serviceTypeLabel(vehicle.serviceType)}`;
  const identity = [vehicle.code, vehicle.plateNumber].filter(Boolean).join(' · ');

  // Lãi/lỗ chỉ tính khi CẢ HAI vế cùng phạm vi luỹ kế — không trộn số theo kỳ với số luỹ kế.
  const hasFinance = stats?.totalIncome != null && stats?.totalExpense != null;
  const profit = hasFinance ? subtractMoney(stats.totalIncome, stats.totalExpense) : null;
  const atLoss = profit != null && isNegativeMoney(profit);

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        {vehicle.mainImageUrl ? (
          // Ảnh minh hoạ cho tên nằm ngay dưới → `alt` rỗng, cùng quy ước với `EntityIdentity`.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.image} src={vehicle.mainImageUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.mediaFallback} aria-hidden="true">
            <CarOutlined />
          </span>
        )}
        {/*
         * Trục trạng thái công khai. Figma `186:1683` chỉ vẽ trạng thái VẬN HÀNH, nhưng đây là
         * hai trục độc lập (ADR 0008) và chủ xe cần biết xe đã lên sàn chưa. Đặt ở góc ảnh để
         * giữ nguyên hàng specs của Figma thay vì nhồi hai thẻ vào một dòng 185px.
         */}
        <span className={styles.publicBadge}>
          <StatusTag
            value={vehicle.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
          />
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.identity}>
          <Link href={vehiclePath.detail(vehicle.id)} className={styles.name} title={vehicle.name}>
            {vehicle.name}
          </Link>
          <p className={styles.meta}>{identity}</p>
        </div>

        <div className={styles.specsStatus}>
          <span className={styles.specs}>{specs}</span>
          <StatusTag
            value={vehicle.operationStatus as VehicleOperationStatus}
            meta={VEHICLE_OPERATION_STATUS_META}
          />
        </div>

        <div className={styles.metrics}>
          {statsLoading ? (
            <Skeleton active paragraph={{ rows: 2, width: ['100%', '70%'] }} title={false} />
          ) : statsFailed || !stats ? (
            // Thống kê hỏng KHÔNG làm hỏng cả thẻ — xe vẫn xem/sửa/xoá được.
            <p className={styles.metricsUnavailable}>Không tải được số liệu</p>
          ) : (
            <>
              <dl className={styles.metricRow}>
                <div>
                  <dt>Đang chạy</dt>
                  <dd>{stats.activeBookings}</dd>
                </div>
                <div className={styles.alignEnd}>
                  <dt>Hoàn thành</dt>
                  <dd>{stats.completedBookings}</dd>
                </div>
              </dl>

              {hasFinance ? (
                <>
                  <dl className={styles.metricRow}>
                    <div>
                      <dt>Tổng thu</dt>
                      <dd className={styles.income}>{formatMoneyVnd(stats.totalIncome)}</dd>
                    </div>
                    <div className={styles.alignEnd}>
                      <dt>Tổng chi</dt>
                      <dd className={styles.expense}>{formatMoneyVnd(stats.totalExpense)}</dd>
                    </div>
                  </dl>

                  <dl className={styles.profitRow}>
                    <dt>{atLoss ? 'Lỗ luỹ kế' : 'Lãi luỹ kế'}</dt>
                    <dd className={atLoss ? styles.expense : styles.income}>
                      {formatMoneyVnd(absoluteMoney(profit))}
                    </dd>
                  </dl>
                </>
              ) : null}
            </>
          )}
        </div>

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
