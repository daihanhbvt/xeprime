'use client';

import { Select, Tabs } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { CUSTOMER_REVENUE_SORT_VALUES, VEHICLE_PROFIT_SORT_VALUES } from '@xeprime/types';
import {
  FINANCE_PERFORMANCE_VIEW,
  FINANCE_PERFORMANCE_VIEW_VALUES,
  VEHICLE_PROFIT_PAGE_SIZE,
  type FinancePerformanceView,
} from '../constants';
import { useCustomerRevenue, useVehicleProfit } from '../hooks/use-finance-overview';
import type { FinanceOverviewFilters } from '../types';
import { CustomerRevenueTable } from './CustomerRevenueTable';
import { VehicleProfitTable } from './VehicleProfitTable';
import styles from './BusinessPerformanceCard.module.css';

interface BusinessPerformanceCardProps {
  filters: FinanceOverviewFilters;
  /** Chi phí / doanh thu của kỳ không gắn xe / khách nào — từ `summary`, cho dòng chú thích. */
  unassignedCost: string | undefined;
  unassignedRevenue: string | undefined;
  onChange: (patch: Partial<FinanceOverviewFilters>) => void;
}

/**
 * "Hiệu suất kinh doanh" — design Partner-XePrime `23813:37081`: MỘT thẻ, hai tab "Theo xe" /
 * "Theo khách", ô "Sắp xếp: …" ở góc phải đổi theo tab đang mở.
 *
 * Tab sống trên URL (`?perf=`), sắp xếp và trang của mỗi tab vẫn mang tham số riêng
 * (`sort`/`page` · `customerSort`/`customerPage`): đổi tab rồi quay lại không mất chỗ đang đọc.
 * Chỉ tab đang mở mới gọi API.
 */
export function BusinessPerformanceCard({
  filters,
  unassignedCost,
  unassignedRevenue,
  onChange,
}: BusinessPerformanceCardProps) {
  const t = useTranslations('Finance.overview');

  const view: FinancePerformanceView =
    filters.perf === FINANCE_PERFORMANCE_VIEW.CUSTOMERS
      ? FINANCE_PERFORMANCE_VIEW.CUSTOMERS
      : FINANCE_PERFORMANCE_VIEW.VEHICLES;
  const byCustomer = view === FINANCE_PERFORMANCE_VIEW.CUSTOMERS;

  const vehicles = useVehicleProfit(filters, !byCustomer);
  const customers = useCustomerRevenue(filters, byCustomer);

  const vehicleSortOptions = useMemo(
    () => VEHICLE_PROFIT_SORT_VALUES.map((value) => ({ value, label: t(`vehicles.sort.${value}`) })),
    [t],
  );
  const customerSortOptions = useMemo(
    () =>
      CUSTOMER_REVENUE_SORT_VALUES.map((value) => ({ value, label: t(`customers.sort.${value}`) })),
    [t],
  );

  const emptyMeta = { page: 1, limit: VEHICLE_PROFIT_PAGE_SIZE, total: 0, hasNext: false };

  const tabItems = FINANCE_PERFORMANCE_VIEW_VALUES.map((key) => ({
    key,
    label: t(`performance.tabs.${key}`),
  }));

  return (
    <section className={styles.card} aria-labelledby="xp-fin-performance">
      <div className={styles.header}>
        <h2 id="xp-fin-performance" className={styles.title}>
          {t('performance.title')}
        </h2>
        {byCustomer ? (
          <Select
            className={styles.sort}
            size="large"
            aria-label={t('customers.sort.label')}
            labelRender={(item) => t('performance.sortValue', { label: String(item.label) })}
            value={filters.customerSort ?? CUSTOMER_REVENUE_SORT_VALUES[0]}
            options={customerSortOptions}
            onChange={(value) => onChange({ customerSort: value, customerPage: 1 })}
            popupMatchSelectWidth={false}
          />
        ) : (
          <Select
            className={styles.sort}
            size="large"
            aria-label={t('vehicles.sort.label')}
            labelRender={(item) => t('performance.sortValue', { label: String(item.label) })}
            value={filters.sort ?? VEHICLE_PROFIT_SORT_VALUES[0]}
            options={vehicleSortOptions}
            onChange={(value) => onChange({ sort: value, page: 1 })}
            popupMatchSelectWidth={false}
          />
        )}
      </div>

      <Tabs
        className={styles.tabs}
        activeKey={view}
        items={tabItems}
        aria-label={t('performance.tabs.label')}
        // Mặc định (theo xe) không ghi lên URL — `/finance` trần vẫn là đường dẫn hợp lệ.
        onChange={(key) =>
          onChange({ perf: key === FINANCE_PERFORMANCE_VIEW.CUSTOMERS ? key : undefined })
        }
      />

      {byCustomer ? (
        <CustomerRevenueTable
          items={customers.data?.items ?? []}
          meta={customers.data?.meta ?? emptyMeta}
          unassignedRevenue={unassignedRevenue}
          loading={customers.isFetching}
          // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ bảng đang đọc.
          error={
            customers.isError && !customers.data ? { onRetry: () => void customers.refetch() } : null
          }
          onChange={onChange}
        />
      ) : (
        <VehicleProfitTable
          items={vehicles.data?.items ?? []}
          meta={vehicles.data?.meta ?? emptyMeta}
          unassignedCost={unassignedCost}
          loading={vehicles.isFetching}
          error={vehicles.isError && !vehicles.data ? { onRetry: () => void vehicles.refetch() } : null}
          onChange={onChange}
        />
      )}
    </section>
  );
}
