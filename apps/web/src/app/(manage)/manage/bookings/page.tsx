'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Result, Select, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { BOOKINGS_DEFAULT_LIMIT } from '@/features/bookings/api';
import { BOOKING_SORT_OPTIONS, BOOKING_STATUS_OPTIONS } from '@/features/bookings/constants';
import { BookingDetailDrawer } from '@/features/bookings/components/BookingDetailDrawer';
import { BookingFormDrawer } from '@/features/bookings/components/BookingFormDrawer';
import { BookingTable } from '@/features/bookings/components/BookingTable';
import { useBookingFilters } from '@/features/bookings/hooks/use-booking-filters';
import { useBookings } from '@/features/bookings/hooks/use-bookings';
import type { BookingDetail, BookingSort } from '@/features/bookings/types';
import styles from './bookings-page.module.css';

const STATUS_OPTIONS = [{ value: 'all', label: 'Tất cả trạng thái' }, ...BOOKING_STATUS_OPTIONS];

export default function BookingsPage() {
  // useBookingFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <BookingsView />
    </Suspense>
  );
}

function BookingsView() {
  const { has } = usePermissions();
  const { filters, setFilters } = useBookingFilters();
  const { data, isError, refetch, isFetching } = useBookings(filters);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BookingDetail | null>(null);

  const canCreate = has(PERMISSION.BOOKING_CREATE);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: BOOKINGS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(filters.q || filters.status);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(booking: BookingDetail) {
    setDetailId(null);
    setEditing(booking);
    setFormOpen(true);
  }

  return (
    <div>
      <ManagePageHeader
        title="Đơn thuê"
        extra={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Tạo đơn
            </Button>
          ) : null
        }
      />

      <div className={styles.filters}>
        <Input.Search
          className={styles.search}
          allowClear
          size="large"
          placeholder="Tìm theo tên khách, SĐT, mã đơn"
          defaultValue={filters.q}
          onSearch={(value) => setFilters({ q: value || undefined })}
        />
        <Select
          className={styles.select}
          size="large"
          value={filters.status ?? 'all'}
          options={STATUS_OPTIONS}
          onChange={(value: string) => setFilters({ status: value === 'all' ? undefined : value })}
        />
        <Select
          className={styles.select}
          size="large"
          value={filters.sort ?? 'newest'}
          options={BOOKING_SORT_OPTIONS as unknown as { value: string; label: string }[]}
          onChange={(value: BookingSort) => setFilters({ sort: value })}
        />
      </div>

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách đơn"
          subTitle="Có lỗi khi lấy dữ liệu. Vui lòng thử lại."
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        hasFilters ? (
          <Empty className={styles.state} description="Không tìm thấy đơn khớp bộ lọc">
            <Button onClick={() => setFilters({ q: undefined, status: undefined })}>
              Xoá bộ lọc
            </Button>
          </Empty>
        ) : (
          <Empty className={styles.state} description="Gian hàng chưa có đơn thuê nào">
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Tạo đơn đầu tiên
              </Button>
            ) : null}
          </Empty>
        )
      ) : (
        <BookingTable
          items={items}
          meta={meta}
          loading={isFetching}
          onView={(id) => setDetailId(id)}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}

      <BookingDetailDrawer bookingId={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} />
      <BookingFormDrawer open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}
