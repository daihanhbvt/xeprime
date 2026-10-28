import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_DROP_REASON,
  DRIVER_DROP_ZONE,
  DRIVER_INCIDENT_LEVEL,
  DRIVER_SOURCE,
  SERVICE_TYPE,
} from '@xeprime/types';

import { IntlTestProvider } from '@/i18n/test-utils';
import type { BookingDetail, BookingDriverIncident } from '../types';
import { BookingDriverSection } from './BookingDriverSection';

/**
 * Khối Tài xế trên chi tiết đơn (ADR 0063 · ADR 0074): không còn lối nhập tài xế ngoài hệ thống;
 * đơn cũ còn mang tài xế ngoài vẫn hiện và gỡ được; sự cố tài xế rút hiện thẻ khẩn kèm hạn điều
 * phối và lối "Huỷ chuyến do thiếu tài xế"; đơn trống tài xế sát giờ hiện cảnh báo.
 */

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('../hooks/use-booking-mutations', () => ({
  useAssignBookingDriver: () => ({
    mutate: mutation.mutate,
    reset: mutation.reset,
    isPending: false,
    isError: false,
    error: null,
  }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true }),
}));
vi.mock('@/features/drivers/hooks/use-drivers', () => ({
  useAssignableDrivers: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('./BookingDriverHistory', () => ({ BookingDriverHistory: () => null }));
vi.mock('./BookingStatusTransitionDialog', () => ({
  BookingStatusTransitionDialog: (props: { defaultReasonCategory?: string }) => (
    <div data-testid="cancel-dialog">{props.defaultReasonCategory}</div>
  ),
}));

const HOUR = 3_600_000;

function booking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk-1',
    code: 'DH-0001',
    status: BOOKING_STATUS.RESERVED,
    serviceType: SERVICE_TYPE.WITH_DRIVER,
    routeType: null,
    pickupAddress: null,
    destination: null,
    pickupAt: new Date(Date.now() + 48 * HOUR).toISOString(),
    returnAt: new Date(Date.now() + 56 * HOUR).toISOString(),
    driver: null,
    driverIncident: null,
    ...overrides,
  } as unknown as BookingDetail;
}

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <IntlTestProvider>
      <QueryClientProvider client={client}>
        <App>{children}</App>
      </QueryClientProvider>
    </IntlTestProvider>
  );
}

beforeEach(() => {
  mutation.mutate.mockClear();
  mutation.reset.mockClear();
});
afterEach(cleanup);

const EXTERNAL_DRIVER = {
  source: DRIVER_SOURCE.EXTERNAL,
  id: null,
  name: 'Trần Văn Ngoài',
  phone: '0912000111',
  assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
  assignedAt: new Date().toISOString(),
  respondedAt: null,
  respondBy: null,
};

function incident(overrides: Partial<BookingDriverIncident> = {}): BookingDriverIncident {
  return {
    droppedAt: new Date().toISOString(),
    reassignBy: new Date(Date.now() + HOUR).toISOString(),
    level: DRIVER_INCIDENT_LEVEL.REARRANGING,
    customerCanCancelFree: false,
    driverName: 'Lê Rút',
    reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE,
    reason: 'Sốt cao',
    zone: DRIVER_DROP_ZONE.SAME_DAY,
    ...overrides,
  };
}

describe('BookingDriverSection', () => {
  it('không còn nút nhập tài xế ngoài hệ thống', () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );
    expect(screen.getByRole('button', { name: 'Gán tài xế' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ngoài hệ thống/ })).toBeNull();
  });

  it('đơn cũ mang tài xế ngoài: hiện nhãn + ghi chú đã bỏ, bỏ gán gửi driverId null', async () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking({ driver: EXTERNAL_DRIVER })} canUpdate />
      </Harness>,
    );
    expect(screen.getByText('Ngoài hệ thống')).toBeTruthy();
    expect(screen.getByText(/XePrime không còn nhận cách này/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '0912000111' }).getAttribute('href')).toContain(
      '0912000111',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ gán' }));
    fireEvent.click(await screen.findByRole('button', { name: /OK|Đồng ý|Có/ }));
    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect((mutation.mutate.mock.calls[0] as unknown[])[0]).toEqual({ driverId: null });
  });

  it('sự cố tài xế rút: tên, lý do, hạn điều phối; nút huỷ mở hộp với nhóm "thiếu tài xế"', () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking({ driverIncident: incident() })} canUpdate />
      </Harness>,
    );
    expect(screen.getByText('Tài xế Lê Rút đã rút khỏi chuyến')).toBeTruthy();
    expect(screen.getByText(/Lý do: Sức khoẻ — “Sốt cao”/)).toBeTruthy();
    expect(screen.getByText(/Gán tài xế liên kết khác trước/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ chuyến do thiếu tài xế' }));
    expect(screen.getByTestId('cancel-dialog').textContent).toBe(
      CANCELLATION_REASON_CATEGORY.DRIVER_UNAVAILABLE,
    );
  });

  it('sự cố quá hạn điều phối: nói rõ khách đang được huỷ hoàn 100%; không chồng cảnh báo 2 giờ', () => {
    render(
      <Harness>
        <BookingDriverSection
          booking={booking({
            pickupAt: new Date(Date.now() + HOUR).toISOString(),
            driverIncident: incident({
              level: DRIVER_INCIDENT_LEVEL.URGENT,
              customerCanCancelFree: true,
            }),
          })}
          canUpdate
        />
      </Harness>,
    );
    expect(screen.getByText(/khách đang được huỷ hoàn 100%/)).toBeTruthy();
    expect(screen.queryByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeNull();
  });

  it('chưa có tài xế và còn dưới 2 giờ tới giờ nhận ⇒ cảnh báo; còn xa thì không', () => {
    const { unmount } = render(
      <Harness>
        <BookingDriverSection
          booking={booking({ pickupAt: new Date(Date.now() + HOUR).toISOString() })}
          canUpdate
        />
      </Harness>,
    );
    expect(screen.getByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeTruthy();
    unmount();

    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );
    expect(screen.queryByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeNull();
  });

  it('đơn đã giao xe: chỉ đọc, không có nút gán / huỷ do thiếu tài xế', () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking({ status: BOOKING_STATUS.ACTIVE })} canUpdate />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: 'Gán tài xế' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Huỷ chuyến do thiếu tài xế' })).toBeNull();
  });
});
