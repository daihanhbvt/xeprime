'use client';

import { Select } from 'antd';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { VEHICLE_PROFIT_SORT_VALUES, type PaginationMeta } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { vehiclePath } from '@/constants/routes';
import { isNegativeMoney, isZeroMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceOverviewFilters, VehicleProfit } from '../types';
import styles from './VehicleProfitTable.module.css';

interface VehicleProfitTableProps {
  items: VehicleProfit[];
  meta: PaginationMeta;
  filters: FinanceOverviewFilters;
  /** Chi phí trong kỳ KHÔNG gắn xe nào — đến từ `summary`, không từ trang dữ liệu. */
  unassignedCost: string | undefined;
  loading: boolean;
  error: { onRetry: () => void } | null;
  onChange: (patch: Partial<FinanceOverviewFilters>) => void;
}

/**
 * Lãi/lỗ theo từng xe trong kỳ.
 *
 * **Sắp xếp bằng `Select` trên thanh, không bằng `sorter` trên đầu cột.** Không bảng nào trong
 * repo dùng `sorter` (`DataTable.tsx` ghi rõ 0/14), vì sắp xếp ở đây chạy trên SERVER: một mũi
 * tên trên đầu cột hứa sắp xếp tại chỗ, trong khi thực tế nó nạp lại trang.
 *
 * Bảng luôn hiện đủ mọi xe CÓ PHÁT SINH trong kỳ, kể cả xe doanh thu 0 mà có chuyến — đó chính
 * là dấu hiệu cần đi ghi phiếu, nên giấu nó đi là giấu mất việc cần làm.
 */
export function VehicleProfitTable({
  items,
  meta,
  filters,
  unassignedCost,
  loading,
  error,
  onChange,
}: VehicleProfitTableProps) {
  const t = useTranslations('Finance.overview.vehicles');
  const fmt = useAppFormat();
  const router = useRouter();

  const sortOptions = useMemo(
    () => VEHICLE_PROFIT_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
    [t],
  );

  const columns: DataTableColumn<VehicleProfit>[] = [
    {
      title: t('columns.vehicle'),
      dataIndex: 'vehicleName',
      width: 240,
      render: (_v, row) => (
        <EntityIdentity kind="vehicle" name={row.vehicleName} subtitle={row.plateNumber ?? '—'} />
      ),
    },
    {
      title: t('columns.trips'),
      dataIndex: 'trips',
      align: 'right',
      width: 96,
      render: (_v, row) => fmt.count(row.trips),
    },
    {
      title: t('columns.revenue'),
      dataIndex: 'revenue',
      align: 'right',
      width: 150,
      render: (_v, row) => <span className={styles.money}>{fmt.money(row.revenue)}</span>,
    },
    {
      title: t('columns.cost'),
      dataIndex: 'cost',
      align: 'right',
      width: 150,
      render: (_v, row) => <span className={styles.money}>{fmt.money(row.cost)}</span>,
    },
    {
      title: t('columns.profit'),
      dataIndex: 'profit',
      align: 'right',
      width: 160,
      render: (_v, row) => (
        <span
          className={isNegativeMoney(row.profit) ? styles.moneyNegative : styles.moneyStrong}
        >
          {fmt.money(row.profit)}
        </span>
      ),
    },
    {
      title: t('columns.margin'),
      dataIndex: 'profitMarginPercent',
      align: 'right',
      width: 100,
      // `null` là "xe chưa có doanh thu để tính biên" — khác hẳn "biên 0%" (hoà vốn).
      render: (_v, row) =>
        row.profitMarginPercent == null ? '—' : t('marginValue', { value: row.profitMarginPercent }),
    },
  ];

  return (
    // Không đặt `aria-label` ở section này: `DataTable` đã dựng một vùng mang đúng tên đó, và
    // hai vùng trùng tên khiến trình đọc màn hình đọc lặp. Tiêu đề `h2` lo phần cấu trúc.
    <section className={styles.block}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('title')}</h2>
        <label className={styles.sort}>
          <span className={styles.sortLabel}>{t('sort.label')}</span>
          <Select
            size="small"
            value={filters.sort ?? VEHICLE_PROFIT_SORT_VALUES[0]}
            options={sortOptions}
            onChange={(value) => onChange({ sort: value, page: 1 })}
            popupMatchSelectWidth={false}
          />
        </label>
      </div>

      <DataTable
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.vehicleId}
        minWidth={880}
        loading={loading}
        error={error ? { title: t('error'), onRetry: error.onRetry } : null}
        empty={{ title: t('empty'), description: t('emptyHint') }}
        onRowClick={(row) => router.push(vehiclePath.detail(row.vehicleId))}
        renderCard={(row) => (
          <div className={styles.card}>
            <EntityIdentity kind="vehicle" name={row.vehicleName} subtitle={row.plateNumber ?? '—'} />
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
        thích. Nó KHÔNG phải một dòng xe giả — nó là chú thích, nên nằm ngoài bảng.

        Cố ý KHÔNG có link ra sổ: sổ chưa lọc được "phiếu không gắn xe nào", nên một đường dẫn ở
        đây sẽ mở ra TOÀN BỘ phiếu chi và cho một con số khác hẳn câu vừa nói.
      */}
      {unassignedCost && !isZeroMoney(unassignedCost) ? (
        <p className={styles.footnote}>{t('unassigned', { value: fmt.money(unassignedCost) })}</p>
      ) : null}
    </section>
  );
}
