'use client';

import { Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { PERMISSION } from '@xeprime/types';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { customerPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { CUSTOMERS_DEFAULT_LIMIT } from '@/features/customers/api';
import { CustomerSummaryCards } from '@/features/customers/components/CustomerSummaryCards';
import { CustomerTable } from '@/features/customers/components/CustomerTable';
import { relationshipValues, sortValues } from '@/features/customers/constants';
import { useCustomerFilters } from '@/features/customers/hooks/use-customer-filters';
import { useCustomerSummary, useCustomers } from '@/features/customers/hooks/use-customers';
import type { CustomerFilters } from '@/features/customers/types';
import styles from './CustomersPage.module.css';

export function CustomersPage() {
  // `useCustomerFilters` đọc `useSearchParams` → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <CustomersView />
    </Suspense>
  );
}

/**
 * Sổ khách của GIAN HÀNG (gap S-01) — "khách này thuê 6 lần, còn nợ 2tr, từng trả xe muộn".
 * Figma Partner-XePrime "Users List" `23777:53057` (02/11/2026).
 *
 * KHÔNG có nút "Thêm khách hàng" (chốt 02/11/2026): khách vào sổ TỰ ĐỘNG khi đặt xe hoặc khi gian
 * hàng lập đơn — sổ khách là hệ quả của giao dịch, không phải một danh bạ nhập tay.
 *
 * KHÔNG phải `/manage/admin/customers`: đó là màn giám sát khách thuê toàn nền tảng của admin.
 * Trang này chỉ thấy khách của chính gian hàng đang đăng nhập, và backend là nơi quyết định
 * điều đó (`tenantId` lấy từ membership, không bao giờ từ URL).
 */
function CustomersView() {
  const t = useTranslations('Customers');
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const { has } = usePermissions();

  const canView = has(PERMISSION.CUSTOMER_VIEW);
  const canViewFinance = has(PERMISSION.FINANCE_VIEW);

  const { filters, relationship, sort, setFilters, clear, hasActiveFilters } =
    useCustomerFilters(canViewFinance);
  const { data, isError, refetch, isFetching } = useCustomers(filters, canView);
  const summary = useCustomerSummary(canView);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: filters.page ?? 1,
    limit: filters.limit ?? CUSTOMERS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };

  const filterFields = useMemo<readonly FilterField[]>(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.search'),
        placeholder: t('filters.searchPlaceholder'),
      },
      {
        kind: 'select',
        key: 'relationship',
        label: t('filters.relationship'),
        allowClear: false,
        options: relationshipValues(canViewFinance).map((value) => ({
          value,
          label: domainLabel('tenantCustomerRelationship', value),
        })),
      },
      {
        kind: 'select',
        key: 'sort',
        label: t('filters.sort'),
        allowClear: false,
        options: sortValues(canViewFinance).map((value) => ({
          value,
          label: domainLabel('tenantCustomerSort', value),
        })),
      },
    ],
    [t, domainLabel, canViewFinance],
  );

  function changeFilters(patch: FilterValues) {
    const next: Partial<CustomerFilters> = {};
    if ('q' in patch) next.q = patch.q;
    if ('relationship' in patch) next.relationship = patch.relationship;
    if ('sort' in patch) next.sort = patch.sort;
    setFilters(next);
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('page.listTitle')} subtitle={t('page.listSubtitle')} />

      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, relationship, sort }}
        onChange={changeFilters}
        onClear={hasActiveFilters ? clear : undefined}
        searchDebounceMs={300}
      />

      {canView ? (
        <CustomerSummaryCards
          summary={summary.data}
          loading={summary.isLoading}
          canViewFinance={canViewFinance}
        />
      ) : null}

      <CustomerTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasActiveFilters}
        canViewFinance={canViewFinance}
        permissionDenied={!canView}
        onClearFilters={clear}
        onOpen={(customer) => router.push(customerPath.detail(customer.id))}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

    </div>
  );
}
