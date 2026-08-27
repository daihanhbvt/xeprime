'use client';

import { Button, Segmented, Spin } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo } from 'react';
import { FINANCE_GRANULARITY_VALUES, PERMISSION, RECEIPT_TYPE } from '@xeprime/types';
import { RevenueTrendChart } from '@/components/chart/RevenueTrendChart';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { buildPeriodRange, type PeriodKey } from '@/lib/datetime';
import { CategoryBreakdown } from '@/features/finance/components/CategoryBreakdown';
import { CustomerRevenueTable } from '@/features/finance/components/CustomerRevenueTable';
import { FinanceOverviewCards } from '@/features/finance/components/FinanceOverviewCards';
import { VehicleProfitTable } from '@/features/finance/components/VehicleProfitTable';
import {
  FINANCE_OVERVIEW_PERIOD_VALUES,
  VEHICLE_PROFIT_PAGE_SIZE,
} from '@/features/finance/constants';
import {
  useCustomerRevenue,
  useFinanceByCategory,
  useFinanceSeries,
  useFinanceSummaryOverview,
  useVehicleProfit,
} from '@/features/finance/hooks/use-finance-overview';
import { useFinanceOverviewFilters } from '@/features/finance/hooks/use-finance-overview-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceOverviewFilters } from '@/features/finance/types';
import styles from './finance-page.module.css';

export default function FinancePage() {
  // Hook lọc đọc `useSearchParams` → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <FinanceOverviewView />
    </Suspense>
  );
}

function FinanceOverviewView() {
  const t = useTranslations('Finance.overview');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const { filters, setFilters } = useFinanceOverviewFilters();

  const summary = useFinanceSummaryOverview(filters);
  const series = useFinanceSeries(filters);
  const income = useFinanceByCategory(filters, RECEIPT_TYPE.INCOME);
  const expense = useFinanceByCategory(filters, RECEIPT_TYPE.EXPENSE);
  const vehicles = useVehicleProfit(filters);
  const customers = useCustomerRevenue(filters);

  const periodOptions = useMemo(
    () => FINANCE_OVERVIEW_PERIOD_VALUES.map((value) => ({ value, label: t(`periods.${value}`) })),
    [t],
  );
  const granularityOptions = useMemo(
    () => FINANCE_GRANULARITY_VALUES.map((value) => ({ value, label: t(`chart.every.${value}`) })),
    [t],
  );

  const filterFields = useMemo<readonly FilterField[]>(
    () => [{ kind: 'dateRange', fromKey: 'from', toKey: 'to', label: t('filters.dateRange') }],
    [t],
  );

  // Thiếu quyền xem tiền → thay TOÀN BỘ nội dung. Chặn thật vẫn là guard backend; ở đây chỉ là
  // để màn hình nói "bạn không được vào" thay vì trông như đang hỏng.
  if (!has(PERMISSION.FINANCE_VIEW)) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbidden.title')}
        description={t('forbidden.description')}
        missingPermissions={[PERMISSION.FINANCE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{t('forbidden.home')}</Button>
          </Link>
        }
      />
    );
  }

  /** Kỳ dựng sẵn ghi thẳng `from`/`to` — cùng tham số với ô chọn ngày, không đẻ tham số thứ hai. */
  const activePeriod = periodOptions.find((option) => {
    const range = buildPeriodRange(option.value);
    return filters.from === range.from && filters.to === range.to;
  })?.value;

  /**
   * Nhãn cột theo ĐỘ MỊN THẬT mà server đã dùng, không theo thứ client xin: kỳ dài bị server hạ
   * xuống `month` mà nhãn vẫn in ngày thì mỗi cột nói dối về khoảng nó đại diện.
   */
  const granularity = series.data?.granularity ?? filters.granularity;
  const labelOf = (bucket: string) =>
    granularity === 'month'
      ? fmt.monthYear(new Date(`${bucket}T12:00:00Z`))
      : fmt.dateKey(bucket);

  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((b) => b.revenue === '0' && b.cost === '0');

  const emptyMeta = { page: 1, limit: VEHICLE_PROFIT_PAGE_SIZE, total: 0, hasNext: false };
  const vehicleMeta = vehicles.data?.meta ?? emptyMeta;
  const customerMeta = customers.data?.meta ?? emptyMeta;

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <div className={styles.periods}>
        <Segmented
          options={periodOptions}
          // Không kỳ nào khớp (khoảng ngày tự chọn) → không tô sáng nút nào.
          value={activePeriod ?? ''}
          onChange={(value) => setFilters(buildPeriodRange(value as PeriodKey))}
          aria-label={t('periods.label')}
        />
      </div>

      <FilterBar
        fields={filterFields}
        values={filters as FilterValues}
        onChange={(patch) => setFilters(patch as Partial<FinanceOverviewFilters>)}
        compactFields
      />

      <FinanceOverviewCards
        data={summary.data}
        filters={filters}
        loading={summary.isFetching}
        error={summary.isError}
      />

      <RevenueTrendChart
        points={series.data?.buckets ?? []}
        labelOf={labelOf}
        title={t('chart.title')}
        description={t('chart.description')}
        loading={series.isFetching && !series.data}
        error={
          series.isError && !series.data
            ? { title: t('chart.error'), onRetry: () => void series.refetch() }
            : null
        }
        empty={seriesEmpty ? { title: t('chart.empty'), description: t('chart.emptyHint') } : null}
        actions={
          <Segmented
            size="small"
            options={granularityOptions}
            value={granularity ?? FINANCE_GRANULARITY_VALUES[0]}
            onChange={(value) => setFilters({ granularity: String(value) })}
            aria-label={t('chart.every.label')}
          />
        }
      />

      <div className={styles.breakdowns}>
        <CategoryBreakdown
          title={t('categories.incomeTitle')}
          type={RECEIPT_TYPE.INCOME}
          tone="revenue"
          data={income.data}
          filters={filters}
          loading={income.isFetching}
          error={income.isError}
        />
        <CategoryBreakdown
          title={t('categories.expenseTitle')}
          type={RECEIPT_TYPE.EXPENSE}
          tone="cost"
          data={expense.data}
          filters={filters}
          loading={expense.isFetching}
          error={expense.isError}
        />
      </div>

      <VehicleProfitTable
        items={vehicles.data?.items ?? []}
        meta={vehicleMeta}
        filters={filters}
        unassignedCost={summary.data?.unassignedCost}
        loading={vehicles.isFetching}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ bảng đang đọc.
        error={vehicles.isError && !vehicles.data ? { onRetry: () => void vehicles.refetch() } : null}
        onChange={setFilters}
      />

      <CustomerRevenueTable
        items={customers.data?.items ?? []}
        meta={customerMeta}
        unassignedRevenue={summary.data?.unassignedRevenue}
        sort={filters.customerSort}
        loading={customers.isFetching}
        error={
          customers.isError && !customers.data ? { onRetry: () => void customers.refetch() } : null
        }
        onChange={setFilters}
      />
    </div>
  );
}
