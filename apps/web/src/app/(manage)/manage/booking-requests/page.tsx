'use client';

import { App, Select, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { API_ERROR_CODE, SERVICE_TYPE } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { BOOKING_REQUESTS_DEFAULT_LIMIT } from '@/features/booking-requests/api';
import { BOOKING_REQUEST_STATUS_OPTIONS } from '@/features/booking-requests/constants';
import { ApproveLongTermDialog } from '@/features/booking-requests/components/ApproveLongTermDialog';
import { BookingRequestTable } from '@/features/booking-requests/components/BookingRequestTable';
import { useBookingRequestFilters } from '@/features/booking-requests/hooks/use-booking-request-filters';
import { useBookingRequests } from '@/features/booking-requests/hooks/use-booking-requests';
import {
  useApproveBookingRequest,
  useRejectBookingRequest,
} from '@/features/booking-requests/hooks/use-booking-request-mutations';
import type {
  ApproveBookingRequestInput,
  BookingRequestItem,
} from '@/features/booking-requests/types';
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

  /** Yêu cầu dài hạn đang chờ chốt lịch trong hộp thoại duyệt. */
  const [longTermTarget, setLongTermTarget] = useState<BookingRequestItem | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const actingId = approve.isPending
    ? (approve.variables?.id ?? null)
    : reject.isPending
      ? (reject.variables?.id ?? null)
      : null;

  function approveErrorText(err: unknown): string {
    return getErrorCode(err) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT
      ? 'Xe đã bận khung giờ này — chọn ngày giờ nhận khác hoặc từ chối yêu cầu.'
      : getErrorMessage(err);
  }

  /**
   * Dịch vụ theo ngày: lịch đã có trên yêu cầu → duyệt thẳng. THUÊ DÀI HẠN: khách mới nêu
   * nguyện vọng, gian hàng phải chốt ngày giờ nhận trong hộp thoại (ADR 0011).
   */
  function handleApprove(row: BookingRequestItem) {
    setApproveError(null);
    if (row.serviceType === SERVICE_TYPE.LONG_TERM) {
      setLongTermTarget(row);
      return;
    }
    approve.mutate(
      { id: row.id },
      {
        onSuccess: () => message.success('Đã duyệt — đã tạo đơn thuê'),
        onError: (err) => message.error(approveErrorText(err)),
      },
    );
  }

  function confirmLongTerm(body: ApproveBookingRequestInput) {
    if (!longTermTarget) return;
    setApproveError(null);
    approve.mutate(
      { id: longTermTarget.id, body },
      {
        onSuccess: () => {
          message.success('Đã duyệt — đã tạo đơn thuê dài hạn');
          setLongTermTarget(null);
        },
        // Trùng lịch (409): GIỮ hộp thoại mở để chọn giờ khác, không mất dữ liệu đã nhập.
        onError: (err) => setApproveError(approveErrorText(err)),
      },
    );
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

      <ApproveLongTermDialog
        request={longTermTarget}
        submitting={approve.isPending}
        error={approveError}
        onCancel={() => {
          setLongTermTarget(null);
          setApproveError(null);
        }}
        onConfirm={confirmLongTerm}
      />
    </div>
  );
}
