'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Input, Select, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { bookingPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { BOOKINGS_DEFAULT_LIMIT } from '@/features/bookings/api';
import { BOOKING_SORT_OPTIONS, BOOKING_STATUS_OPTIONS } from '@/features/bookings/constants';
import { BookingFormDialog } from '@/features/bookings/components/BookingFormDialog';
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
  const router = useRouter();
  const { has } = usePermissions();
  const { filters, setFilters } = useBookingFilters();
  const { data, isError, refetch, isFetching } = useBookings(filters);

  // Danh sách chỉ còn TẠO đơn; sửa nằm ở trang chi tiết, nơi có đủ ngữ cảnh của chuyến.
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

      <BookingTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters({ q: undefined, status: undefined })}
        emptyAction={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Tạo đơn đầu tiên
            </Button>
          ) : undefined
        }
        /*
         * Wave 10: bấm xem đi thẳng tới TRANG chi tiết thay vì mở drawer. Vận hành một chuyến
         * kéo dài nhiều ngày, nhiều người cùng nhìn và người ta gửi link cho nhau — một drawer
         * không có URL không phục vụ được việc đó. Chỉ còn MỘT bản chi tiết đơn.
         */
        onView={(id) => router.push(bookingPath.detail(id))}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <BookingFormDialog open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}
