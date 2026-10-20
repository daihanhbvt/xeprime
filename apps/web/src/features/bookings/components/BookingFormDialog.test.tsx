import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { BOOKING_STATUS } from '@xeprime/types';

import { IntlTestProvider } from '@/i18n/test-utils';
import type { BookingDetail } from '../types';
import { BookingFormDialog } from './BookingFormDialog';

/**
 * Hợp đồng form SỬA đơn (quyết định sản phẩm 19/10/2026): chỉ gửi đúng bốn trường server còn
 * nhận — gửi thêm thời gian/dịch vụ/giá là 400 (`forbidNonWhitelisted`).
 */

const mutations = vi.hoisted(() => ({
  update: vi.fn(async () => ({})),
  assign: vi.fn(async () => ({})),
}));
vi.mock('../hooks/use-booking-mutations', () => ({
  useUpdateBooking: () => ({ mutateAsync: mutations.update, isPending: false }),
  useAssignBookingDriver: () => ({ mutateAsync: mutations.assign, isPending: false }),
}));
/** Người sửa đơn có quyền xem tài xế — ô chọn tài xế cần `DRIVER_VIEW` (như app native). */
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true }),
}));
vi.mock('@/features/drivers/hooks/use-drivers', () => ({
  useAssignableDrivers: () => ({ data: [], isLoading: false, isError: false }),
}));

const EDITING = {
  id: 'bk-1',
  code: 'DH-0001',
  status: BOOKING_STATUS.RESERVED,
  vehicleId: 'veh-1',
  vehicleName: 'Xe A',
  vehiclePlate: '51A-00001',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  serviceType: 'self_drive',
  routeType: null,
  pickupAt: '2026-09-03T05:00:00.000Z',
  returnAt: '2026-09-06T05:00:00.000Z',
  totalAmount: '1000000',
  depositAmount: null,
  note: null,
  driver: null,
} as unknown as BookingDetail;

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
  mutations.update.mockClear();
  mutations.assign.mockClear();
});
afterEach(cleanup);

describe('BookingFormDialog — sửa đơn', () => {
  it('chỉ gửi tên, SĐT, cọc, ghi chú; không gọi gán tài xế khi đơn tự lái', async () => {
    render(
      <Harness>
        <BookingFormDialog open editing={EDITING} onClose={vi.fn()} />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(mutations.update).toHaveBeenCalled());
    const body = (mutations.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['customerName', 'customerPhone', 'note']);
    expect(mutations.assign).not.toHaveBeenCalled();
    // Không còn ô Tài xế với đơn không phải `with_driver`.
    expect(screen.queryByRole('combobox', { name: 'Tài xế' })).toBeNull();
  });

  it('đơn có tài xế hiện ô chọn tài xế', () => {
    render(
      <Harness>
        <BookingFormDialog
          open
          editing={{ ...EDITING, serviceType: 'with_driver' } as BookingDetail}
          onClose={vi.fn()}
        />
      </Harness>,
    );
    expect(screen.getByRole('combobox', { name: 'Tài xế' })).toBeTruthy();
  });
});
