'use client';

import { Button, Empty, Input, Result, Select, Space, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ADMIN_TENANTS_DEFAULT_LIMIT } from '@/features/admin-tenants/api';
import { ADMIN_TENANT_STATUS_OPTIONS } from '@/features/admin-tenants/constants';
import { AdminTenantDetailDrawer } from '@/features/admin-tenants/components/AdminTenantDetailDrawer';
import { AdminTenantTable } from '@/features/admin-tenants/components/AdminTenantTable';
import { useAdminTenantFilters } from '@/features/admin-tenants/hooks/use-admin-tenant-filters';
import { useAdminTenants } from '@/features/admin-tenants/hooks/use-admin-tenants';
import styles from './tenants-page.module.css';

export default function AdminTenantsPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <AdminTenantsView />
    </Suspense>
  );
}

function AdminTenantsView() {
  const { filters, setFilters } = useAdminTenantFilters();
  const { data, isError, refetch, isFetching } = useAdminTenants(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: ADMIN_TENANTS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean((filters.q && filters.q.length > 0) || (filters.status && filters.status !== 'all'));

  return (
    <div>
      <ManagePageHeader
        title="Gian hàng"
        extra={
          <Space wrap>
            <Input.Search
              className={styles.search}
              size="large"
              allowClear
              placeholder="Tìm tên / mã / SĐT"
              defaultValue={filters.q}
              onSearch={(value) => setFilters({ q: value.trim() || undefined })}
            />
            <Select
              className={styles.statusSelect}
              size="large"
              value={filters.status ?? 'all'}
              options={ADMIN_TENANT_STATUS_OPTIONS}
              onChange={(value: string) => setFilters({ status: value })}
            />
          </Space>
        }
      />

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách gian hàng"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty
          className={styles.state}
          description={hasFilters ? 'Không có gian hàng khớp bộ lọc' : 'Chưa có gian hàng nào'}
        >
          {hasFilters ? (
            <Button onClick={() => setFilters({ q: undefined, status: 'all' })}>Xoá bộ lọc</Button>
          ) : null}
        </Empty>
      ) : (
        <AdminTenantTable
          items={items}
          meta={meta}
          loading={isFetching}
          onView={(id) => setSelected(id)}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}

      <AdminTenantDetailDrawer tenantId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
