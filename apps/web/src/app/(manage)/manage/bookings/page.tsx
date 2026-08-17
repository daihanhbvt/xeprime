'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { bookingPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { BOOKINGS_DEFAULT_LIMIT } from '@/features/bookings/api';
import { BOOKING_SORT_OPTIONS, BOOKING_STATUS_OPTIONS } from '@/features/bookings/constants';
import { BookingFormDialog } from '@/features/bookings/components/BookingFormDialog';
import { BookingTable } from '@/features/bookings/components/BookingTable';
import { useBookingFilters } from '@/features/bookings/hooks/use-booking-filters';
import { useBookings } from '@/features/bookings/hooks/use-bookings';
import type { BookingDetail, BookingFilters, BookingSort } from '@/features/bookings/types';
import styles from './bookings-page.module.css';

const STATUS_OPTIONS = [{ value: 'all', label: 'Tất cả trạng thái' }, ...BOOKING_STATUS_OPTIONS];

const FILTER_FIELDS: readonly FilterField[] = [
  {
    kind: 'search',
    key: 'q',
    label: 'Tìm kiếm đơn thuê',
    placeholder: 'Tìm theo tên khách, SĐT, mã đơn',
  },
  {
    kind: 'select',
    key: 'status',
    label: 'Trạng thái',
    allowClear: false,
    options: STATUS_OPTIONS,
  },
  {
    kind: 'select',
    key: 'sort',
    label: 'Sắp xếp',
    allowClear: false,
    options: BOOKING_SORT_OPTIONS,
  },
];

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

  function changeFilters(patch: FilterValues) {
    const next: Partial<BookingFilters> = {};
    if ('q' in patch) next.q = patch.q;
    if ('status' in patch) next.status = patch.status === 'all' ? undefined : patch.status;
    if ('sort' in patch) next.sort = patch.sort as BookingSort | undefined;
    setFilters(next);
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

      <FilterBar
        fields={FILTER_FIELDS}
        values={{
          q: filters.q,
          status: filters.status ?? 'all',
          sort: filters.sort ?? 'newest',
        }}
        onChange={changeFilters}
        searchDebounceMs={300}
      />

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
