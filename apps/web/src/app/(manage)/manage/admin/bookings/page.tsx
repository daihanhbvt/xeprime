'use client';

import { Button, DatePicker, Empty, Input, Result, Select, Space, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ADMIN_BOOKINGS_DEFAULT_LIMIT } from '@/features/admin-bookings/api';
import { BOOKING_DATE_FIELD } from '@xeprime/types';
import {
  ADMIN_BOOKING_DATE_FIELD_OPTIONS,
  ADMIN_BOOKING_STATUS_OPTIONS,
} from '@/features/admin-bookings/constants';
import { AdminBookingDetailDrawer } from '@/features/admin-bookings/components/AdminBookingDetailDrawer';
import { AdminBookingTable } from '@/features/admin-bookings/components/AdminBookingTable';
import { useAdminBookingFilters } from '@/features/admin-bookings/hooks/use-admin-booking-filters';
import { useAdminBookings } from '@/features/admin-bookings/hooks/use-admin-bookings';
import type { AdminBookingFilters } from '@/features/admin-bookings/types';
import { DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';
import styles from './bookings-page.module.css';

const CLEARED: Partial<AdminBookingFilters> = {
  q: undefined,
  phone: undefined,
  tenantId: undefined,
  vehicleId: undefined,
  status: 'all',
  dateFrom: undefined,
  dateTo: undefined,
};

export default function AdminBookingsPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <AdminBookingsView />
    </Suspense>
  );
}

function AdminBookingsView() {
  const { filters, setFilters } = useAdminBookingFilters();
  const { data, isError, refetch, isFetching } = useAdminBookings(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_BOOKINGS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const hasFilters = Boolean(
    filters.q ||
      filters.phone ||
      filters.tenantId ||
      filters.vehicleId ||
      (filters.status && filters.status !== 'all') ||
      filters.dateFrom ||
      filters.dateTo,
  );

  const range: [Dayjs | null, Dayjs | null] = [
    filters.dateFrom ? dayjs(filters.dateFrom, DAY_PARAM_FORMAT) : null,
    filters.dateTo ? dayjs(filters.dateTo, DAY_PARAM_FORMAT) : null,
  ];

  return (
    <div>
      <ManagePageHeader
        title="Đơn thuê toàn hệ thống"
        extra={
          <Space wrap>
            <Input.Search
              className={styles.search}
              size="large"
              allowClear
              placeholder="Tìm mã đơn / tên khách"
              defaultValue={filters.q}
              onSearch={(value) => setFilters({ q: value.trim() || undefined })}
            />
            <Input.Search
              className={styles.phone}
              size="large"
              allowClear
              placeholder="Tra đúng SĐT khách"
              defaultValue={filters.phone}
              onSearch={(value) => setFilters({ phone: value.trim() || undefined })}
            />
            <Select
              className={styles.statusSelect}
              size="large"
              value={filters.status ?? 'all'}
              options={ADMIN_BOOKING_STATUS_OPTIONS}
              onChange={(value: string) => setFilters({ status: value })}
            />
            <Select
              className={styles.dateFieldSelect}
              size="large"
              value={filters.dateField ?? BOOKING_DATE_FIELD.CREATED_AT}
              options={ADMIN_BOOKING_DATE_FIELD_OPTIONS}
              onChange={(value: string) => setFilters({ dateField: value })}
            />
            <DatePicker.RangePicker
              className={styles.rangePicker}
              size="large"
              allowEmpty={[true, true]}
              value={range}
              format="DD/MM/YYYY"
              onChange={(dates) =>
                setFilters({
                  dateFrom: dates?.[0] ? dates[0].format(DAY_PARAM_FORMAT) : undefined,
                  dateTo: dates?.[1] ? dates[1].format(DAY_PARAM_FORMAT) : undefined,
                })
              }
            />
          </Space>
        }
      />

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách đơn thuê"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty
          className={styles.state}
          description={hasFilters ? 'Không có đơn khớp bộ lọc' : 'Chưa có đơn thuê nào'}
        >
          {hasFilters ? <Button onClick={() => setFilters(CLEARED)}>Xoá bộ lọc</Button> : null}
        </Empty>
      ) : (
        <AdminBookingTable
          items={items}
          meta={meta}
          loading={isFetching}
          onView={(id) => setSelected(id)}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}

      <AdminBookingDetailDrawer bookingId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
