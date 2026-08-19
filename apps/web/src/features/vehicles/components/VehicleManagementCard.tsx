'use client';

import { CarOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import {
  VEHICLE_OPERATION_STATUS_META, VEHICLE_PUBLIC_STATUS_META, VEHICLE_SOURCE_TYPE, VEHICLE_SOURCE_TYPE_LABEL, type VehicleOperationStatus, type VehiclePublicStatus, type VehicleSourceType, } from '@xeprime/types';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusTag } from '@/components/data-display/StatusTag';
import { vehiclePath } from '@/constants/routes';
import { isNegativeMoney, subtractMoney } from '@/lib/money';
import { serviceTypesLabel } from '@xeprime/types';
import { vehicleTypeLabel } from '../constants';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../types';
import { VehicleAlertChips } from './VehicleAlerts';
import styles from './VehicleManagementCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface VehicleManagementCardProps {
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
}

const EMPTY = '—';

/**
 * Thẻ xe trong lưới `/manage/vehicles` — dựng theo Figma `236:1778` (`vehicle-list-v2-desktop`),
 * bản chỉnh 11/08/2026 chuyển lưới desktop lên 5 cột thẻ gọn (~207px).
 *
 * Giải phẫu khớp frame: **ảnh tràn viền → tên → mã · biển số → loại/dịch vụ kèm HAI trục trạng
 * thái → gạch ngang → giá thuê + khối chỉ số → gạch ngang → hàng nút.** Khác frame có chủ đích:
 *  - Chip nguồn xe dùng đúng `sourceType` đã lưu; cảnh báo đăng kiểm/bảo dưỡng vẫn chờ dữ liệu Wave 4.
 *  - Nhãn "TỔNG CHI PHÍ" thay vì "CHI PHÍ & KHẤU HAO" của Figma — con số là tổng phiếu chi đã
 *    duyệt, không có khấu hao; nhãn phải nói đúng số nó mô tả.
 *  - Thêm hàng giá ngày thường/cuối tuần (dữ liệu có thật trên bản ghi xe).
 *  - KHÔNG có nút "Xoá" (bản chỉnh 11/08/2026) — xoá chỉ nằm trong menu ⋮ của Hồ sơ 360.
 *
 * Không dựng lại primitive: trạng thái dùng `StatusTag`, hành động dùng `RowActions` (chặn nổi
 * bọt, tên khả truy cập).
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
}: VehicleManagementCardProps) {
  const fmt = useAppFormat();

  const specs = `${vehicleTypeLabel(vehicle.vehicleType)} / ${serviceTypesLabel(vehicle.serviceTypes)}`;
  const identity = [vehicle.code, vehicle.plateNumber].filter(Boolean).join(' · ');
  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;

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
      </div>

      <div className={styles.body}>
        <div className={styles.identity}>
          <div className={styles.identityHead}>
            <Link
              href={vehiclePath.detail(vehicle.id)}
              className={styles.name}
              title={vehicle.name}
            >
              {vehicle.name}
            </Link>
            <span className={styles.sourceBadge}>{VEHICLE_SOURCE_TYPE_LABEL[sourceType]}</span>
          </div>
          <p className={styles.meta}>{identity}</p>
        </div>

        {/* Hai trục trạng thái độc lập cùng một hàng — Figma `236:1794` vẽ cả hai chip. */}
        <div className={styles.specsStatus}>
          <span className={styles.specs}>{specs}</span>
          <span className={styles.statusPair}>
            <StatusTag
              value={vehicle.operationStatus as VehicleOperationStatus}
              meta={VEHICLE_OPERATION_STATUS_META} group="vehicleOperationStatus"
            />
            <StatusTag
              value={vehicle.publicStatus as VehiclePublicStatus}
              meta={VEHICLE_PUBLIC_STATUS_META} group="vehiclePublicStatus"
            />
          </span>
        </div>

        {/*
         * Cảnh báo do server tính — cùng phép tính với Hồ sơ 360, không suy lại ở đây.
         * Ba trạng thái tách bạch: đang tải (skeleton) · hỏng (nói thẳng là không biết) ·
         * xong (rỗng nghĩa là THẬT SỰ không có việc). Không bao giờ hiện "0 cảnh báo" giả.
         */}
        {alertsLoading ? (
          <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={false} />
        ) : alertsFailed ? (
          <p className={styles.metricsUnavailable}>Không tải được cảnh báo</p>
        ) : alerts ? (
          <VehicleAlertChips alerts={alerts.alerts} />
        ) : null}

        <div className={styles.metrics}>
          <dl className={styles.metricRow}>
            <div>
              <dt>Giá ngày thường</dt>
              <dd>{vehicle.weekdayPrice ? fmt.money(vehicle.weekdayPrice) : EMPTY}</dd>
            </div>
            <div className={styles.alignEnd}>
              <dt>Số KM hiện tại</dt>
              {/*
               * Chưa có số thì nói "Chưa có" — KHÔNG dựng "0 km" (docs §9). Gọi hỏng thì nói
               * "Không rõ": khác hẳn "xe chưa từng ghi nhận KM".
               */}
              <dd>{alertsFailed ? 'Không rõ' : alerts ? fmt.km(alerts.currentOdometerKm) : EMPTY}</dd>
            </div>
          </dl>
          <dl className={styles.metricRow}>
            <div>
              <dt>Giá cuối tuần</dt>
              <dd>{vehicle.weekendPrice ? fmt.money(vehicle.weekendPrice) : EMPTY}</dd>
            </div>
          </dl>

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
                      <dt>Tổng doanh thu</dt>
                      <dd className={styles.income}>{fmt.money(stats.totalIncome)}</dd>
                    </div>
                    <div className={styles.alignEnd}>
                      <dt>Tổng chi phí</dt>
                      <dd className={styles.expense}>{fmt.money(stats.totalExpense)}</dd>
                    </div>
                  </dl>

                  {/* Số mang dấu — Figma `236:2060` hiện "-500.000 đ" đỏ, nhãn giữ nguyên. */}
                  <dl className={styles.profitRow}>
                    <dt>Lợi nhuận thực tế</dt>
                    <dd className={atLoss ? styles.expense : styles.income}>
                      {fmt.money(profit)}
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
