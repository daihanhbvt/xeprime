'use client';

import { Button, Checkbox, Empty, Input, Result, Select, Space, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ADMIN_CUSTOMERS_DEFAULT_LIMIT } from '@/features/admin-customers/api';
import { ADMIN_CUSTOMER_STATUS_OPTIONS } from '@/features/admin-customers/constants';
import { AdminCustomerDetailDrawer } from '@/features/admin-customers/components/AdminCustomerDetailDrawer';
import { AdminCustomerTable } from '@/features/admin-customers/components/AdminCustomerTable';
import { useAdminCustomerFilters } from '@/features/admin-customers/hooks/use-admin-customer-filters';
import { useAdminCustomers } from '@/features/admin-customers/hooks/use-admin-customers';
import type { AdminCustomerFilters } from '@/features/admin-customers/types';
import styles from './customers-page.module.css';

const CLEARED: Partial<AdminCustomerFilters> = {
  q: undefined,
  phone: undefined,
  email: undefined,
  status: 'all',
  hasRequests: false,
};

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <AdminCustomersView />
    </Suspense>
  );
}

function AdminCustomersView() {
  const { filters, setFilters } = useAdminCustomerFilters();
  const { data, isError, refetch, isFetching } = useAdminCustomers(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_CUSTOMERS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const hasFilters = Boolean(
    filters.q ||
      filters.phone ||
      filters.email ||
      (filters.status && filters.status !== 'all') ||
      filters.hasRequests,
  );

  return (
    <div>
      <ManagePageHeader
        title="Khách thuê"
        extra={
          <Space wrap>
            <Input.Search
              className={styles.search}
              size="large"
              allowClear
              placeholder="Tìm theo tên"
              defaultValue={filters.q}
              onSearch={(value) => setFilters({ q: value.trim() || undefined })}
            />
            <Input.Search
              className={styles.exact}
              size="large"
              allowClear
              placeholder="Tra đúng SĐT"
              defaultValue={filters.phone}
              onSearch={(value) => setFilters({ phone: value.trim() || undefined })}
            />
            <Input.Search
              className={styles.exact}
              size="large"
              allowClear
              placeholder="Tra đúng email"
              defaultValue={filters.email}
              onSearch={(value) => setFilters({ email: value.trim() || undefined })}
            />
            <Select
              className={styles.statusSelect}
              size="large"
              value={filters.status ?? 'all'}
              options={ADMIN_CUSTOMER_STATUS_OPTIONS}
              onChange={(value: string) => setFilters({ status: value })}
            />
            <Checkbox
              checked={Boolean(filters.hasRequests)}
              onChange={(e) => setFilters({ hasRequests: e.target.checked })}
            >
              Đã từng đặt xe
            </Checkbox>
          </Space>
        }
      />

      <div className={styles.privacyNote}>
        SĐT và email hiển thị ở dạng đã che. Mở drawer để xem đầy đủ nếu bạn có quyền — mỗi lần
        xem được ghi vào nhật ký hệ thống.
      </div>

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách khách"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty
          className={styles.state}
          description={hasFilters ? 'Không có khách khớp bộ lọc' : 'Chưa có khách thuê nào'}
        >
          {hasFilters ? <Button onClick={() => setFilters(CLEARED)}>Xoá bộ lọc</Button> : null}
        </Empty>
      ) : (
        <AdminCustomerTable
          items={items}
          meta={meta}
          loading={isFetching}
          onView={(id) => setSelected(id)}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}

      <AdminCustomerDetailDrawer customerId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
