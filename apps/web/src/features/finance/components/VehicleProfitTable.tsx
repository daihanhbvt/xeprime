'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { PaginationMeta } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { vehiclePath } from '@/constants/routes';
import { isNegativeMoney, isZeroMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceOverviewFilters, VehicleProfit } from '../types';
import { rowNumberOf } from '@/lib/pagination';
import styles from './VehicleProfitTable.module.css';

interface VehicleProfitTableProps {
  items: VehicleProfit[];
  meta: PaginationMeta;
  /** Chi phí trong kỳ KHÔNG gắn xe nào — đến từ `summary`, không từ trang dữ liệu. */
  unassignedCost: string | undefined;
  loading: boolean;
  error: { onRetry: () => void } | null;
  onChange: (patch: Partial<FinanceOverviewFilters>) => void;
}

/**
 * Lãi/lỗ theo từng xe trong kỳ — tab "Theo xe" của khối Hiệu suất kinh doanh
 * (`BusinessPerformanceCard`, design `23813:37081`). Tiêu đề, tab và ô sắp xếp thuộc về thẻ bọc
 * ngoài; ở đây chỉ còn bảng.
 *
 * **Sắp xếp bằng `Select` trên thẻ, không bằng `sorter` trên đầu cột.** Không bảng nào trong repo
 * dùng `sorter` (`DataTable.tsx`), vì sắp xếp ở đây chạy trên SERVER: một mũi tên trên đầu cột hứa
 * sắp xếp tại chỗ, trong khi thực tế nó nạp lại trang.
 *
 * Bảng luôn hiện đủ mọi xe CÓ PHÁT SINH trong kỳ, kể cả xe doanh thu 0 mà có chuyến — đó chính
 * là dấu hiệu cần đi ghi phiếu, nên giấu nó đi là giấu mất việc cần làm.
 */
export function VehicleProfitTable({
  items,
  meta,
  unassignedCost,
  loading,
  error,
  onChange,
}: VehicleProfitTableProps) {
  const t = useTranslations('Finance.overview.vehicles');
  const fmt = useAppFormat();
  const router = useRouter();

  const columns: DataTableColumn<VehicleProfit>[] = [
    {
      title: t('columns.index'),
      key: 'index',
      width: 72,
      align: 'center',
      render: (_v, _row, index) => rowNumberOf(meta, index),
    },
    {
      title: t('columns.vehicle'),
      dataIndex: 'vehicleName',
      width: 320,
      render: (_v, row) => (
        <EntityIdentity
          kind="vehicle"
          size="sm"
          imageUrl={row.mainImageUrl}
          name={row.vehicleName}
          subtitle={row.plateNumber ?? '-'}
        />
      ),
    },
    {
      title: t('columns.trips'),
      dataIndex: 'trips',
      width: 110,
      render: (_v, row) => fmt.count(row.trips),
    },
    {
      title: t('columns.revenue'),
      dataIndex: 'revenue',
      width: 170,
      render: (_v, row) => <span className={styles.money}>{fmt.money(row.revenue)}</span>,
    },
    {
      title: t('columns.cost'),
      dataIndex: 'cost',
      width: 170,
      render: (_v, row) => <span className={styles.money}>{fmt.money(row.cost)}</span>,
    },
    {
      title: t('columns.profit'),
      dataIndex: 'profit',
      width: 170,
      render: (_v, row) => (
        <span className={isNegativeMoney(row.profit) ? styles.moneyNegative : styles.moneyStrong}>
          {fmt.money(row.profit)}
        </span>
      ),
    },
    {
      title: t('columns.margin'),
      dataIndex: 'profitMarginPercent',
      width: 110,
      // `null` là "xe chưa có doanh thu để tính biên" — khác hẳn "biên 0%" (hoà vốn).
      render: (_v, row) =>
        row.profitMarginPercent == null ? '-' : t('marginValue', { value: row.profitMarginPercent }),
    },
  ];

  return (
    <div className={styles.block}>
      <DataTable
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.vehicleId}
        minWidth={1040}
        loading={loading}
        error={error ? { title: t('error'), onRetry: error.onRetry } : null}
        empty={{ title: t('empty'), description: t('emptyHint') }}
        onRowClick={(row) => router.push(vehiclePath.detail(row.vehicleId))}
        renderCard={(row) => (
          <div className={styles.card}>
            <EntityIdentity
              kind="vehicle"
              size="sm"
              imageUrl={row.mainImageUrl}
              name={row.vehicleName}
              subtitle={row.plateNumber ?? '-'}
            />
            <div className={styles.cardMoney}>
              <span
                className={isNegativeMoney(row.profit) ? styles.moneyNegative : styles.moneyStrong}
              >
                {fmt.money(row.profit)}
              </span>
              <span className={styles.cardMeta}>
                {t('cardLine', {
                  revenue: fmt.moneyCompact(row.revenue),
                  cost: fmt.moneyCompact(row.cost),
                  trips: row.trips,
                })}
              </span>
            </div>
          </div>
        )}
        pagination={{
          meta,
          onChange: (page, pageSize) => onChange({ page, limit: pageSize }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      {/*
        Chi phí chung không gắn xe. Thiếu dòng này thì tổng cột "Chi phí" của bảng nhỏ hơn thẻ
        "Chi phí" ngay phía trên, và người dùng đi tìm mãi phần chênh mà không có chỗ nào giải
        thích. Nó KHÔNG phải một dòng xe giả — nó là chú thích, nên nằm ngoài bảng (chốt 04/11/2026).

        Cố ý KHÔNG có link ra sổ: sổ chưa lọc được "phiếu không gắn xe nào", nên một đường dẫn ở
        đây sẽ mở ra TOÀN BỘ phiếu chi và cho một con số khác hẳn câu vừa nói.
      */}
      {unassignedCost && !isZeroMoney(unassignedCost) ? (
        <p className={styles.footnote}>{t('unassigned', { value: fmt.money(unassignedCost) })}</p>
      ) : null}
    </div>
  );
}
