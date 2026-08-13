'use client';

import { App, Select, Spin } from 'antd';
import { Suspense } from 'react';
import { API_ERROR_CODE } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { BOOKING_REQUESTS_DEFAULT_LIMIT } from '@/features/booking-requests/api';
import { BOOKING_REQUEST_STATUS_OPTIONS } from '@/features/booking-requests/constants';
import { BookingRequestTable } from '@/features/booking-requests/components/BookingRequestTable';
import { useBookingRequestFilters } from '@/features/booking-requests/hooks/use-booking-request-filters';
import { useBookingRequests } from '@/features/booking-requests/hooks/use-booking-requests';
import {
  useApproveBookingRequest,
  useRejectBookingRequest,
} from '@/features/booking-requests/hooks/use-booking-request-mutations';
import styles from './booking-requests-page.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...BOOKING_REQUEST_STATUS_OPTIONS,
];

export default function BookingRequestsPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <BookingRequestsView />
    </Suspense>
  );
}

function BookingRequestsView() {
  const { message } = App.useApp();
  const { filters, setFilters } = useBookingRequestFilters();
  const { data, isError, refetch, isFetching } = useBookingRequests(filters);
  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: BOOKING_REQUESTS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };

  const actingId = approve.isPending
    ? (approve.variables ?? null)
    : reject.isPending
      ? (reject.variables?.id ?? null)
      : null;

  function handleApprove(id: string) {
    approve.mutate(id, {
      onSuccess: () => message.success('Đã duyệt — đã tạo đơn thuê'),
      onError: (err) => {
        const code = getErrorCode(err);
        message.error(
          code === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT
            ? 'Xe đã bận khung giờ này, không thể duyệt'
            : getErrorMessage(err),
        );
      },
    });
  }

  function handleReject(id: string) {
    reject.mutate(
      { id },
      {
        onSuccess: () => message.success('Đã từ chối yêu cầu'),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <div>
      <ManagePageHeader
        title="Đơn đặt xe"
        extra={
          <Select
            className={styles.statusSelect}
            size="large"
            value={filters.status ?? 'all'}
            options={STATUS_OPTIONS}
            onChange={(value: string) =>
              setFilters({ status: value === 'all' ? undefined : value })
            }
          />
        }
      />

      <BookingRequestTable
        items={items}
        meta={meta}
        loading={isFetching}
        actingId={actingId}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        onApprove={handleApprove}
        onReject={handleReject}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
