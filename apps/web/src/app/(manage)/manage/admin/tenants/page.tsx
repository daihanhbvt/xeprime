'use client';

import { Suspense, useState } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ADMIN_TENANTS_DEFAULT_LIMIT } from '@/features/admin-tenants/api';
import { ADMIN_TENANT_STATUS_OPTIONS } from '@/features/admin-tenants/constants';
import { AdminTenantDetailDrawer } from '@/features/admin-tenants/components/AdminTenantDetailDrawer';
import { AdminTenantTable } from '@/features/admin-tenants/components/AdminTenantTable';
import { useAdminTenantFilters } from '@/features/admin-tenants/hooks/use-admin-tenant-filters';
import { useAdminTenants } from '@/features/admin-tenants/hooks/use-admin-tenants';

const FILTER_FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm gian hàng', placeholder: 'Tìm tên / mã / SĐT' },
  {
    kind: 'select',
    key: 'status',
    label: 'Trạng thái',
    options: ADMIN_TENANT_STATUS_OPTIONS,
    allowClear: false,
  },
];

const CLEARED = { q: undefined, status: 'all' } as const;

export default function AdminTenantsPage() {
  return (
    <Suspense fallback={<LoadingState variant="page" label="Đang tải danh sách gian hàng…" />}>
      <AdminTenantsView />
    </Suspense>
  );
}

function AdminTenantsView() {
  const { filters, setFilters } = useAdminTenantFilters();
  const { data, isError, refetch, isFetching } = useAdminTenants(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_TENANTS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const hasFilters = Boolean(
    (filters.q && filters.q.length > 0) || (filters.status && filters.status !== 'all'),
  );

  return (
    <div>
      <ManagePageHeader title="Gian hàng" />

      <FilterBar
        fields={FILTER_FIELDS}
        values={filters as Record<string, string | undefined>}
        onChange={(patch) => setFilters(patch)}
      />

      <AdminTenantTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => setSelected(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <AdminTenantDetailDrawer tenantId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
