'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { customerPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { CUSTOMERS_DEFAULT_LIMIT } from '@/features/customers/api';
import { CustomerFormModal } from '@/features/customers/components/CustomerFormModal';
import { CustomerSummaryCards } from '@/features/customers/components/CustomerSummaryCards';
import { CustomerTable } from '@/features/customers/components/CustomerTable';
import { CUSTOMER_HINTS, relationshipOptions, sortOptions } from '@/features/customers/constants';
import { useCustomerFilters } from '@/features/customers/hooks/use-customer-filters';
import { useCustomerSummary, useCustomers } from '@/features/customers/hooks/use-customers';
import type { CustomerFilters } from '@/features/customers/types';
import styles from './customers-page.module.css';

export default function CustomersPage() {
  // `useCustomerFilters` đọc `useSearchParams` → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <CustomersView />
    </Suspense>
  );
}

/**
 * Sổ khách của GIAN HÀNG (gap S-01) — "khách này thuê 6 lần, còn nợ 2tr, từng trả xe muộn".
 *
 * KHÔNG phải `/manage/admin/customers`: đó là màn giám sát khách thuê toàn nền tảng của admin.
 * Trang này chỉ thấy khách của chính gian hàng đang đăng nhập, và backend là nơi quyết định
 * điều đó (`tenantId` lấy từ membership, không bao giờ từ URL).
 */
function CustomersView() {
  const router = useRouter();
  const { has } = usePermissions();

  const canView = has(PERMISSION.CUSTOMER_VIEW);
  const canManage = has(PERMISSION.CUSTOMER_MANAGE);
  const canViewFinance = has(PERMISSION.FINANCE_VIEW);

  const { filters, relationship, sort, setFilters, clear, hasActiveFilters } =
    useCustomerFilters(canViewFinance);
  const { data, isError, refetch, isFetching } = useCustomers(filters, canView);
  const summary = useCustomerSummary(canView);

  const [formOpen, setFormOpen] = useState(false);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: filters.page ?? 1,
    limit: filters.limit ?? CUSTOMERS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };

  const filterFields: readonly FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: 'Tìm khách hàng',
      placeholder: 'Tìm theo tên, số điện thoại hoặc email',
    },
    {
      kind: 'select',
      key: 'relationship',
      label: 'Nhóm khách',
      allowClear: false,
      options: relationshipOptions(canViewFinance),
    },
    {
      kind: 'select',
      key: 'sort',
      label: 'Sắp xếp',
      allowClear: false,
      options: sortOptions(canViewFinance),
    },
  ];

  function changeFilters(patch: FilterValues) {
    const next: Partial<CustomerFilters> = {};
    if ('q' in patch) next.q = patch.q;
    if ('relationship' in patch) next.relationship = patch.relationship;
    if ('sort' in patch) next.sort = patch.sort;
    setFilters(next);
  }

  const addButton = canManage ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Thêm khách hàng
    </Button>
  ) : null;

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title="Khách hàng"
        subtitle="Sổ khách của gian hàng: lịch sử thuê, công nợ, ghi chú và giấy tờ — chỉ gian hàng của bạn nhìn thấy."
        extra={addButton}
      />

      {canView ? (
        <CustomerSummaryCards
          summary={summary.data}
          loading={summary.isLoading}
          canViewFinance={canViewFinance}
        />
      ) : null}

      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, relationship, sort }}
        onChange={changeFilters}
        onClear={hasActiveFilters ? clear : undefined}
        searchDebounceMs={300}
      />

      <p className={styles.hint}>{CUSTOMER_HINTS.relationship}</p>

      <CustomerTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasActiveFilters}
        canViewFinance={canViewFinance}
        permissionDenied={!canView}
        emptyAction={addButton}
        onClearFilters={clear}
        onOpen={(customer) => router.push(customerPath.detail(customer.id))}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <CustomerFormModal
        open={formOpen}
        customer={null}
        onClose={() => setFormOpen(false)}
        onOpenExisting={(id) => router.push(customerPath.detail(id))}
      />
    </div>
  );
}
