'use client';

import { Button, Segmented, Spin } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo } from 'react';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  PERMISSION,
  RECEIPT_TYPE,
} from '@xeprime/types';
import { RevenueTrendChart, RevenueTrendLegend } from '@/components/chart/RevenueTrendChart';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ALL_FILTER } from '@/constants/filters';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { DAY_PARAM_FORMAT, buildPeriodRange, dayjs, type PeriodKey } from '@/lib/datetime';
import { BusinessPerformanceCard } from '@/features/finance/components/BusinessPerformanceCard';
import { CategoryBreakdown } from '@/features/finance/components/CategoryBreakdown';
import { SourceBreakdown } from '@/features/finance/components/SourceBreakdown';
import { FinanceOverviewCards } from '@/features/finance/components/FinanceOverviewCards';
import { FINANCE_OVERVIEW_PERIOD_VALUES } from '@/features/finance/constants';
import {
  useFinanceByCategory,
  useFinanceBySource,
  useFinanceSeries,
  useFinanceSummaryOverview,
} from '@/features/finance/hooks/use-finance-overview';
import { useFinanceOverviewFilters } from '@/features/finance/hooks/use-finance-overview-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceCategoryBreakdown, FinanceOverviewFilters } from '@/features/finance/types';
import { ShopTaxWithheldCard } from '@/features/tax/components/ShopTaxWithheldCard';
import styles from './finance-page.module.css';

export default function FinancePage() {
  // Hook lọc đọc `useSearchParams` → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <FinanceOverviewView />
    </Suspense>
  );
}

/**
 * Tổng quan doanh thu — design Partner-XePrime "Revenue Overview" (`23813:30723`, `23813:38107`):
 * kỳ xem nhanh + chi nhánh + khoảng ngày · sáu thẻ số · dòng tiền & lợi nhuận theo thời gian ·
 * cơ cấu thu/chi · hiệu suất theo xe/khách · thuế đã khấu trừ. Kiểm kê và quyết định:
 * `docs/design/09_PARTNER_REDESIGN.md` §3.9.
 */
function FinanceOverviewView() {
  const t = useTranslations('Finance.overview');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const { filters, setFilters } = useFinanceOverviewFilters();
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });

  const summary = useFinanceSummaryOverview(filters);
  const series = useFinanceSeries(filters);
  const income = useFinanceByCategory(filters, RECEIPT_TYPE.INCOME);
  const expense = useFinanceByCategory(filters, RECEIPT_TYPE.EXPENSE);
  // Doanh thu theo nguồn đơn (ADR 0110): tổng · qua XePrime · tự khai thác theo từng kênh.
  const sources = useFinanceBySource(filters);

  const periodOptions = useMemo(
    () => FINANCE_OVERVIEW_PERIOD_VALUES.map((value) => ({ value, label: t(`periods.${value}`) })),
    [t],
  );
  const granularityOptions = useMemo(
    () => FINANCE_GRANULARITY_VALUES.map((value) => ({ value, label: t(`chart.every.${value}`) })),
    [t],
  );

  const filterFields = useMemo<readonly FilterField[]>(
    () => [
      ...(branch.field ? [branch.field] : []),
      { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: t('filters.dateRange') },
    ],
    [t, branch.field],
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
   *
   * Cột tuần ghi cả KHOẢNG ngày ("06/10 – 12/10", như design), cắt theo hai đầu kỳ đang xem: tuần
   * đầu của "Tháng này" bắt đầu từ ngày 1 chứ không từ thứ Hai của tháng trước.
   */
  const granularity = series.data?.granularity ?? filters.granularity;
  const dayMonthOf = (key: string) => fmt.dayMonth(`${key}T12:00:00+07:00`);
  const labelOf = (bucket: string) => {
    if (granularity === FINANCE_GRANULARITY.MONTH) {
      return fmt.monthYear(new Date(`${bucket}T12:00:00Z`));
    }
    if (granularity === FINANCE_GRANULARITY.WEEK) {
      const weekEnd = dayjs(bucket).add(6, 'day').format(DAY_PARAM_FORMAT);
      const from = filters.from && filters.from > bucket ? filters.from : bucket;
      const to = filters.to && filters.to < weekEnd ? filters.to : weekEnd;
      return t('chart.weekRange', { from: dayMonthOf(from), to: dayMonthOf(to) });
    }
    return fmt.dateKey(bucket);
  };

  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((b) => b.revenue === '0' && b.cost === '0');

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <div className={styles.toolbar}>
        <div className={styles.periods}>
          <Segmented
            size="large"
            options={periodOptions}
            // Không kỳ nào khớp (khoảng ngày tự chọn) → không tô sáng nút nào.
            value={activePeriod ?? ''}
            onChange={(value) => setFilters(buildPeriodRange(value as PeriodKey))}
            aria-label={t('periods.label')}
          />
        </div>
        <FilterBar
          className={styles.filters}
          fields={filterFields}
          values={{ ...(filters as FilterValues), branchId: filters.branchId ?? ALL_FILTER }}
          onChange={(patch) =>
            setFilters(
              ('branchId' in patch
                ? { ...patch, branchId: patch.branchId === ALL_FILTER ? undefined : patch.branchId }
                : patch) as Partial<FinanceOverviewFilters>,
            )
          }
        />
      </div>

      <FinanceOverviewCards
        data={summary.data}
        filters={filters}
        revenueReceipts={receiptCountOf(income.data)}
        costReceipts={receiptCountOf(expense.data)}
        loading={summary.isFetching}
        error={summary.isError}
      />

      <RevenueTrendChart
        className={styles.card}
        points={series.data?.buckets ?? []}
        labelOf={labelOf}
        title={t('chart.title')}
        legend="none"
        yAxis="million"
        height={260}
        loading={series.isFetching && !series.data}
        error={
          series.isError && !series.data
            ? { title: t('chart.error'), onRetry: () => void series.refetch() }
            : null
        }
        empty={seriesEmpty ? { title: t('chart.empty'), description: t('chart.emptyHint') } : null}
        actions={
          <div className={styles.chartActions}>
            {/* Chú giải đứng cạnh nút độ mịn (chốt 04/11/2026) — design không vẽ, nhưng ba series
                không chú giải thì màu là thứ người đọc phải tự đoán. */}
            <RevenueTrendLegend />
            <Segmented
              size="large"
              options={granularityOptions}
              value={granularity ?? FINANCE_GRANULARITY_VALUES[0]}
              onChange={(value) => setFilters({ granularity: String(value) })}
              aria-label={t('chart.every.label')}
            />
          </div>
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

      <SourceBreakdown
        data={sources.data}
        loading={sources.isFetching}
        error={sources.isError}
        onRetry={() => void sources.refetch()}
      />

      <BusinessPerformanceCard
        filters={filters}
        unassignedCost={summary.data?.unassignedCost}
        unassignedRevenue={summary.data?.unassignedRevenue}
        onChange={setFilters}
      />

      {/*
        Thuế đã khấu trừ trong kỳ (Phase 8 — ADR 0032 điều 3). Đứng ở sổ tài chính vì nó là một
        dòng làm GIẢM tiền chủ xe thực nhận, nên nó thuộc cùng câu hỏi với doanh thu và chi phí.
      */}
      <ShopTaxWithheldCard />
    </div>
  );
}

/**
 * Số phiếu của một chiều tiền trong kỳ — cộng từ cơ cấu theo danh mục (đã loại cọc, cùng bộ lọc
 * với thẻ Doanh thu/Chi phí). Đếm phiếu là số nguyên, không phải tiền, nên cộng ở client là đúng.
 */
function receiptCountOf(data: FinanceCategoryBreakdown | undefined): number | undefined {
  return data?.items.reduce((sum, item) => sum + item.count, 0);
}
