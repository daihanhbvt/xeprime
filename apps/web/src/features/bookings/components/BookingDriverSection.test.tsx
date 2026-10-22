import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  BOOKING_STATUS,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_SOURCE,
  SERVICE_TYPE,
} from '@xeprime/types';

import { IntlTestProvider } from '@/i18n/test-utils';
import type { BookingDetail } from '../types';
import { BookingDriverSection } from './BookingDriverSection';

/**
 * Khối Tài xế trên chi tiết đơn — phần tài xế NGOÀI HỆ THỐNG (ADR 0067): nhập tên + SĐT gửi đúng
 * MỘT khoá `externalDriver`, form chặn SĐT sai trước khi gọi server, tài xế ngoài hiện nhãn
 * "Ngoài hệ thống", và đơn trống tài xế sát giờ nhận hiện cảnh báo.
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

describe('BookingDriverSection — tài xế ngoài hệ thống (ADR 0067)', () => {
  it('nhập tên + SĐT ⇒ gửi đúng một khoá externalDriver (đã cắt khoảng trắng)', async () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nhập tài xế ngoài hệ thống' }));
    fireEvent.change(await screen.findByLabelText('Tên tài xế'), {
      target: { value: '  Nguyễn Văn Tài ' },
    });
    fireEvent.change(screen.getByLabelText('Số điện thoại'), {
      target: { value: '0912 345 678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tài xế' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    const body = (mutation.mutate.mock.calls[0] as unknown[])[0];
    expect(body).toEqual({ externalDriver: { name: 'Nguyễn Văn Tài', phone: '0912345678' } });
  });

  it('SĐT sai ⇒ báo lỗi ở form, không gọi server', async () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nhập tài xế ngoài hệ thống' }));
    fireEvent.change(await screen.findByLabelText('Tên tài xế'), {
      target: { value: 'Nguyễn Văn Tài' },
    });
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tài xế' }));

    expect(await screen.findByText('Số điện thoại di động không hợp lệ')).toBeTruthy();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('tài xế ngoài đang ghi: hiện nhãn "Ngoài hệ thống", SĐT gọi được, nút Sửa điền sẵn', async () => {
    render(
      <Harness>
        <BookingDriverSection
          booking={booking({
            driver: {
              source: DRIVER_SOURCE.EXTERNAL,
              id: null,
              name: 'Trần Văn Ngoài',
              phone: '0912000111',
              assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
              assignedAt: new Date().toISOString(),
              respondedAt: null,
              respondBy: null,
            },
          })}
          canUpdate
        />
      </Harness>,
    );

    expect(screen.getByText('Ngoài hệ thống')).toBeTruthy();
    expect(screen.getByRole('link', { name: '0912000111' }).getAttribute('href')).toContain(
      '0912000111',
    );
    // Không hiện nhãn lượt gán của tài xế liên kết.
    expect(screen.queryByText('Tài xế đã nhận')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const name = (await screen.findByLabelText('Tên tài xế')) as HTMLInputElement;
    expect(name.value).toBe('Trần Văn Ngoài');
  });

  it('thay tài xế LIÊN KẾT đang gán: hộp thoại báo trước người đó sẽ bị gỡ', async () => {
    render(
      <Harness>
        <BookingDriverSection
          booking={booking({
            driver: {
              source: DRIVER_SOURCE.LINKED,
              id: 'drv-1',
              name: 'Lê Liên Kết',
              phone: '0912000222',
              assignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
              assignedAt: new Date().toISOString(),
              respondedAt: null,
              respondBy: new Date(Date.now() + HOUR).toISOString(),
            },
          })}
          canUpdate
        />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nhập tài xế ngoài hệ thống' }));
    expect(
      await screen.findByText(
        'Lê Liên Kết đang được gán cho chuyến này sẽ bị gỡ và nhận thông báo.',
      ),
    ).toBeTruthy();
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

  it('đơn đã giao xe: chỉ đọc, không có nút nhập tài xế ngoài', () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking({ status: BOOKING_STATUS.ACTIVE })} canUpdate />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: 'Nhập tài xế ngoài hệ thống' })).toBeNull();
  });
});
